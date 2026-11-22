-- Build the Genie demo objects in workspace.datathon.
-- Reads the source catalog only; every write goes to workspace.datathon.
-- Statements are separated by lines containing only "-- @@" (see run_sql_file.py).

CREATE SCHEMA IF NOT EXISTS workspace.datathon
COMMENT 'CMU Datathon: cleaned & evidence-scored Virtue Foundation facilities for the Facility Finder Genie demo'
-- @@

-- ============================================================================
-- 1. facilities_clean: one row per facility
-- ============================================================================
CREATE OR REPLACE TABLE workspace.datathon.facilities_clean
COMMENT 'One row per healthcare facility in India (Virtue Foundation dataset, cleaned). Source fields were extracted from web pages, so every value is a claim. Fragment rows, exact duplicates and impossible coordinates are removed; quality problems are flagged rather than hidden.'
AS
WITH src AS (
  SELECT *
  FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities
  WHERE unique_id RLIKE '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'   -- drops 88 line-break fragments
  QUALIFY row_number() OVER (PARTITION BY unique_id ORDER BY name) = 1                    -- drops 11 exact duplicates
),
n AS (
  SELECT
    unique_id                                                        AS facility_id,
    nullif(nullif(trim(name), 'null'), '')                           AS facility_name,
    initcap(nullif(nullif(trim(address_city), 'null'), ''))          AS city,
    CASE lower(trim(address_stateOrRegion))
      WHEN 'tamilnadu' THEN 'Tamil Nadu' WHEN 'orissa' THEN 'Odisha'
      ELSE nullif(nullif(trim(address_stateOrRegion), 'null'), '') END AS state,
    IF(address_zipOrPostcode RLIKE '^[1-9][0-9]{5}$', address_zipOrPostcode, NULL) AS pin_code,
    IF(latitude BETWEEN 6 AND 37 AND longitude BETWEEN 68 AND 98, latitude,  NULL) AS latitude,
    IF(latitude BETWEEN 6 AND 37 AND longitude BETWEEN 68 AND 98, longitude, NULL) AS longitude,
    NOT (latitude BETWEEN 6 AND 37 AND longitude BETWEEN 68 AND 98)  AS coords_outside_india,
    CASE lower(facilityTypeId) WHEN 'farmacy' THEN 'pharmacy' WHEN 'null' THEN NULL ELSE lower(facilityTypeId) END AS facility_type,
    nullif(lower(operatorTypeId), 'null')                            AS operator_type,
    try_cast(numberDoctors AS INT)                                   AS num_doctors,
    try_cast(capacity AS INT)                                        AS num_beds,
    IF(try_cast(yearEstablished AS INT) BETWEEN 1800 AND 2026, try_cast(yearEstablished AS INT), NULL) AS year_established,
    array_join(array_distinct(coalesce(from_json(specialties, 'array<string>'), array())), ', ') AS specialties,
    nullif(nullif(officialPhone, 'null'), '')                        AS phone,
    nullif(nullif(officialWebsite, 'null'), '')                      AS website,
    IF(email RLIKE '^[^@ ]+@[^@ ]+[.][a-zA-Z]{2,}$', email, NULL)   AS email,
    nullif(nullif(trim(description), 'null'), '')                    AS description,
    source IS NULL                                                   AS is_truncated_record,
    count(*) OVER (PARTITION BY nullif(nullif(officialPhone, 'null'), '')) AS phone_shared_count,
    count(*) OVER (PARTITION BY source_content_id) - 1               AS shared_source_count
  FROM src
),
city_c AS (SELECT lower(city) c, state s, count(*) n_city,
                  percentile_approx(latitude, 0.5) c_lat, percentile_approx(longitude, 0.5) c_lon
           FROM n WHERE latitude IS NOT NULL GROUP BY 1, 2),
pin_c  AS (SELECT left(pin_code, 3) p3, count(*) n_pin,
                  percentile_approx(latitude, 0.5) p_lat, percentile_approx(longitude, 0.5) p_lon
           FROM n WHERE latitude IS NOT NULL AND pin_code IS NOT NULL GROUP BY 1),
