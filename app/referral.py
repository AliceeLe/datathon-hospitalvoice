"""Non-emergency referral flow (hackathon scope). DEMO DATA ONLY.

Tables (workspace.datathon): coordinated_cases (one row per referral, holds the patient details),
call_attempts (append-only call log), appointments. Every query filters by the signed-in
coordinator's email.
"""
import json, time, uuid
from datetime import datetime, timedelta, timezone

from flask import Blueprint, jsonify, request
from databricks.sdk import WorkspaceClient

bp = Blueprint("referral", __name__, url_prefix="/api/ref")

WAREHOUSE_ID = "e3b50d583a2daca3"
S = "workspace.datathon"
IST = timezone(timedelta(hours=5, minutes=30))  # India has no daylight saving
CALL_RESULTS = {"accepted_slot", "accepted_needs_prep", "turned_away", "no_answer"}
REFUSAL_REASONS = {"no_machine", "no_doctor", "no_bed", "too_expensive", "other"}
PENALTY_REASONS = ("no_machine", "no_doctor", "no_bed")   # counted for the search warning/penalty
SERVICES = {"mri", "dialysis"}

_w = None


def _client():
    global _w
    if _w is None:
        _w = WorkspaceClient()
    return _w


def _param(name, v):
    if v is None:
        return {"name": name}
    if isinstance(v, bool):
        return {"name": name, "value": "true" if v else "false", "type": "BOOLEAN"}
    if isinstance(v, int):
        return {"name": name, "value": str(v), "type": "INT"}
    return {"name": name, "value": str(v)}


def q(sql, **params):
    """Run SQL with parameter markers (user text never goes into the SQL string)."""
    w = _client()
    r = w.api_client.do("POST", "/api/2.0/sql/statements", body={
        "warehouse_id": WAREHOUSE_ID, "statement": sql, "wait_timeout": "30s",
        "parameters": [_param(k, v) for k, v in params.items()]})
    state = (r.get("status") or {}).get("state")
    for _ in range(60):
        if state not in ("PENDING", "RUNNING"):
            break
        time.sleep(1)
        r = w.api_client.do("GET", f"/api/2.0/sql/statements/{r['statement_id']}")
        state = (r.get("status") or {}).get("state")
    if state != "SUCCEEDED":
        raise RuntimeError(((r.get("status") or {}).get("error") or {}).get("message", state))
    cols = (r.get("manifest") or {}).get("schema", {}).get("columns", [])
    out = []
    for row in (r.get("result") or {}).get("data_array") or []:
        d = {}
        for c, v in zip(cols, row):
            t = c.get("type_name")
            if v is not None and t in ("INT", "LONG", "SHORT"):
                v = int(v)
            elif v is not None and t == "BOOLEAN":
                v = v == "true"
            elif v is not None and t == "TIMESTAMP":
                v = v.replace(" ", "T").split("+")[0].rstrip("Z") + "Z"
            d[c["name"]] = v
        out.append(d)
    return out


def now():
    return datetime.now(timezone.utc)


def ts(dt):
    return None if dt is None else dt.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def parse_ist(s):
    """'YYYY-MM-DDTHH:MM' entered by the coordinator, in India time."""
    try:
        return datetime.strptime((s or "")[:16], "%Y-%m-%dT%H:%M").replace(tzinfo=IST)
    except ValueError:
        return None


