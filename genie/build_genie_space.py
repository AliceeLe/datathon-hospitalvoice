"""Build the serialized_space payload for the Facility Finder Genie demo.

python3 build_genie_space.py > genie_space.json
"""
import hashlib, json

S = "workspace.datathon"

def gid(key):
    """Stable 32-hex id, so re-running produces the same ids (clean diffs on update-space)."""
    return hashlib.md5(key.encode()).hexdigest()

def col(name, desc=None, synonyms=None, match=False, exclude=False):
    c = {"column_name": name}
    if desc: c["description"] = [desc]
    if synonyms: c["synonyms"] = synonyms
    if match: c["enable_format_assistance"] = True; c["enable_entity_matching"] = True
    if exclude: c["exclude"] = True
    return c

tables = [
    {"identifier": f"{S}.facilities_clean", "column_configs": [
        col("facility_id", "Unique facility id (UUID). Join key to facility_service_evidence."),
        col("facility_name", "Facility name as listed on the web.", ["hospital", "clinic name", "facility"]),
        col("city", "City or town from the address.", ["town"], match=True),
        col("state", "Indian state or union territory.", ["region"], match=True),
        col("pin_code", "6-digit Indian PIN code (postal code).", ["pincode", "postal code", "zip"]),
        col("latitude", "Latitude; NULL when the original was outside India."),
        col("longitude", "Longitude; NULL when the original was outside India."),
        col("facility_type", "hospital, clinic, dentist, doctor, pharmacy or nursing_home.", ["type"], match=True),
        col("operator_type", "private, public or government.", ["ownership", "sector"], match=True),
        col("num_doctors", "Doctors listed on the source page. Often far below the real count; do not use as staff size.", ["doctors"]),
        col("num_beds", "Bed capacity claimed by the facility.", ["beds", "capacity"]),
        col("year_established", "Year the facility was established (1800-2026; invalid values removed)."),
        col("specialties", "Comma-separated specialty tags (camelCase codes such as nephrology, cardiology). Tags alone are weak evidence that a service exists."),
        col("phone", "Official phone number (+91...)."),
        col("website", "Official website domain."),
        col("email", "Contact email when a valid address was listed."),
        col("description", "Free-text description from the facility's web presence."),
        col("has_location_conflict", "TRUE when the coordinates disagree with the city or PIN code (more than 50 km from other facilities in the same city, or 100 km from the same PIN district). Distances to these facilities are unreliable.", ["wrong location", "bad address"]),
        col("is_truncated_record", "TRUE when the source record was cut off mid-description, so later fields are missing."),
        col("shared_source_count", "How many other facilities' details came from the same web page (directory pages). High values mean details may be mixed up between facilities."),
        col("is_small_facility", "TRUE when 10 or fewer beds are listed."),
        col("staff_count_unreliable", "TRUE when listed doctors are implausibly low for the bed count."),
        col("data_quality_notes", "Plain-English list of every data-quality problem for this facility. Always show it to the user when not NULL."),
    ]},
    {"identifier": f"{S}.facility_service_evidence", "column_configs": [
        col("facility_id", "Join key to facilities_clean.facility_id."),
        col("service_key", "Service code: dialysis, c_section, nicu, cardiac_surgery, burn_care, mri, trauma_care.",
            ["service", "treatment", "care type"], match=True),
        col("service_label", "Readable service name."),
        col("evidence_level", "specific = detailed evidence (equipment, volumes, staff, unit type); generic claim = says the service exists, no detail; different service type = related but not the same service (e.g. ICU-only CRRT vs routine dialysis); specialty tag only = no text, just a specialty code.", match=True),
        col("confidence", "HIGH = specific evidence in 2+ fields and no data-quality problems; MEDIUM = credible but generic or single-field claim, call to confirm; LOW = specialty tag only, different service type, or contradictory location.",
            ["reliability", "trust", "certainty"], match=True),
        col("confidence_reason", "Plain-English reason for the confidence level. Always show it."),
        col("evidence_quote", "Exact text from the source record that supports the claim. Always quote it verbatim; never paraphrase or invent evidence."),
        col("quote_source", "Field the quote came from: description, capability, procedure or equipment."),
        col("all_evidence", "Up to 6 distinct supporting snippets, separated by ' | '."),
        col("n_fields_mentioning", "Number of fields (description/capability/procedure/equipment) that mention the service."),
    ]},
    {"identifier": f"{S}.place_lookup", "column_configs": [
        col("place_name", "Lower-case place name, alias (calicut, bangalore), 6-digit PIN or 3-digit PIN prefix.", ["location", "town", "pincode"]),
        col("place_type", "city, city_alias, district_hq, pin_code or pin_prefix."),
        col("state", "State of the place.", match=True),
        col("latitude", "Latitude of the place (median of facilities listed there)."),
        col("longitude", "Longitude of the place."),
        col("n_facilities", "Facilities used to compute the location."),
    ]},
    {"identifier": f"{S}.service_definitions", "column_configs": [
        col("service_key", "Service code.", match=True),
        col("service_label", "Readable service name."),
        col("any_pattern", "Regex: text that mentions the service.", exclude=True),
        col("specific_pattern", "Regex: details that make a claim credible.", exclude=True),
        col("specialty_tag_pattern", "Regex over specialty tags.", exclude=True),
        col("wrong_type_pattern", "Regex: mentions of a different, related service.", exclude=True),
        col("km_per_evidence_point", "Distance penalty used for ranking: each this-many km costs one evidence point."),
    ]},
]
for t in tables:
    t["column_configs"].sort(key=lambda c: c["column_name"])