g AS (
  SELECT n.*,
    IF(cc.n_city >= 3, round(2 * 6371 * asin(sqrt(pow(sin(radians(n.latitude - cc.c_lat) / 2), 2)
       + cos(radians(cc.c_lat)) * cos(radians(n.latitude)) * pow(sin(radians(n.longitude - cc.c_lon) / 2), 2))), 0), NULL) AS km_from_city_peers,
    IF(pc.n_pin >= 3, round(2 * 6371 * asin(sqrt(pow(sin(radians(n.latitude - pc.p_lat) / 2), 2)
       + cos(radians(pc.p_lat)) * cos(radians(n.latitude)) * pow(sin(radians(n.longitude - pc.p_lon) / 2), 2))), 0), NULL) AS km_from_pin_peers
  FROM n
  LEFT JOIN city_c cc ON cc.c = lower(n.city) AND cc.s = n.state
  LEFT JOIN pin_c  pc ON pc.p3 = left(n.pin_code, 3)
)
SELECT
  facility_id, facility_name, city, state, pin_code, latitude, longitude,
  facility_type, operator_type, num_doctors, num_beds, year_established, specialties,
  IF(phone_shared_count > 3, NULL, phone) AS phone, website, email, description,
  (coords_outside_india OR coalesce(km_from_city_peers > 50 OR km_from_pin_peers > 100, FALSE)) AS has_location_conflict,
  is_truncated_record,
  shared_source_count,
  coalesce(num_beds <= 10, FALSE)                                         AS is_small_facility,
  coalesce(num_doctors * 20 < num_beds, FALSE)                            AS staff_count_unreliable,
  nullif(concat_ws('; ',
    IF(coords_outside_india, 'coordinates were outside India and were removed', NULL),
    IF(km_from_city_peers > 50, concat('coordinates are ', km_from_city_peers, ' km from other facilities listed in ', city), NULL),
    IF(km_from_pin_peers > 100,  concat('coordinates are ', km_from_pin_peers, ' km from other facilities with PIN ', left(pin_code, 3), 'xxx'), NULL),
    IF(is_truncated_record, 'record was cut off mid-description; later fields are missing', NULL),
    IF(phone IS NOT NULL AND phone_shared_count > 3, concat('listed phone ', phone, ' is shared by ', phone_shared_count, ' facilities (likely a directory line) and was removed'), NULL),
    IF(shared_source_count > 0, concat('details come from a web page shared with ', shared_source_count, ' other facilities'), NULL),
    IF(num_beds <= 10, concat('only ', num_beds, ' beds listed'), NULL),
    IF(num_doctors * 20 < num_beds, concat(num_doctors, ' doctors listed for ', num_beds, ' beds: staff count unreliable'), NULL)
  ), '') AS data_quality_notes
FROM g
-- @@

-- ============================================================================
-- 2. service_definitions: the keyword rules behind every evidence row
-- ============================================================================
CREATE OR REPLACE TABLE workspace.datathon.service_definitions
COMMENT 'Searchable services and the keyword rules used to classify evidence. any_pattern = text that mentions the service; specific_pattern = detail that makes a claim credible; wrong_type_pattern = mentions that are a different service (e.g. ICU-only CRRT for a chronic dialysis patient).'
AS SELECT * FROM VALUES
  ('dialysis', 'Dialysis (haemodialysis / peritoneal)',
   'dialysis|haemodialysis|hemodialysis|crrt|renal replacement',
   'maintenance|chronic kidney|ckd|[0-9]+ ([a-z-]+ )?(dialysis |haemodialysis |hemodialysis )?machines|[0-9,]+ (dialysis )?sessions|times a week|nephrologist|dialysis (unit|centre|center|wing)|peritoneal|capd',
   'nephrology', 'crrt|continuous renal replacement|sled', 10),
  ('c_section', 'Emergency C-section / high-risk delivery',
   'caesarean|cesarean|c-section|c section|lscs|emergency obstetric|emergency (delivery|deliveries)|obstetric (icu|emergenc)',
   'lscs|lower segment|emergency (c-section|caesarean|cesarean|obstetric|delivery)|24 ?x ?7|24/7|round the clock|blood bank|blood cent|obstetric icu|high[- ]risk',
   'gynecologyandobstetrics|maternalfetalmedicine', NULL, 10),
  ('nicu', 'Neonatal intensive care (NICU / SNCU)',
   'nicu|neonatal intensive|neonatal icu|newborn intensive|sncu|scnu|special care neonatal',
   'level (ii|iii|2|3)|ventilat|cpap|surfactant|incubator|radiant warmer|neonatologist|[0-9]+[- ]?bed(ded|s)?( level [a-z0-9]+)? nicu|nicu (beds|with)',
   'neonatology', NULL, 15),
  ('cardiac_surgery', 'Cardiac surgery (CABG / valve / open-heart)',
   'cabg|coronary artery bypass|heart bypass|cardiac bypass|cardiac surg|cardiothoracic|ctvs|open[- ]heart|valve (replacement|repair) surg|heart surgery',
   'cabg|coronary artery bypass|valve replacement|open[- ]heart|heart[- ]lung|perfusion|[0-9,]+ (cardiac|heart|open[- ]heart|bypass) surgeries',
   'cardiacsurgery|cardiothoracicsurgery', 'interventional|angioplasty|transcatheter|ptca|post-cabg|stent|tavr|tavi', 50),
  ('burn_care', 'Burn care / burn unit',
   'burns? (unit|ward|icu|care|cent(re|er)|management|treatment|surgery)|burn injur|burns and plastic|plastic and burns',
   'burns? (unit|ward|icu)|[0-9]+[- ]?bed(ded|s)? burn|skin graft|burn intensive',
   'plasticsurgery|plasticandreconstructivesurgery', NULL, 25),
  ('mri', 'MRI scan',
   '(^|[^a-z])mri([^a-z]|$)|magnetic resonance',
   '[0-9.]+ ?t(esla)?( [a-z]+)? mri|tesla|mri (scanner|machine)|(^|[^a-z])(siemens|ge|philips)([^a-z]|$)',
   'radiology', NULL, 25),
  ('trauma_care', 'Trauma / accident emergency care',
   'trauma (centre|center|care|unit|ward|icu|team|surg)|polytrauma|accident (and|&) emergency|road traffic accident',
   'level (i|ii|1|2) trauma|trauma icu|trauma surgeon|polytrauma|24 ?x ?7|24/7|round the clock|blood bank|ct scan',
   'emergencymedicine|traumasurgery', NULL, 10)
