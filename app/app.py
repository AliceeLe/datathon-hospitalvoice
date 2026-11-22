"""Voice → Genie: Dual-mode app for Users (find facility) and Planners (dashboard)."""
import os, json, re, time
from flask import Flask, request, jsonify, send_from_directory
from databricks.sdk import WorkspaceClient
from databricks.sdk.service.sql import StatementState

app = Flask(__name__, static_folder="static")

from referral import bp as referral_bp, refusal_counts  # non-emergency referral flow
app.register_blueprint(referral_bp)

SPACE_ID = os.environ.get("GENIE_SPACE_ID", "01f1e5d859161bc0af043e6951ccfef9")
WAREHOUSE_ID = os.environ.get("WAREHOUSE_ID", "e3b50d583a2daca3")
CATALOG = "workspace"
SCHEMA = "virtue_clean"

_w = None

def get_client():
    global _w
    if _w is None:
        _w = WorkspaceClient()
    return _w


# ── Genie helpers ─────────────────────────────────────────────────────────────

def ask_genie(question, conversation_id=None):
    """Start or continue a Genie conversation and return the result."""
    w = get_client()
    if conversation_id:
        # REST call: the installed databricks-sdk's create_message fails with KeyError 'id'
        resp = w.api_client.do(
            "POST", f"/api/2.0/genie/spaces/{SPACE_ID}/conversations/{conversation_id}/messages",
            body={"content": question})
        conv_id = conversation_id
        msg_id = resp.get("message_id") or resp.get("id")
    else:
        resp = w.genie.start_conversation(SPACE_ID, question)
        conv_id = resp.conversation_id
        msg_id = resp.message_id

    for _ in range(120):
        import time as t
        t.sleep(1)
        msg = w.genie.get_message(SPACE_ID, conv_id, msg_id)
        if getattr(msg.status, "value", msg.status) in (
            "COMPLETED", "FAILED", "CANCELLED",
            "QUERY_RESULT_EXPIRED", "ATTACHMENT_EXCEEDS_LIMIT",
        ):
            break

    result = {"conversation_id": conv_id, "status": str(getattr(msg.status, "value", msg.status))}

    text_parts = []
    result_error = None
    sql_query = None
    table_data = None

    # attachment ids come from the raw REST message: older databricks-sdk versions drop them
    raw_atts = []
    try:
        raw = w.api_client.do("GET", f"/api/2.0/genie/spaces/{SPACE_ID}/conversations/{conv_id}/messages/{msg_id}")
        raw_atts = raw.get("attachments") or []
    except Exception as e:
        result_error = str(e)
    for ra in raw_atts:
        if ra.get("query") and ra.get("attachment_id"):
            try:
                qr = w.api_client.do(
                    "GET",
                    f"/api/2.0/genie/spaces/{SPACE_ID}/conversations/{conv_id}"
                    f"/messages/{msg_id}/attachments/{ra['attachment_id']}/query-result")
                sr = qr.get("statement_response") or {}
                cols = [c["name"] for c in sr.get("manifest", {}).get("schema", {}).get("columns", [])]
                rows = (sr.get("result") or {}).get("data_array") or []
                table_data = {"columns": cols, "rows": rows}
            except Exception as e:
                result_error = str(e)

    if msg.attachments:
        for att in msg.attachments:
            if att.text and att.text.content:
                text_parts.append(att.text.content)
            if att.query and att.query.query:
                sql_query = att.query.query

    if not text_parts and table_data and table_data.get("rows"):
        cols = table_data["columns"]
        rows = table_data["rows"]
        col_lower = [c.lower() for c in cols]
        def _ci(names):
            for name in names:
                for i, c in enumerate(col_lower):
                    if name in c: return i
            return None
        name_i = _ci(["name", "facility"])
        city_i = _ci(["city", "district"])
        km_i   = _ci(["km", "distance"])
        conf_i = _ci(["confidence"])
        lines = [f"Found {len(rows)} facilit{'ies' if len(rows) != 1 else 'y'} matching your query:"]
        for row in rows[:5]:
            parts = []
            if name_i is not None and row[name_i]: parts.append(str(row[name_i]))
            if city_i is not None and row[city_i]: parts.append(f"in {row[city_i]}")
            if km_i   is not None and row[km_i]:
                try: parts.append(f"({float(row[km_i]):.1f} km away)")
                except (TypeError, ValueError): pass
            if conf_i is not None and row[conf_i]: parts.append(f"[{row[conf_i]} confidence]")
            if parts: lines.append("• " + " ".join(parts))
        lines.append("\nCall before travelling to confirm availability.")
        text_parts = ["\n".join(lines)]
    result["answer"] = "\n\n".join(text_parts) if text_parts else "No answer returned."
    if sql_query:
        result["sql"] = sql_query
    if table_data:
        result["table"] = table_data
    if result_error:
        result["table_error"] = result_error

    return result