tables.sort(key=lambda t: t["identifier"])

FIND = f"{S}.find_facilities"
examples = [
    ("Where can a dialysis patient near PIN 847 (Darbhanga, Bihar) get dialysis?",
     f"SELECT * FROM {FIND}('dialysis', '847', 150) ORDER BY rank_no LIMIT 10",
     "Service-near-place questions: always call find_facilities. Map the service to a service_key and pass the place as the user wrote it (city, alias, PIN or 3-digit PIN prefix)."),
    ("Emergency C-section near Barabanki",
     f"SELECT * FROM {FIND}('c_section', 'Barabanki', 60) ORDER BY rank_no LIMIT 10",
     "Emergency services (c_section, trauma_care): use a short radius (60 km) unless the user gives one."),
    ("Which hospitals near Ranchi have a NICU for a premature baby?",
     f"SELECT * FROM {FIND}('nicu', 'Ranchi', 100) ORDER BY rank_no LIMIT 10", None),
    ("Cardiac bypass surgery near Calicut",
     f"SELECT * FROM {FIND}('cardiac_surgery', 'Calicut', 120) ORDER BY rank_no LIMIT 10",
     "Planned surgery tolerates travel: 120 km default radius."),
    ("Burn unit near Jagdalpur, Bastar",
     f"SELECT * FROM {FIND}('burn_care', 'Jagdalpur', 300) ORDER BY rank_no LIMIT 10",
     "burn_care is rare: use 300 km. If no HIGH/MEDIUM rows are returned, say so plainly."),
    ("How many facilities have high-confidence dialysis evidence in each state?",
     f"""SELECT f.state, count(*) AS high_confidence_dialysis_facilities
FROM {S}.facility_service_evidence e
JOIN {S}.facilities_clean f ON f.facility_id = e.facility_id
WHERE e.service_key = 'dialysis' AND e.confidence = 'HIGH'
GROUP BY f.state ORDER BY high_confidence_dialysis_facilities DESC""",
     "Coverage questions by state or city: aggregate facility_service_evidence joined to facilities_clean, filtered by confidence."),
    ("Where should I refer a kidney patient in Muzaffarpur for haemodialysis?",
     f"SELECT * FROM {FIND}('dialysis', 'Muzaffarpur', 100) ORDER BY rank_no LIMIT 10", None),
    ("MRI near PIN 411001",
     f"SELECT * FROM {FIND}('mri', '411001', 100) ORDER BY rank_no LIMIT 10",
     "PIN codes (6 digits) or PIN prefixes (3 digits) go straight into the place argument."),
    ("Show me the evidence for Rani Hospital in Ranchi",
     f"""SELECT f.facility_name, f.city, e.service_label, e.confidence, e.evidence_level,
       e.evidence_quote, e.quote_source, e.confidence_reason, e.all_evidence, f.data_quality_notes, f.phone
FROM {S}.facilities_clean f
JOIN {S}.facility_service_evidence e ON e.facility_id = f.facility_id
WHERE lower(f.facility_name) LIKE '%rani hospital%' AND lower(f.city) = 'ranchi'
ORDER BY CASE e.confidence WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END""",
     "Questions about one named facility: search facility_name with LIKE and show every service with its quote."),
]
example_sqls = []
for q, sql, guide in examples:
    e = {"id": gid("ex:" + q), "question": [q], "sql": [sql]}
    if guide: e["usage_guidance"] = [guide]
    example_sqls.append(e)
