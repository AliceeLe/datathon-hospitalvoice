"""Load the parsed state CSVs into workspace.datathon (warehouse e3b50d583a2daca3, profile dais2026)."""
import csv, json, subprocess, time

SP = "7c00f9ea-557e-493a-b32c-7d27d564c226"   # genie-voice app service principal

def run(sql):
    body = json.dumps({"warehouse_id": "e3b50d583a2daca3", "statement": sql, "wait_timeout": "50s"})
    r = json.loads(subprocess.check_output(["databricks", "-p", "dais2026", "api", "post", "/api/2.0/sql/statements", "--json", body]))
    while r["status"]["state"] in ("PENDING", "RUNNING"):
        time.sleep(2)
        r = json.loads(subprocess.check_output(["databricks", "-p", "dais2026", "api", "get", f"/api/2.0/sql/statements/{r['statement_id']}"]))
    if r["status"]["state"] != "SUCCEEDED":
        raise SystemExit(f"FAILED: {sql[:80]}\n{r['status']}")

def lit(v, typ):
    if v in ("", None):
        return "NULL"
    if typ == "STRING":
        return "'" + v.replace("'", "''") + "'"
    return v

TABLES = {
  "state_population_projection": (
    "Projected population ('000) as on 1 March, India/States/UTs 2011-2036. Source: Report of the Technical Group on "
    "Population Projections, National Commission on Population, MoHFW (July 2020), Table 21. Dadra & Nagar Haveli and "
    "Daman & Diu are summed into the merged UT (is_merged_or_part).",
    [("state_key", "STRING"), ("state_name", "STRING"), ("year", "INT"), ("persons_000", "DOUBLE"),
     ("males_000", "DOUBLE"), ("females_000", "DOUBLE"), ("is_merged_or_part", "STRING")]),
  "state_vital_rates_srs_2022": (
    "SRS 2022 state estimates: birth and death rates per 1,000 population, natural growth rate, infant mortality per "
    "1,000 live births (total/rural/urban). Source: SRS Bulletin 2022 Vol 57 No 1, ORGI, Table 1. IMR for smaller "
    "states/UTs is the 2020-22 average; NULL = no infant death recorded in the sample.",
    [("state_key", "STRING"), ("state_name", "STRING")] + [(c, "DOUBLE") for c in (
     "birth_rate_total", "birth_rate_rural", "birth_rate_urban", "death_rate_total", "death_rate_rural",
     "death_rate_urban", "natural_growth_total", "natural_growth_rural", "natural_growth_urban",
     "imr_total", "imr_rural", "imr_urban")]),
  "state_maternal_mortality_2021_23": (
    "Maternal mortality ratio per 100,000 live births with 95% CI, maternal mortality rate and lifetime risk, "
    "2021-23. Source: SRS Special Bulletin on Maternal Mortality in India 2021-23, ORGI, Table 1. Only major states; "
    "'Other states' is the pooled remainder.",
    [("state_key", "STRING"), ("state_name", "STRING"), ("mmr", "INT"), ("mmr_ci_low", "INT"), ("mmr_ci_high", "INT"),
     ("maternal_mortality_rate", "INT"), ("lifetime_risk_pct", "DOUBLE")]),
}

for name, (comment, cols) in TABLES.items():
    rows = list(csv.DictReader(open(f"{name}.csv")))
    ddl = ", ".join(f"{c} {t}" for c, t in cols)
    run(f"CREATE OR REPLACE TABLE workspace.datathon.{name} ({ddl}) COMMENT '{comment.replace(chr(39), chr(39)*2)}'")
    values = ",\n".join("(" + ", ".join(lit(r[c], t) for c, t in cols) + ")" for r in rows)
    run(f"INSERT INTO workspace.datathon.{name} VALUES {values}")
    run(f"GRANT SELECT ON TABLE workspace.datathon.{name} TO `{SP}`")
    print(f"{name}: {len(rows)} rows loaded, SELECT granted to app")