# ── Hospital cards ────────────────────────────────────────────────────────────
# Companion services shown under each hospital, matched by keyword against the
# service key/label so this does not depend on exact service names.
COMPANIONS = [
    ("emergency", ("emergency", "trauma"), "24/7 emergency services"),
    ("nicu", ("nicu", "neonat"), "NICU"),
    ("blood_bank", ("blood",), "Blood bank"),
    ("icu", ("icu",), "ICU"),
]


def _sql_str(v):
    return "'" + str(v).replace("'", "''") + "'"


def _companion_key(service, label):
    text = f"{service} {label}".lower()
    if "section" in text:  # "Emergency C-section" is the obstetric service, not emergency care
        return None
    for key, words, _ in COMPANIONS:
        if key == "icu" and ("nicu" in text or "neonat" in text):
            continue
        if any(w in text for w in words):
            return key
    return None


def _fmt_phone(p):
    if not p:
        return None
    digits = "".join(ch for ch in str(p) if ch.isdigit())
    if digits.startswith("91") and len(digits) == 12:
        rest = digits[2:]
        if rest[0] in "6789":
            return f"+91 {rest[:5]} {rest[5:]}"
        return f"+91 {rest[:3]} {rest[3:6]} {rest[6:]}"
    return str(p)


# attributes a follow-up question can ask about (keyword regex on the user's own words)
ASKED = [
    ("beds", r"\bbeds?\b|\bcapacity\b|\bhow big\b"),
    ("emergency", r"emergenc|trauma|24\s*[/x]\s*7|casualty"),
    ("nicu", r"nicu|neonat|newborn|premature"),
    ("blood_bank", r"blood"),
    ("icu", r"(?<!n)\bicu\b|intensive care"),
]
MISSING_LABEL = {"emergency": "Emergency care", "nicu": "NICU", "blood_bank": "Blood bank", "icu": "ICU"}


def _fmt_beds(v):
    try:
        n = int(float(v))
        return f"{n} beds" if n > 0 else None
    except (TypeError, ValueError):
        return None