AS t(service_key, service_label, any_pattern, specific_pattern, specialty_tag_pattern, wrong_type_pattern, km_per_evidence_point)
-- @@

-- ============================================================================
-- 3. facility_service_evidence: one row per facility x service with any evidence
-- ============================================================================
CREATE OR REPLACE TABLE workspace.datathon.facility_service_evidence
COMMENT 'One row per (facility, service) where the facility claims the service in its text or specialty tags. confidence is HIGH / MEDIUM / LOW based on how specific the evidence is, how many fields repeat it, and data-quality flags. evidence_quote is the exact supporting text.'
AS
WITH src AS (
  SELECT *
  FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities
  WHERE unique_id RLIKE '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  QUALIFY row_number() OVER (PARTITION BY unique_id ORDER BY name) = 1
),
items AS (
  SELECT unique_id AS facility_id,
    filter(concat(
        transform(coalesce(from_json(procedure,  'array<string>'), array()), x -> named_struct('src', 'procedure',  'txt', x)),
        transform(coalesce(from_json(equipment,  'array<string>'), array()), x -> named_struct('src', 'equipment',  'txt', x)),
        transform(coalesce(from_json(capability, 'array<string>'), array()), x -> named_struct('src', 'capability', 'txt', x)),
        transform(coalesce(split(nullif(description, 'null'), '(?<=[.!?])[ ]+'), array()), x -> named_struct('src', 'description', 'txt', x))),
      i -> i.txt IS NOT NULL AND length(trim(i.txt)) > 2 AND lower(trim(i.txt)) <> 'null') AS items,
    lower(coalesce(specialties, '')) AS specialty_text
  FROM src
),
ev AS (
  SELECT i.facility_id, d.service_key, d.service_label, d.specific_pattern, d.wrong_type_pattern,
         filter(i.items, x -> lower(x.txt) RLIKE d.any_pattern) AS hits,
         i.specialty_text RLIKE d.specialty_tag_pattern AS has_specialty_tag
  FROM items i CROSS JOIN workspace.datathon.service_definitions d
),
ev2 AS (
  SELECT ev.*,
    filter(hits, x -> lower(x.txt) RLIKE specific_pattern
                      AND NOT coalesce(lower(x.txt) RLIKE wrong_type_pattern, FALSE)) AS specific_hits,
    size(array_distinct(transform(hits, x -> x.src)))      AS n_fields,
    (wrong_type_pattern IS NOT NULL AND size(hits) > 0
      AND size(filter(hits, x -> NOT lower(x.txt) RLIKE wrong_type_pattern)) = 0) AS only_wrong_type
  FROM ev
  WHERE size(hits) > 0 OR has_specialty_tag
),
lvl AS (
  SELECT ev2.*,
    CASE WHEN size(hits) = 0 THEN 'specialty tag only'
         WHEN only_wrong_type THEN 'different service type'
         WHEN size(specific_hits) > 0 THEN 'specific'
         ELSE 'generic claim' END AS evidence_level,
    coalesce(try_element_at(specific_hits, 1), try_element_at(hits, 1)) AS best
  FROM ev2
)
SELECT
  l.facility_id, l.service_key, l.service_label,
  l.evidence_level,
  CASE
    WHEN l.evidence_level IN ('specialty tag only', 'different service type') OR f.has_location_conflict THEN 'LOW'
    WHEN l.evidence_level = 'specific' AND l.n_fields >= 2 AND NOT (f.is_small_facility OR f.is_truncated_record) THEN 'HIGH'
    ELSE 'MEDIUM'
  END AS confidence,
  concat_ws(' ',
    CASE l.evidence_level
      WHEN 'specific'               THEN 'Specific evidence (details such as equipment, volumes, staff or unit type).'
      WHEN 'generic claim'          THEN 'Only a generic claim that the service exists; no supporting detail.'
      WHEN 'different service type' THEN 'Text only describes a related but different service (e.g. ICU-only CRRT, not routine dialysis).'
      ELSE 'Only a specialty tag; no text mentions the service.' END,
    IF(l.n_fields > 0, concat('Mentioned in ', l.n_fields, ' field(s).'), NULL),
    IF(f.has_location_conflict, 'Location is contradictory; verify the address.', NULL),
    IF(f.is_small_facility, 'Very small facility for this service.', NULL),
    IF(f.is_truncated_record, 'Record is incomplete.', NULL)) AS confidence_reason,
  trim(l.best.txt) AS evidence_quote,
  l.best.src       AS quote_source,
  array_join(slice(array_distinct(transform(l.hits, x -> trim(x.txt))), 1, 6), ' | ') AS all_evidence,
  l.n_fields       AS n_fields_mentioning
