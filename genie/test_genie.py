"""Ask the Genie space a set of test questions and report SQL, text and top rows.

python3 test_genie.py SPACE_ID  [question ...]
"""
import json, subprocess, sys, time

PROFILE = "dais2026"
DEFAULT_QUESTIONS = [
    "dialysis near Darbhanga",
    "My patient is 8 months pregnant and in obstructed labour in Barabanki. Where can she get a caesarean tonight?",
    "premature baby needs a ventilator, we are in Ranchi",
    "bypass surgery Kozhikode",
    "burn unit near Bastar",
    "MRI scan near Pune",
    "How many facilities in Bihar have high-confidence NICU evidence?",
]

def cli(*args):
    out = subprocess.run(["databricks", "-p", PROFILE, "genie", *args, "-o", "json"],
                         capture_output=True, text=True)
    if out.returncode:
        raise RuntimeError(out.stderr.strip())
    return json.loads(out.stdout)

def main(space, questions):
    started = [(q, cli("start-conversation", "--no-wait", space, q)) for q in questions]
    for q, ids in started:
        conv, msg = ids["conversation_id"], ids["message_id"]
        for _ in range(60):
            m = cli("get-message", space, conv, msg)
            if m["status"] in ("COMPLETED", "FAILED", "CANCELLED"):
                break
            time.sleep(5)
        print("=" * 110, f"\nQ: {q}\nstatus: {m['status']}", m.get("error") or "")
        for a in m.get("attachments") or []:
            if a.get("text"):
                print("TEXT:", a["text"]["content"].strip()[:1500])
            if a.get("query"):
                print("SQL:", " ".join(a["query"]["query"].split())[:600])
                try:
                    r = cli("get-message-attachment-query-result", space, conv, msg, a["attachment_id"])
                    sr = r["statement_response"]
                    cols = [c["name"] for c in sr["manifest"]["schema"]["columns"]]
                    rows = sr.get("result", {}).get("data_array", [])
                    print(f"ROWS: {len(rows)} | cols: {cols[:10]}")
                    for row in rows[:4]:
                        d = dict(zip(cols, row))
                        keep = {k: (str(v)[:70] if v else v) for k, v in d.items()
                                if k in ("rank_no", "facility_name", "city", "distance_km", "confidence",
                                         "evidence_quote", "state", "data_quality_notes") or len(cols) <= 4}
                        print("   ", keep)
                except Exception as e:
                    print("   (could not fetch rows:", e, ")")

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2:] or DEFAULT_QUESTIONS)