def build_cards(table, emergency, compact=False, user_question=""):
    """Turn Genie's result rows into hospital cards, enriched from the tables."""
    if not table or not table.get("rows"):
        return None
    cols = [c.lower() for c in table["columns"]]
    rows = [dict(zip(cols, r)) for r in table["rows"]]
    id_col = "unique_id" if "unique_id" in cols else None
    name_col = next((c for c in ("name", "facility_name", "hospital_name", "hospital") if c in cols), None)
    km_col = next((c for c in cols if "km" in c or "distance" in c), None)
    if not (id_col or name_col):
        return None

    # keep Genie's order, one card per facility, max 5
    picked, seen = [], set()
    for r in rows:
        key = r.get(id_col) if id_col else r.get(name_col)
        if key and key not in seen:
            seen.add(key)
            picked.append(r)
        if len(picked) == 5:
            break
    keys = [r.get(id_col) if id_col else r.get(name_col) for r in picked]
    match_col = "unique_id" if id_col else "name"
    in_list = ", ".join(_sql_str(k) for k in keys)

    fac = run_sql(f"""
        SELECT unique_id, name, city, district, state, pincode, official_phone, flag_shared_phone, beds
        FROM facilities_clean WHERE {match_col} IN ({in_list})""")
    fac = [dict(zip(fac["columns"], r)) for r in fac["rows"]]
    ev = run_sql(f"""
        SELECT e.unique_id, e.name, e.service, COALESCE(d.label, e.service_label, e.service) AS label
        FROM facility_service_evidence e
        LEFT JOIN services_dictionary d ON d.service = e.service
        WHERE e.{match_col} IN ({in_list}) AND lower(e.confidence) IN ('high', 'medium')""")
    ev = [dict(zip(ev["columns"], r)) for r in ev["rows"]]

    # the service that was asked for: Genie's service column if present
    primary = next((r.get("service") for r in picked if r.get("service")), None)
    primary_label = next((r.get("service_label") for r in picked if r.get("service_label")), None)
    if primary and not primary_label:
        primary_label = next((e["label"] for e in ev if e["service"] == primary), primary)

    hospitals, cities = [], []
    for r, key in zip(picked, keys):
        f = next((x for x in fac if x[match_col] == key), {})
        e_rows = [x for x in ev if x[match_col] == key]
        name = f.get("name") or r.get(name_col) or "Unnamed facility"
        city = f.get("city") or r.get("city")
        cities.append(city)
        parts = []
        for part in (city, f.get("district") or r.get("district"), f.get("state") or r.get("state")):
            if part and part.lower() not in [p.lower() for p in parts]:
                parts.append(part)
        address = ", ".join(parts)
        pin = f.get("pincode") or r.get("pincode")
        if pin:
            address = f"{address} {pin}".strip()

        have = {}
        for x in e_rows:
            if x["service"] == primary and not compact:
                continue
            k = _companion_key(x["service"], x["label"])
            if k and k not in have:
                have[k] = x["label"]
        bullets = []
        if compact:
            # short attribute answer: beds, then the services this hospital lists
            asked = {k for k, rx in ASKED if re.search(rx, user_question or "", re.I)}
            beds = _fmt_beds(f.get("beds") or r.get("beds"))
            if beds:
                bullets.append(beds)
            elif "beds" in asked:
                bullets.append("Bed count not listed")
            for k, _, _ in COMPANIONS:
                if have.get(k):
                    bullets.append(have[k])
                elif k in asked or (k == "blood_bank" and emergency):
                    bullets.append(f"{MISSING_LABEL[k]} information not listed")
        else:
            if primary_label:
                bullets.append(primary_label)
            for k, _, label in COMPANIONS:
                if have.get(k):
                    bullets.append(label)
            if emergency and not have.get("blood_bank") and primary_label:
                bullets.append("Blood bank information not listed")

        phone = f.get("official_phone") or r.get("official_phone") or r.get("phone")
        if str(f.get("flag_shared_phone")).lower() == "true":
            phone = None  # shared directory number, not the hospital's own line
        km = r.get(km_col) if km_col else None
        try:
            km = round(float(km))
        except (TypeError, ValueError):
            km = None
        hospitals.append({"id": f.get("unique_id") or (r.get(id_col) if id_col else None),
                          "name": name, "km": km, "address": address or None,
                          "bullets": bullets, "phone": _fmt_phone(phone),
                          "phone_raw": phone,
                          "search": f"{name} {'' if (city or '').lower() in name.lower() else city} phone"})
    # Recent refusals (no machine / no doctor / no bed in the last 30 days, from this coordinator's calls):
    # show a warning and add 10 km per refusal to the sort distance, capped at 30 km. Never blocks search.
    try:
        counts = refusal_counts(request.headers.get("X-Forwarded-Email") or "", [h["id"] for h in hospitals])
    except Exception:
        counts = {}
    for h in hospitals:
        h["refusals"] = counts.get(h["id"])
        h["penalty_km"] = min(10 * h["refusals"]["n"], 30) if h["refusals"] else 0
    hospitals.sort(key=lambda h: (h["km"] is None, (h["km"] or 0) + h["penalty_km"]))  # nearest first, after penalty

    uniq = {c for c in cities if c}
    where = f"in {uniq.pop()}" if len(uniq) == 1 else "near you"
    n = len(hospitals)
    title = f"{n} hospital{'s' if n != 1 else ''} {where}"
    if primary_label:
        extra = "emergency or neonatal care" if emergency else "related service"
        subtitle = f"Hospitals listed as offering {primary_label}, with {extra} details where available."
    else:
        subtitle = "Hospitals that match your request, with related services where available."
    if compact:
        return {"title": None, "subtitle": None, "hospitals": hospitals}
    city = next(iter({c for c in cities if c}), None) if len({c for c in cities if c}) == 1 else None
    return {"title": title, "subtitle": subtitle, "hospitals": hospitals,
            "primary_label": primary_label, "where": city, "emergency": emergency}


# ── SQL helpers ───────────────────────────────────────────────────────────────