def parse_utc(s):
    return datetime.strptime(s[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc) if s else None


def ist_label(dt):
    return dt.astimezone(IST).strftime("%a %d %b, %I:%M %p")


def uid():
    return str(uuid.uuid4())


def me():
    email = request.headers.get("X-Forwarded-Email")
    if not email:
        raise PermissionError("Not signed in")
    return email


def clean(v, n=1000):
    v = (str(v).strip() if v is not None else "")[:n]
    return v or None


def err(msg, code=400):
    return jsonify({"error": msg}), code


@bp.errorhandler(PermissionError)
def _perm(e):
    return err(str(e), 403)


@bp.errorhandler(Exception)
def _any(e):
    return err(str(e), 500)


def insert(table, row):
    cols, marks, params = [], [], {}
    for k, v in row.items():
        cols.append(k)
        if isinstance(v, datetime):
            marks.append(f"CAST(:{k} AS TIMESTAMP)")
            params[k] = ts(v)
        else:
            marks.append(f":{k}")
            params[k] = v
    q(f"INSERT INTO {S}.{table} ({', '.join(cols)}) VALUES ({', '.join(marks)})", **params)


def get_case(case_id, email):
    rows = q(f"""SELECT case_id, status, service_code, hospital_id, hospital_sent_to AS hospital_name,
                        suggested_hospitals, patient_need, search_address, patient_name, age_years,
                        patient_phone, case_description, consent_to_reminders, is_emergency,
                        created_at, updated_at
                 FROM {S}.coordinated_cases WHERE case_id = :id AND coordinator_email = :me""",
             id=case_id, me=email)
    if not rows:
        raise PermissionError("Case not found")
    c = rows[0]
    try:
        c["suggested_hospitals"] = json.loads(c["suggested_hospitals"]) if c["suggested_hospitals"] else []
    except ValueError:
        c["suggested_hospitals"] = []
    return c


def touch(case_id, email, **cols):
    sets = ", ".join(f"{k} = :{k}" for k in cols) + ", updated_at = current_timestamp()"
    q(f"UPDATE {S}.coordinated_cases SET {sets} WHERE case_id = :id AND coordinator_email = :me",
      id=case_id, me=email, **cols)


def refusal_counts(email, ids):
    """Recent refusals (no machine / no doctor / no bed, last 30 days) from this coordinator's calls."""
    ids = [i for i in dict.fromkeys(ids) if i]
    if not ids:
        return {}
    marks = ", ".join(f":h{i}" for i in range(len(ids)))
    rows = q(f"""SELECT hospital_id, count(*) AS n, mode(refusal_reason) AS top_reason
                 FROM {S}.call_attempts
                 WHERE coordinator_email = :me AND result = 'turned_away'
                   AND refusal_reason IN ('no_machine', 'no_doctor', 'no_bed')
                   AND attempted_at >= current_timestamp() - INTERVAL 30 DAYS
                   AND hospital_id IN ({marks})
                 GROUP BY hospital_id""", me=email, **{f"h{i}": v for i, v in enumerate(ids)})
    return {r["hospital_id"]: {"n": r["n"], "top_reason": r["top_reason"]} for r in rows}


def next_hospital(case, email):
    tried = {r["hospital_id"] for r in q(
        f"SELECT DISTINCT hospital_id FROM {S}.call_attempts WHERE case_id = :id AND coordinator_email = :me",
        id=case["case_id"], me=email)}
    for h in case["suggested_hospitals"]:
        if h.get("id") and h["id"] not in tried and h["id"] != case["hospital_id"]:
            return h
    return None


# ── 1. pick a hospital → draft case ─────────────────────────────────────────────
@bp.post("/start")
def start():
    email, b = me(), request.get_json(force=True) or {}
    h = b.get("hospital") or {}
    if not (h.get("id") or h.get("name")):
        return err("Pick a hospital first")
    cands = [{k: c.get(k) for k in ("id", "name", "phone", "phone_raw", "km", "address")}
             for c in (b.get("candidates") or [])][:15]
    service = b.get("service_code") if b.get("service_code") in SERVICES else "mri"
    case_id = uid()
    insert("coordinated_cases", {
        "case_id": case_id, "created_at": now(), "updated_at": now(), "coordinator_email": email,
        "hospital_id": clean(h.get("id")), "hospital_sent_to": clean(h.get("name")), "service_code": service,
        "status": "calling", "is_emergency": bool(b.get("emergency")), "patient_need": clean(b.get("need")),
        "search_address": clean(b.get("address")), "treatment_frequency": clean(b.get("frequency")),
        "suggested_hospitals": json.dumps(cands), "genie_conversation_id": clean(b.get("conversation_id"))})
    return jsonify({"case_id": case_id})


# ── 1. log a call result (append-only row) ──────────────────────────────────────
@bp.post("/case/<case_id>/call")
def log_call(case_id):
    email, b = me(), request.get_json(force=True) or {}
    case = get_case(case_id, email)
    result = b.get("result")
    if result not in CALL_RESULTS:
        return err("Unknown call result")
    reason = b.get("refusal_reason") if result == "turned_away" else None
    if result == "turned_away" and reason not in REFUSAL_REASONS:
        return err("Pick a reason")
    accepted = result.startswith("accepted")
    appt_at = parse_ist(b.get("appointment_at")) if accepted else None
    bring = clean(b.get("what_to_bring")) if accepted else None
    if accepted and not (appt_at and bring):
        return err("Date and 'what to bring' are needed")
    insert("call_attempts", {
        "attempt_id": uid(), "case_id": case_id, "coordinator_email": email,
        "hospital_id": case["hospital_id"], "hospital_name": case["hospital_name"], "attempted_at": now(),
        "channel": "phone", "result": result, "refusal_reason": reason, "note": clean(b.get("note")),
        "callback_at": None, "appointment_at": appt_at, "what_to_bring": bring,
        "spoke_to": clean(b.get("spoke_to")), "prep_steps": clean(b.get("prep_steps")),
        "cost_or_scheme": clean(b.get("cost_or_scheme"), 300)})
    out = {"ok": True}
    if result == "turned_away":
        touch(case_id, email, status="turned_away")
        out["next"] = next_hospital(case, email)
    elif accepted:
        service = b.get("service_code") if b.get("service_code") in SERVICES else case["service_code"]
        touch(case_id, email, status="accepted", service_code=service)
    return jsonify(out)


@bp.post("/case/<case_id>/hospital")
def switch_hospital(case_id):
    email, b = me(), request.get_json(force=True) or {}
    get_case(case_id, email)
    h = b.get("hospital") or {}
    touch(case_id, email, hospital_id=clean(h.get("id")), hospital_sent_to=clean(h.get("name")), status="calling")
    return jsonify({"ok": True})


# ── 1. confirm sent + patient details → appointment ────────────────────────────
@bp.post("/case/<case_id>/confirm")
def confirm(case_id):
    email, b = me(), request.get_json(force=True) or {}
    case = get_case(case_id, email)
    acc = q(f"""SELECT * FROM {S}.call_attempts WHERE case_id = :id AND coordinator_email = :me
                AND result IN ('accepted_slot', 'accepted_needs_prep') ORDER BY attempted_at DESC LIMIT 1""",
            id=case_id, me=email)
    if not acc:
        return err("Log what the hospital said first")
    acc = acc[0]
    name, phone = clean(b.get("name_or_code"), 120), clean(b.get("phone"), 40)
    if not name or not phone:
        return err("Name (or case code) and phone are needed")
    age = None
    if str(b.get("age_years") or "").strip():
        try:
            age = int(b.get("age_years"))
        except ValueError:
            return err("Age must be a number")
    when = parse_utc(acc["appointment_at"])
    if case["status"] != "booked":
        insert("appointments", {
            "appointment_id": uid(), "case_id": case_id, "coordinator_email": email,
            "hospital_id": case["hospital_id"], "hospital_name": case["hospital_name"],
            "service_code": case["service_code"], "scheduled_at": when, "series_id": None, "sequence_no": 1,
            "source": "call", "status": "scheduled", "reminder_call_done_at": None,
            "created_at": now(), "updated_at": now()})
    touch(case_id, email, status="booked", patient_name=name, age_years=age, patient_phone=phone,
          case_description=clean(b.get("condition")) or case["patient_need"],
          consent_to_reminders=bool(b.get("consent")))
    return jsonify(case_detail(case_id, email))


def case_detail(case_id, email):
    c = get_case(case_id, email)
    c.pop("suggested_hospitals", None)
    c["appointments"] = q(f"""SELECT appointment_id, hospital_name, scheduled_at, status, reminder_call_done_at
                              FROM {S}.appointments WHERE case_id = :id AND coordinator_email = :me
                              ORDER BY scheduled_at""", id=case_id, me=email)
    c["attempts"] = q(f"""SELECT hospital_name, attempted_at, result, refusal_reason, appointment_at, what_to_bring,
                                 spoke_to, prep_steps, cost_or_scheme
                          FROM {S}.call_attempts WHERE case_id = :id AND coordinator_email = :me
                          ORDER BY attempted_at""", id=case_id, me=email)
    return c


@bp.get("/case/<case_id>")
def get_case_detail(case_id):
    return jsonify(case_detail(case_id, me()))


# ── 2. Referral Tracker: upcoming appointments + patients ─────────────────────
@bp.get("/tracker")
def tracker():
    email = me()
    d = now().astimezone(IST).date()
    today_start = datetime(d.year, d.month, d.day, tzinfo=IST)
    # Calendar window: 60 days back to 120 days ahead
    appts = q(f"""SELECT a.appointment_id, a.case_id, a.hospital_name, a.service_code, a.scheduled_at,
                         a.reminder_call_done_at, c.patient_name, c.patient_phone, c.consent_to_reminders,
                         COALESCE(c.case_description, c.patient_need) AS condition
                  FROM {S}.appointments a
                  JOIN {S}.coordinated_cases c ON c.case_id = a.case_id AND c.coordinator_email = :me
                  WHERE a.coordinator_email = :me AND a.status = 'scheduled'
                    AND a.scheduled_at >= CAST(:f0 AS TIMESTAMP) AND a.scheduled_at < CAST(:f1 AS TIMESTAMP)
                  ORDER BY a.scheduled_at LIMIT 500""",
              me=email, f0=ts(today_start - timedelta(days=60)), f1=ts(today_start + timedelta(days=120)))
    cases = q(f"""SELECT c.case_id, c.status, c.service_code, c.hospital_sent_to AS hospital_name, c.patient_name,
                         c.age_years, c.patient_phone, COALESCE(c.case_description, c.patient_need) AS condition,
                         COALESCE(c.patient_address, c.search_address) AS address, c.secondary_contacts, c.care_program,
                         c.genie_conversation_id,
                         c.consent_to_reminders, c.is_emergency, c.created_at, c.updated_at,
                         (SELECT min(a.scheduled_at) FROM {S}.appointments a
                           WHERE a.case_id = c.case_id AND a.coordinator_email = :me AND a.status = 'scheduled'
                             AND a.scheduled_at >= CAST(:t0 AS TIMESTAMP)) AS next_visit
                  FROM {S}.coordinated_cases c WHERE c.coordinator_email = :me AND c.patient_name IS NOT NULL
                  ORDER BY COALESCE(c.updated_at, c.created_at) DESC LIMIT 200""", me=email, t0=ts(today_start))
    return jsonify({"appointments": appts, "cases": cases})


@bp.post("/appt/<appt_id>/remind")
def remind(appt_id):
    """Mock reminder: records that the reminder button was pressed. Nothing is sent."""
    email = me()
    rows = q(f"""SELECT a.appointment_id, c.consent_to_reminders FROM {S}.appointments a
                 JOIN {S}.coordinated_cases c ON c.case_id = a.case_id AND c.coordinator_email = :me
                 WHERE a.appointment_id = :id AND a.coordinator_email = :me""", id=appt_id, me=email)
    if not rows:
        return err("Appointment not found", 404)
    if not rows[0]["consent_to_reminders"]:
        return err("The patient did not agree to reminders")
    q(f"""UPDATE {S}.appointments SET reminder_call_done_at = current_timestamp(), updated_at = current_timestamp()
          WHERE appointment_id = :id AND coordinator_email = :me""", id=appt_id, me=email)
    return jsonify({"ok": True, "mock": True})


# ── Manual add (coordinator enters a patient or an appointment by hand) ────────
@bp.post("/patients")
def add_patient():
    email, b = me(), request.get_json(force=True) or {}
    name, phone = clean(b.get("name"), 120), clean(b.get("phone"), 40)
    if not name or not phone:
        return err("Name (or case code) and phone are needed")
    age = None
    if str(b.get("age_years") or "").strip():
        try:
            age = int(b.get("age_years"))
        except ValueError:
            return err("Age must be a number")
    case_id = uid()
    insert("coordinated_cases", {
        "case_id": case_id, "created_at": now(), "updated_at": now(), "coordinator_email": email,
        "status": "manual", "is_emergency": False, "patient_name": name, "age_years": age, "patient_phone": phone,
        "patient_address": clean(b.get("address"), 300), "case_description": clean(b.get("condition"), 500),
        "care_program": clean(b.get("care_program"), 200), "secondary_contacts": clean(b.get("secondary_contacts"), 500),
        "hospital_sent_to": clean(b.get("hospital"), 200), "consent_to_reminders": bool(b.get("consent"))})
    return jsonify({"case_id": case_id})


@bp.post("/appointments")
def add_appointment():
    email, b = me(), request.get_json(force=True) or {}
    case = get_case(b.get("case_id") or "", email)
    when = parse_ist(b.get("appointment_at"))
    if not when:
        return err("Pick a date and time")
    hospital = clean(b.get("hospital"), 200) or case["hospital_name"]
    if not hospital:
        return err("Add the hospital")
    insert("appointments", {
        "appointment_id": uid(), "case_id": case["case_id"], "coordinator_email": email,
        "hospital_id": case["hospital_id"] if hospital == case["hospital_name"] else None,
        "hospital_name": hospital, "service_code": case["service_code"], "scheduled_at": when,
        "series_id": None, "sequence_no": None, "source": "manual", "status": "scheduled",
        "reminder_call_done_at": None, "created_at": now(), "updated_at": now()})
    if not case["hospital_name"]:
        touch(case["case_id"], email, hospital_sent_to=hospital)
    return jsonify({"ok": True})
