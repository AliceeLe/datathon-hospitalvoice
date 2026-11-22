"""Point both Genie spaces at the ranking-v2 function.

python3 03_update_genie_spaces.py            # dry run: writes the new serialized spaces to ./out/ and prints a summary
python3 03_update_genie_spaces.py --apply    # also PATCHes the spaces (keeps a backup of the old config in ./out/)

Changes per space:
  - registers workspace.datathon.recommend_facilities as a SQL function
  - replaces the text instructions with the ranking-v2 rules (one block; Genie allows one)
  - adds example questions whose SQL calls the function (existing examples are kept)
"""
import json, os, subprocess, sys, uuid

PROFILE = "dais2026"
FUNC = "workspace.datathon.recommend_facilities"
SPACES = {
    "01f1e5d859161bc0af043e6951ccfef9": "aitongl",   # used by the genie-voice app (tables in workspace.virtue_clean)
    "01f1e5eaa80f1520bba115adf9e194cd": "datathon",  # our evidence-scored demo space (tables in workspace.datathon)
}
APPLY = "--apply" in sys.argv
os.makedirs("out", exist_ok=True)

RULES = f"""RECOMMENDING FACILITIES (mandatory — this is the only allowed ranking)
- For ANY question asking where a patient can get care near a place ("where can I get X near Y", "which hospital
  for X", "nearest X"), run exactly:
    SELECT * FROM {FUNC}('<need>', '<place>')
  and nothing else. Do not write your own ranking SQL, and do not filter, re-order, limit or drop columns from
  the function's output. Return every column.
- <need> is one of: dialysis | c_section | nicu | cardiac_surgery | burn_care | mri | trauma_care | general_care
    dialysis: kidney failure, haemodialysis, renal
    c_section: labour, delivery, caesarean, LSCS, high-risk pregnancy, emergency obstetric care
    nicu: newborn / premature baby intensive care, SNCU, neonatal ventilator
    cardiac_surgery: heart surgery, bypass, CABG, valve surgery
    burn_care: burns, burn unit
    mri: MRI scan
    trauma_care: accident, injury, trauma, road traffic accident, casualty
    general_care: check-up, fever, BP, diabetes follow-up, vaccination, general doctor, OPD
  If the need is unclear, ask ONE question: "Specialist service, or a general doctor?"
- <place> is the user's location exactly as given: "lat, lon", a 6-digit PIN, a city/district, or a full address.
- If the function returns no rows: say the place was not recognised or nothing was found in range, and ask for a
  nearby city or PIN code. Never invent facilities.

HOW THE FUNCTION RANKS (use this to explain; do not re-implement it)
- Evidence: HIGH = specific detail in 2+ fields; MEDIUM = a claim with little detail; LOW = only a specialty tag,
  a different service, a contradictory location, a likely merged record or 3+ data-warning signs. Records whose
  details come from a directory page listing 20+ facilities, or that list many services with little text, are
  capped at MEDIUM.
- score = HIGH 6 / MEDIUM 4 − distance_km ÷ km-per-point (C-section, dialysis, trauma 10; NICU 15; MRI, burns 25;
  cardiac surgery 50; general care 5). General care: 4 if it mentions general medicine/OPD/check-ups, else 3,
  +1 government/public, +0.5 own phone, −1 per warning. LOW is always last; ties go to the nearer facility.

ANSWER FORMAT (for every recommended facility)
- WHY it qualifies: quote evidence_quote and name quote_source.
- HOW SURE: confidence and confidence_reason. Say plainly when evidence is weak (MEDIUM bare claim, or LOW).
- WHY THIS RANK: score_explained.
- WARNINGS: any text in warnings, in plain words. If phone is null say "phone not listed".
- End with: "Listed online, not confirmed for today. Call before travelling." For C-section, NICU, trauma or burns
  add: "In an emergency call 112 or 108 for an ambulance."
- Keep it short; non-technical readers.

FOLLOW-UP QUESTIONS about facilities already recommended (e.g. "which of these has a blood bank?"): answer only
about those facilities, using the tables in this space, and cite the supporting text.
"""