def run_sql(sql):
    """Execute SQL via warehouse and return columns + rows."""
    w = get_client()
    stmt = w.statement_execution.execute_statement(
        statement=sql,
        warehouse_id=WAREHOUSE_ID,
        catalog=CATALOG,
        schema=SCHEMA,
        wait_timeout="30s",
    )
    for _ in range(30):
        if stmt.status.state in (
            StatementState.SUCCEEDED, StatementState.FAILED,
            StatementState.CANCELED, StatementState.CLOSED,
        ):
            break
        import time as t
        t.sleep(1)
        stmt = w.statement_execution.get_statement(stmt.statement_id)

    if stmt.status.state != StatementState.SUCCEEDED:
        raise RuntimeError(f"SQL failed: {stmt.status.error}")

    cols = [c.name for c in (stmt.manifest.schema.columns or [])]
    rows = stmt.result.data_array if stmt.result else []
    return {"columns": cols, "rows": rows or []}


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory("static", "index.html")


@app.route("/api/ask", methods=["POST"])
def api_ask():
    body = request.get_json(force=True)
    question = body.get("question", "").strip()
    conversation_id = body.get("conversation_id") or None
    if not question:
        return jsonify({"error": "No question provided"}), 400
    try:
        result = ask_genie(question, conversation_id)
        # Genie is not deterministic: if a card request fails or finds no rows,
        # retry once in a fresh conversation before giving up.
        if body.get("want_cards") and not body.get("compact") and (result.get("status") != "COMPLETED"
                                       or not (result.get("table") or {}).get("rows")):
            retry = ask_genie(question, None)
            if retry.get("status") == "COMPLETED" and (retry.get("table") or {}).get("rows"):
                result = retry
        if body.get("want_cards"):
            try:
                result["cards"] = build_cards(result.get("table"), bool(body.get("emergency")),
                                              compact=bool(body.get("compact")),
                                              user_question=body.get("user_question", ""))
            except Exception as e:
                result["cards_error"] = str(e)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Confirmed cases ───────────────────────────────────────────────────────────
CASES_TABLE = "workspace.datathon.coordinated_cases"
CASE_FIELDS = ["patient_name", "patient_address", "patient_phone", "case_description",
               "hospital_sent_to", "suggested_hospitals", "patient_need", "search_address",
               "treatment_frequency", "genie_conversation_id",
               "care_program", "medical_history", "secondary_contacts"]


@app.route("/api/cases", methods=["POST"])
def save_case():
    """Store a case the coordinator confirmed (patient sent to a hospital)."""
    import uuid
    body = request.get_json(force=True) or {}
    vals = {k: (str(body.get(k) or "").strip()[:4000] or None) for k in CASE_FIELDS}
    missing = [k for k in ("patient_name", "patient_address", "patient_phone", "case_description") if not vals[k]]
    if missing:
        return jsonify({"error": "Missing: " + ", ".join(missing)}), 400
    case_id = str(uuid.uuid4())
    params = [{"name": "case_id", "value": case_id},
              {"name": "coordinator_email", "value": request.headers.get("X-Forwarded-Email")},
              {"name": "is_emergency", "value": "true" if body.get("is_emergency") else "false", "type": "BOOLEAN"}]
    params += [{"name": k, "value": v} for k, v in vals.items()]
    dob = str(body.get("date_of_birth") or "").strip()[:10] or None
    if dob and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", dob):
        return jsonify({"error": "Date of birth must be YYYY-MM-DD"}), 400
    params.append({"name": "date_of_birth", "value": dob})
    cols = ["case_id", "created_at", "coordinator_email", "is_emergency", "date_of_birth"] + CASE_FIELDS
    marks = [":case_id", "current_timestamp()", ":coordinator_email", ":is_emergency",
             "try_cast(:date_of_birth AS DATE)"] + [f":{k}" for k in CASE_FIELDS]
    try:
        # parameter markers keep user-typed text out of the SQL string
        r = get_client().api_client.do("POST", "/api/2.0/sql/statements", body={
            "warehouse_id": WAREHOUSE_ID, "wait_timeout": "30s",
            "statement": f"INSERT INTO {CASES_TABLE} ({', '.join(cols)}) VALUES ({', '.join(marks)})",
            "parameters": params})
        state = (r.get("status") or {}).get("state")
        if state != "SUCCEEDED":
            return jsonify({"error": ((r.get("status") or {}).get("error") or {}).get("message", state)}), 500
        return jsonify({"case_id": case_id})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/cases", methods=["GET"])