example_sqls.sort(key=lambda x: x["id"])

text = """## PURPOSE
- Help NGO coordinators and community health workers find a facility in India for a patient who needs a specific service.
- Every field was extracted from web text, so every answer is a claim to verify, not a guarantee.

## DISAMBIGUATION
- Any question about where to find, refer or send a patient for a service near a place: answer ONLY with SELECT * FROM workspace.datathon.find_facilities(service_key, place, radius_km). Never compute distances or filter by city/state yourself; the function handles distance, aliases and PIN codes. Radius: 60 km for c_section and trauma_care, 300 for burn_care, otherwise 100 unless the user says.
- Never add keyword filters on evidence_quote for words the user mentions (e.g. "ventilator"); rank with the function, then point out matching quotes.
- Never say a place has no facilities unless find_facilities returned no rows.
- Map services to service_key: kidney/haemodialysis -> dialysis; caesarean, LSCS, obstructed labour, high-risk delivery -> c_section; newborn ICU, premature baby, SNCU -> nicu; bypass, CABG, open-heart, valve surgery -> cardiac_surgery; burns -> burn_care; MRI scan -> mri; accident, trauma -> trauma_care.
- If the user names a service outside this list, say it is not scored yet and offer a keyword search of facility_service_evidence.all_evidence and facilities_clean.description instead.
- If find_facilities returns no rows, the place was not recognised: ask for a nearby city or a PIN code.

## DATA QUALITY NOTES
- num_doctors is usually the number of doctors named on a web page, not the real staff size.
- About 14% of facilities have has_location_conflict = TRUE; their distances are unreliable.

## CONSTRAINTS
- Never invent or paraphrase evidence: quote evidence_quote verbatim.
- Never present a LOW or MEDIUM result as confirmed.

## Instructions you must follow when providing summaries
- For each recommended facility give: name, city, distance_km, confidence, the evidence_quote in quotation marks, and data_quality_notes if present.
- Recommend at most 3 facilities, and only HIGH or MEDIUM ones; mention LOW ones only as "unverified".
- When no HIGH result exists, start with: "Evidence is weak: call the facility to confirm before referring."
- End with a one-line reminder to phone ahead, giving the phone number when available."""

sample_questions = [
    "Dialysis near Darbhanga",
    "Emergency C-section near Barabanki for a woman in obstructed labour",
    "NICU near Ranchi for a 32-week premature baby",
    "Where can a patient get bypass surgery near Calicut?",
    "Is there a burn unit within reach of Jagdalpur?",
]

space = {
    "version": 2,
    "config": {"sample_questions": sorted(
        [{"id": gid("sq:" + q), "question": [q]} for q in sample_questions], key=lambda x: x["id"])},
    "data_sources": {"tables": tables},
    "instructions": {
        "text_instructions": [{"id": gid("text"), "content": [l + "\n" for l in text.splitlines()]}],
        "example_question_sqls": example_sqls,
        "sql_functions": [{"id": gid("fn:find_facilities"), "identifier": FIND}],
        "join_specs": sorted([
            {"id": gid("join:fac-ev"),
             "left": {"identifier": f"{S}.facilities_clean", "alias": "facilities_clean"},
             "right": {"identifier": f"{S}.facility_service_evidence", "alias": "facility_service_evidence"},
             "sql": ["`facilities_clean`.`facility_id` = `facility_service_evidence`.`facility_id`",
                     "--rt=FROM_RELATIONSHIP_TYPE_ONE_TO_MANY--"]},
            {"id": gid("join:ev-def"),
             "left": {"identifier": f"{S}.facility_service_evidence", "alias": "facility_service_evidence"},
             "right": {"identifier": f"{S}.service_definitions", "alias": "service_definitions"},
             "sql": ["`facility_service_evidence`.`service_key` = `service_definitions`.`service_key`",
                     "--rt=FROM_RELATIONSHIP_TYPE_MANY_TO_ONE--"]},
        ], key=lambda x: x["id"]),
        "sql_snippets": {"filters": [
            {"id": gid("f:actionable"), "display_name": "Actionable evidence (HIGH or MEDIUM)",
             "sql": ["facility_service_evidence.confidence IN ('HIGH', 'MEDIUM')"],
             "synonyms": ["credible", "reliable", "verified-ish"]},
        ]},
    },
}
assert len(text) < 3200, len(text)
print(json.dumps(space))