FROM lvl l
JOIN workspace.datathon.facilities_clean f ON f.facility_id = l.facility_id
-- @@

-- ============================================================================
-- 4. place_lookup: place name / PIN -> coordinates
-- ============================================================================
CREATE OR REPLACE TABLE workspace.datathon.place_lookup
COMMENT 'Resolves a place a user mentions (city, common alias, district HQ, 6-digit PIN or 3-digit PIN prefix) to coordinates. City and PIN rows are the median location of facilities listed there; manual rows are district headquarters added for the demo.'
AS
WITH good AS (SELECT * FROM workspace.datathon.facilities_clean WHERE latitude IS NOT NULL AND NOT has_location_conflict),
city AS (
  SELECT lower(city) AS place_name, 'city' AS place_type, state,
         percentile_approx(latitude, 0.5) AS latitude, percentile_approx(longitude, 0.5) AS longitude, count(*) AS n_facilities
  FROM good WHERE city IS NOT NULL GROUP BY lower(city), state
),
pin6 AS (
  SELECT pin_code AS place_name, 'pin_code' AS place_type, max(state) AS state,
         percentile_approx(latitude, 0.5), percentile_approx(longitude, 0.5), count(*)
  FROM good WHERE pin_code IS NOT NULL GROUP BY pin_code
),
pin3 AS (
  SELECT left(pin_code, 3) AS place_name, 'pin_prefix' AS place_type, mode(state) AS state,
         percentile_approx(latitude, 0.5), percentile_approx(longitude, 0.5), count(*)
  FROM good WHERE pin_code IS NOT NULL GROUP BY left(pin_code, 3)
),
alias AS (SELECT * FROM VALUES
  ('calicut','kozhikode'),('kozhikode','calicut'),('bangalore','bengaluru'),('bengaluru','bangalore'),
  ('bombay','mumbai'),('madras','chennai'),('calcutta','kolkata'),('gurgaon','gurugram'),('gurugram','gurgaon'),
  ('trivandrum','thiruvananthapuram'),('thiruvananthapuram','trivandrum'),('cochin','kochi'),('kochi','cochin'),
  ('ernakulam','kochi'),('baroda','vadodara'),('poona','pune'),('banaras','varanasi'),('benares','varanasi'),
  ('allahabad','prayagraj'),('prayagraj','allahabad'),('mysore','mysuru'),('mysuru','mysore'),
  ('mangalore','mangaluru'),('mangaluru','mangalore'),('pondicherry','puducherry'),('puducherry','pondicherry')
  AS a(alias, canonical)),