def list_cases():
    """Cases for the Patient Tracker, newest first (this coordinator only)."""
    me_sql = (request.headers.get("X-Forwarded-Email") or "").replace("'", "''")
    try:
        data = run_sql(f"""
            SELECT case_id, date_format(created_at, "yyyy-MM-dd'T'HH:mm:ss'Z'") AS created_at, coordinator_email,
                   patient_name, CAST(date_of_birth AS STRING) AS date_of_birth, patient_address, patient_phone,
                   care_program, medical_history, secondary_contacts, case_description, hospital_sent_to,
                   suggested_hospitals, CAST(is_emergency AS STRING) AS is_emergency, patient_need,
                   search_address, treatment_frequency, genie_conversation_id
            FROM {CASES_TABLE} WHERE coordinator_email = '{me_sql}'
            ORDER BY created_at DESC LIMIT 500""")
        return jsonify({"cases": [dict(zip(data["columns"], r)) for r in data["rows"]]})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/dashboard/states", methods=["GET"])
def dashboard_states():
    try:
        data = run_sql("SELECT DISTINCT state FROM district_service_coverage ORDER BY state")
        states = [r[0] for r in data["rows"] if r[0]]
        return jsonify({"states": states})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/dashboard/district", methods=["GET"])
def dashboard_district():
    state = request.args.get("state", "")
    district = request.args.get("district", "")
    if not state or not district:
        return jsonify({"error": "state and district required"}), 400
    try:
        data = run_sql(f"SELECT * FROM district_service_coverage WHERE state = '{state.replace(chr(39), chr(39)*2)}' AND district = '{district.replace(chr(39), chr(39)*2)}' LIMIT 1")
        if not data["rows"]:
            return jsonify({"error": "District not found"}), 404
        row = dict(zip(data["columns"], data["rows"][0]))
        return jsonify(row)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/dashboard/districts", methods=["GET"])
def dashboard_districts():
    state = request.args.get("state", "")
    if not state:
        return jsonify({"error": "state required"}), 400
    try:
        data = run_sql(f"SELECT district, n_facilities, n_hospitals, total_beds_listed, n_mri, n_ct_scan, n_icu, n_blood_bank, n_dialysis, n_emergency_c_section, n_nicu, n_trauma_emergency FROM district_service_coverage WHERE state = '{state.replace(chr(39), chr(39)*2)}' ORDER BY district")
        cols = data["columns"]
        rows = [dict(zip(cols, r)) for r in data["rows"]]
        return jsonify({"districts": rows})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/dashboard/facilities", methods=["GET"])
def dashboard_facilities():
    state = request.args.get("state", "")
    district = request.args.get("district", "")
    if not state:
        return jsonify({"error": "state required"}), 400
    try:
        where_d = f" AND district = '{district.replace(chr(39), chr(39)*2)}'" if district else ""
        limit = 100 if district else 400
        data = run_sql(f"SELECT name, district, facility_type, organization_type, beds, doctors, official_phone, lat_final, lon_final, quality_label, equipment_list, specialties_list, capability_list FROM facilities_clean WHERE state = '{state.replace(chr(39), chr(39)*2)}'{where_d} AND coords_valid = TRUE ORDER BY quality_score DESC NULLS LAST LIMIT {limit}")
        cols = data["columns"]
        rows = [dict(zip(cols, r)) for r in data["rows"]]
        return jsonify({"facilities": rows})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── State view: aggregate all districts of a state ────────────────────────────
SUM_COLS = ["n_pincodes", "n_facilities", "n_hospitals", "total_beds_listed", "n_dialysis", "n_emergency_c_section",
            "n_nicu", "n_cardiac_surgery", "n_mri", "n_burn_care", "n_trauma_emergency", "n_icu", "n_ct_scan", "n_blood_bank"]
KM_COLS = ["km_nearest_dialysis", "km_nearest_emergency_c_section", "km_nearest_nicu", "km_nearest_cardiac_surgery",
           "km_nearest_mri", "km_nearest_burn_care", "km_nearest_trauma_emergency", "km_nearest_icu",
           "km_nearest_ct_scan", "km_nearest_blood_bank"]
