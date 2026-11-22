"""Run a multi-statement .sql file on the SQL warehouse, one statement at a time.

Statements are separated by lines containing only '-- @@'.
Usage: python3 run_sql_file.py 01_build_tables.sql [--only N]
"""
import json, subprocess, sys, time

PROFILE, WAREHOUSE = "dais2026", "e3b50d583a2daca3"

def api(method, path, body=None):
    cmd = ["databricks", "-p", PROFILE, "api", method, path] + (["--json", json.dumps(body)] if body else [])
    return json.loads(subprocess.run(cmd, capture_output=True, text=True, check=True).stdout)

def run(sql):
    r = api("post", "/api/2.0/sql/statements",
            {"warehouse_id": WAREHOUSE, "statement": sql, "wait_timeout": "50s"})
    while r["status"]["state"] in ("PENDING", "RUNNING"):
        time.sleep(3)
        r = api("get", f"/api/2.0/sql/statements/{r['statement_id']}")
    return r

if __name__ == "__main__":
    text = open(sys.argv[1]).read()
    stmts = [s.strip() for s in text.split("\n-- @@") if s.strip() and not all(
        l.strip().startswith("--") or not l.strip() for l in s.strip().splitlines())]
    only = int(sys.argv[sys.argv.index("--only") + 1]) if "--only" in sys.argv else None
    for i, s in enumerate(stmts, 1):
        if only and i != only:
            continue
        head = next(l for l in s.splitlines() if l.strip() and not l.strip().startswith("--"))
        t0 = time.time()
        r = run(s)
        state = r["status"]["state"]
        print(f"[{i}/{len(stmts)}] {state:<9} {time.time()-t0:5.1f}s  {head[:90]}")
        if state != "SUCCEEDED":
            print("   ", r["status"].get("error", {}).get("message", r["status"])[:1500])
            sys.exit(1)