aliased AS (
  SELECT a.alias, 'city_alias', c.state, c.latitude, c.longitude, c.n_facilities
  FROM alias a JOIN city c ON c.place_name = a.canonical
  WHERE NOT EXISTS (SELECT 1 FROM city c2 WHERE c2.place_name = a.alias)
),
manual AS (SELECT * FROM VALUES
  ('barabanki', 'district_hq', 'Uttar Pradesh', 26.927, 81.183, 0),
  ('jagdalpur', 'district_hq', 'Chhattisgarh', 19.082, 82.022, 0),
  ('bastar',    'district_hq', 'Chhattisgarh', 19.082, 82.022, 0)
  AS m(place_name, place_type, state, latitude, longitude, n_facilities)
  WHERE m.place_name NOT IN (SELECT place_name FROM city))
SELECT * FROM city UNION ALL SELECT * FROM pin6 UNION ALL SELECT * FROM pin3
UNION ALL SELECT * FROM aliased UNION ALL SELECT * FROM manual
-- @@

-- ============================================================================
-- 5. find_facilities(service, place, radius_km): the trusted ranking logic
-- ============================================================================
CREATE OR REPLACE FUNCTION workspace.datathon.find_facilities(
  service_key STRING COMMENT 'One of: dialysis, c_section, nicu, cardiac_surgery, burn_care, mri, trauma_care',
  place       STRING COMMENT 'City, alias, district HQ, 6-digit PIN code or 3-digit PIN prefix, e.g. Darbhanga, Calicut, 847, 834001',
  radius_km   DOUBLE COMMENT 'Search radius in km. Use 100 when the user gives none; widen to 300 for rare services like burn_care')
RETURNS TABLE (
  rank_no INT, facility_name STRING, city STRING, state STRING, distance_km DOUBLE,
  confidence STRING, evidence_level STRING, evidence_quote STRING, quote_source STRING,
  confidence_reason STRING, data_quality_notes STRING, phone STRING, website STRING,
  facility_type STRING, num_beds INT, matched_place STRING)
COMMENT 'Finds facilities offering a service near a place and ranks them: HIGH/MEDIUM rows first, ordered by confidence points (HIGH 6, MEDIUM 4) minus distance_km / km_per_evidence_point for that service; LOW rows last, nearest first. Returns the exact evidence quote and the reason for the confidence level. Returns no rows if the place is unknown.'
RETURN
  WITH origin AS (
    SELECT p.place_name, p.place_type, p.state, p.latitude AS lat0, p.longitude AS lon0
    FROM workspace.datathon.place_lookup p
    WHERE p.place_name = lower(trim(find_facilities.place))
       OR (trim(find_facilities.place) RLIKE '^[1-9][0-9]{2}$' AND p.place_type = 'pin_prefix'
           AND p.place_name = trim(find_facilities.place))
    ORDER BY CASE p.place_type WHEN 'pin_code' THEN 0 WHEN 'city' THEN 1 WHEN 'city_alias' THEN 2
                               WHEN 'district_hq' THEN 3 ELSE 4 END, p.n_facilities DESC
    LIMIT 1
  ),
  scored AS (
    SELECT f.facility_name, f.city, f.state, e.confidence, e.evidence_level, e.evidence_quote, e.quote_source,
           e.confidence_reason, f.data_quality_notes, f.phone, f.website, f.facility_type, f.num_beds,
           concat(o.place_name, ' (', o.place_type, ', ', o.state, ')') AS matched_place,
           round(2 * 6371 * asin(sqrt(pow(sin(radians(f.latitude - o.lat0) / 2), 2)
             + cos(radians(o.lat0)) * cos(radians(f.latitude)) * pow(sin(radians(f.longitude - o.lon0) / 2), 2))), 1) AS distance_km,
           d.km_per_evidence_point
    FROM workspace.datathon.facility_service_evidence e
    JOIN workspace.datathon.facilities_clean f ON f.facility_id = e.facility_id
    JOIN workspace.datathon.service_definitions d ON d.service_key = e.service_key
    CROSS JOIN origin o
    WHERE e.service_key = find_facilities.service_key AND f.latitude IS NOT NULL
  )
  SELECT CAST(row_number() OVER (ORDER BY
           IF(confidence = 'LOW', 1, 0),                                         -- LOW (tag-only / contradictory) always last
           CASE confidence WHEN 'HIGH' THEN 6 ELSE 4 END - distance_km / km_per_evidence_point DESC,
           distance_km) AS INT) AS rank_no,
         facility_name, city, state, distance_km, confidence, evidence_level, evidence_quote, quote_source,
         confidence_reason, data_quality_notes, phone, website, facility_type, num_beds, matched_place
  FROM scored
  WHERE distance_km <= find_facilities.radius_km