PCT_COLS = ["institutional_birth_5y_pct", "institutional_birth_in_public_facility_5y_pct",
            "births_delivered_by_csection_5y_pct", "mothers_who_had_at_least_4_anc_visits_lb5y_pct",
            "child_12_23m_fully_vaccinated_based_on_information_from_eit_pct",
            "child_u5_who_are_stunted_height_for_age_18_pct", "all_w15_49_who_are_anaemic_pct",
            "hh_member_covered_health_insurance_pct"]


@app.route("/api/dashboard/state", methods=["GET"])
def dashboard_state():
    """Totals for counts, unweighted district averages for distances and NFHS %, plus one row per district."""
    state = request.args.get("state", "")
    if not state:
        return jsonify({"error": "state required"}), 400
    st = state.replace("'", "''")
    try:
        aggs = ([f"sum(try_cast({c} AS DOUBLE)) AS {c}" for c in SUM_COLS] +
                [f"avg(try_cast({c} AS DOUBLE)) AS {c}" for c in KM_COLS] +
                [f"max(try_cast({c} AS DOUBLE)) AS max_{c}" for c in KM_COLS] +
                [f"avg(try_cast({c} AS DOUBLE)) AS {c}" for c in PCT_COLS])
        data = run_sql(f"SELECT count(*) AS n_districts, {', '.join(aggs)} FROM district_service_coverage WHERE state = '{st}'")
        if not data["rows"] or not data["rows"][0][0] or str(data["rows"][0][0]) == "0":
            return jsonify({"error": "State not found"}), 404
        row = dict(zip(data["columns"], data["rows"][0]))
        dcols = ["district", "n_facilities", "n_hospitals", "total_beds_listed", "n_icu", "n_blood_bank",
                 "km_nearest_emergency_c_section", "km_nearest_dialysis", "km_nearest_mri"]
        dd = run_sql(f"SELECT {', '.join(dcols)} FROM district_service_coverage WHERE state = '{st}' ORDER BY district")
        row["districts"] = [dict(zip(dd["columns"], r)) for r in dd["rows"]]
        return jsonify(row)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def _state_key(name):
    n = (name or "").lower().replace("&", "and")
    n = re.sub(r"\bnct of\b|\(ut\)|\*", "", n)
    return re.sub(r"[^a-z]", "", n)


@app.route("/api/dashboard/state_context", methods=["GET"])
def dashboard_state_context():
    """Official state figures: population projection (Technical Group, 2020), SRS 2022 vital rates, SRS MMR 2021-23."""
    state = request.args.get("state", "")
    if not state:
        return jsonify({"error": "state required"}), 400
    key = _state_key(state).replace("'", "")
    try:
        def rows(sql):
            d = run_sql(sql)
            return [dict(zip(d["columns"], r)) for r in d["rows"]]
        pop = rows(f"""SELECT state_key, year, persons_000 FROM workspace.datathon.state_population_projection
                       WHERE state_key IN ('{key}', 'india') AND (is_merged_or_part IS NULL OR is_merged_or_part <> 'part')
                       ORDER BY year""")
        srs = rows(f"SELECT * FROM workspace.datathon.state_vital_rates_srs_2022 WHERE state_key IN ('{key}', 'india')")
        mmr = rows(f"""SELECT * FROM workspace.datathon.state_maternal_mortality_2021_23
                       WHERE state_key IN ('{key}', 'india', 'otherstates')""")
        pick = lambda rs, k: next((r for r in rs if r["state_key"] == k), None)
        state_mmr = pick(mmr, key)
        return jsonify({
            "population": {str(r["year"]): r["persons_000"] for r in pop if r["state_key"] == key},
            "india_population": {str(r["year"]): r["persons_000"] for r in pop if r["state_key"] == "india"},
            "srs": pick(srs, key), "india_srs": pick(srs, "india"),
            "mmr": state_mmr or pick(mmr, "otherstates"), "mmr_is_pooled": state_mmr is None,
            "india_mmr": pick(mmr, "india"),
            "sources": {
                "population": "Technical Group on Population Projections, NCP/MoHFW (2020), Table 21 (1 March)",
                "srs": "SRS Bulletin 2022, Vol 57 No 1, ORGI",
                "mmr": "SRS Special Bulletin on Maternal Mortality 2021-23, ORGI"}})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port, debug=False)
