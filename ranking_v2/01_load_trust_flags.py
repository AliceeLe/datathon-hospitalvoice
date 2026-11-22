"""Load ../trust_checks/trust_flags.csv into workspace.datathon.facility_trust_flags (profile dais2026).

One row per raw record (10,088). recommend_facilities() aggregates by unique_id.
"""
import csv, json, subprocess, sys, time

CSV = sys.argv[1] if len(sys.argv) > 1 else "../trust_checks/trust_flags.csv"
TABLE = "workspace.datathon.facility_trust_flags"
COLS = [("unique_id", "STRING"), ("name", "STRING"), ("n_signs", "INT"),
        ("f_merged", "BOOLEAN"), ("f_location", "BOOLEAN"), ("f_thin_evidence", "BOOLEAN"),
        ("f_shared_page", "BOOLEAN"), ("f_shared_page_20", "BOOLEAN"), ("f_dup_fragment", "BOOLEAN"),
        ("f_many_claims_little_text", "BOOLEAN"), ("f_tags_only", "BOOLEAN"), ("max_url_share", "INT"),
        ("f_shared_phone", "BOOLEAN"), ("km_from_city", "DOUBLE"), ("km_from_pin_area", "DOUBLE"),
        ("f_desc_branches", "BOOLEAN"), ("f_two_pins", "BOOLEAN"), ("f_many_contacts", "BOOLEAN")]


def run(sql):
    body = json.dumps({"warehouse_id": "e3b50d583a2daca3", "statement": sql, "wait_timeout": "50s"})
    r = json.loads(subprocess.check_output(["databricks", "-p", "dais2026", "api", "post", "/api/2.0/sql/statements", "--json", body]))
    while r["status"]["state"] in ("PENDING", "RUNNING"):
        time.sleep(2)
        r = json.loads(subprocess.check_output(["databricks", "-p", "dais2026", "api", "get", f"/api/2.0/sql/statements/{r['statement_id']}"]))
    if r["status"]["state"] != "SUCCEEDED":
        raise SystemExit(f"FAILED: {sql[:100]}\n{r['status']}")


def lit(v, t):
    if v in ("", None, "nan"):
        return "NULL"
    if t == "BOOLEAN":
        return "TRUE" if v in ("True", "true", "1") else "FALSE"
    if t in ("INT", "DOUBLE"):
        return str(int(float(v))) if t == "INT" else str(float(v))
    return "'" + v.replace("\\", "\\\\").replace("'", "\\'") + "'"


rows = list(csv.DictReader(open(CSV)))
ddl = ", ".join(f"{c} {t}" for c, t in COLS)
run(f"CREATE OR REPLACE TABLE {TABLE} ({ddl}) COMMENT 'Signs a facility record should not be trusted "
    f"(merged record, location contradiction, thin evidence, shared source page, duplicate/fragment). "
    f"Built by trust_checks/trust_checks.py from the raw facilities table; one row per raw record.'")
for i in range(0, len(rows), 800):
    chunk = rows[i:i + 800]
    values = ",\n".join("(" + ", ".join(lit(r[c], t) for c, t in COLS) + ")" for r in chunk)
    run(f"INSERT INTO {TABLE} VALUES {values}")
    print(f"  inserted {i + len(chunk):,}/{len(rows):,}")
print("done:", TABLE)