AITONGL_REST = """PURPOSE: Help community health workers, NGO coordinators and district planners in India find the best
facility for a medical service near a location, and explain WHY with cited evidence. Users are non-technical.

TABLES
- facility_service_evidence: one row per facility x service with confidence (High/Medium/Low), evidence_score, why
  (plain-English reasons), evidence_snippets (quoted text from the facility record = the citations),
  related_snippets, negated_snippets, lat/lon, city, district, state, pincode, official_phone, beds, doctors,
  quality_label, quality_issues, location_source, source_urls.
- facilities_clean: one row per facility with cleaned fields, data-quality flags and issues.
- pincode_lookup: pincode (string) -> lat, lon, district, state.
- services_dictionary: service codes and the keyword rules used to match them.

SERVICES THE FUNCTION DOES NOT COVER (icu, ct_scan, blood_bank): use facility_service_evidence with
confidence IN ('High','Medium') within 100 km, distance with
6371*2*asin(sqrt(pow(sin(radians(e.lat-h.lat)/2),2) + cos(radians(h.lat))*cos(radians(e.lat))*pow(sin(radians(e.lon-h.lon)/2),2))),
origin from pincode_lookup (PIN, or AVG lat/lon of the matching district), ordered by confidence then distance, LIMIT 5,
and always return why and evidence_snippets.

PLANNING QUESTIONS (gaps, coverage): aggregate facility_service_evidence by state/district counting only High/Medium
confidence facilities; districts with zero are potential service gaps.

IF UNSURE: if nothing in the data supports the question, say "I don't know" rather than guessing.
"""

DATATHON_REST = """PURPOSE: Help community health workers, NGO coordinators and district planners in India find the best
facility for a medical service near a location, and explain WHY with cited evidence. Users are non-technical.
TABLES: facilities_clean (one row per facility, data_quality_notes), facility_service_evidence (facility x service,
confidence, evidence_quote, quote_source, confidence_reason), place_lookup (place -> coordinates),
service_definitions (keyword rules, km_per_evidence_point), facility_trust_flags (warning signs per record).
IF UNSURE: say "I don't know" rather than guessing.
"""

EXAMPLES = [
    ("A woman in labour needs a C-section. We are near Barabanki.", "c_section", "Barabanki"),
    ("Kidney failure patient needs dialysis three times a week, PIN 846004", "dialysis", "846004"),
    ("Where can my patient get a general health check-up near Darbhanga?", "general_care", "Darbhanga"),
    ("Premature baby needs a NICU, we are at 23.36, 85.33", "nicu", "23.36, 85.33"),
    ("Heart bypass surgery near Calicut", "cardiac_surgery", "Calicut"),
]


def cli(*args):
    r = subprocess.run(["databricks", "-p", PROFILE, *args], capture_output=True, text=True)
    if r.returncode:
        raise SystemExit(r.stderr.strip())
    return r.stdout


def hexid():
    return uuid.uuid4().hex


for space_id, kind in SPACES.items():
    raw = json.loads(cli("genie", "get-space", space_id, "--include-serialized-space", "-o", "json"))
    ss = json.loads(raw["serialized_space"])
    json.dump(raw, open(f"out/{kind}_before.json", "w"), indent=1)

    ins = ss.setdefault("instructions", {})
    text = RULES + "\n" + (AITONGL_REST if kind == "aitongl" else DATATHON_REST)
    old_ti = ins.get("text_instructions") or [{}]
    ins["text_instructions"] = [{"id": old_ti[0].get("id") or hexid(), "content": [l + "\n" for l in text.splitlines()]}]

    OLD = "workspace.datathon.find_facilities"          # superseded by recommend_facilities
    funcs = [f for f in ins.get("sql_functions", []) if f.get("identifier") not in (FUNC, OLD)]
    funcs.append({"id": hexid(), "identifier": FUNC})
    ins["sql_functions"] = sorted(funcs, key=lambda f: f["id"])

    examples = [e for e in ins.get("example_question_sqls", [])
                if FUNC not in "".join(e.get("sql", [])) and "find_facilities(" not in "".join(e.get("sql", []))]
    for q, need, place in EXAMPLES:
        examples.append({"id": hexid(), "question": [q], "sql": [f"SELECT * FROM {FUNC}('{need}', '{place}')"]})
    ins["example_question_sqls"] = sorted(examples, key=lambda e: e["id"])

    new = json.dumps(ss)
    json.dump(ss, open(f"out/{kind}_after_serialized.json", "w"), indent=1)
    print(f"{kind}: text {len(text):,} chars | functions {[f['identifier'] for f in ins['sql_functions']]} | "
          f"examples {len(ins['example_question_sqls'])}")
    if APPLY:
        body = json.dumps({"serialized_space": new})
        cli("api", "patch", f"/api/2.0/genie/spaces/{space_id}", "--json", body)
        print(f"   applied to {space_id}")
if not APPLY:
    print("dry run only; re-run with --apply to update the spaces")
