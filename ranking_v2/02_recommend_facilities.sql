-- Ranking v2: one deterministic recommendation function used by the app and by both Genie spaces.
-- Run with:  python3 ../genie/run_sql_file.py 02_recommend_facilities.sql
-- Needs workspace.datathon.facility_trust_flags (load_trust_flags.py) and the tables from ../genie/01_build_tables.sql.
--
-- ALGORITHM
--  1. need: one of dialysis, c_section, nicu, cardiac_surgery, burn_care, mri, trauma_care, general_care
--  2. place: coordinates "lat, lon" | 6-digit PIN | city / alias / district HQ | 3-digit PIN prefix |
--            or a full address (the PIN inside it, else each comma-separated part, is tried)
--  3. evidence confidence (specialist): facility_service_evidence.confidence (HIGH / MEDIUM / LOW)
--     general care: fit 4 = text mentions general medicine / OPD / check-ups; 3 = other general facility;
--                   single-speciality places (dental, eye, IVF, cosmetic, physio, lab-only) are excluded
--  4. trust checks: LOW if location conflict, likely merged record or 3+ warning signs;
--                   at most MEDIUM if the source page feeds 20+ facilities or many claims rest on little text
--  5. score = points (HIGH 6 / MEDIUM 4; general: fit + 1 government/charitable + 0.5 own phone − 1 per warning)
--             − distance_km / km_per_point   (general care: 5 km per point)
--  6. order: LOW last, score high → low, nearer first; radius = default for the need, doubled once if fewer
--     than 3 non-LOW results
-- Refusal feedback (−1 point per recent refusal, max 3) is applied by the app per coordinator.

-- @@
CREATE OR REPLACE FUNCTION workspace.datathon.recommend_facilities(
  need  STRING COMMENT 'dialysis | c_section | nicu | cardiac_surgery | burn_care | mri | trauma_care | general_care',
  place STRING COMMENT 'Where the patient is: "lat, lon", a 6-digit PIN, a city/district, or a full address')
RETURNS TABLE (
  rank_no INT, facility_id STRING, facility_name STRING, city STRING, state STRING, distance_km DOUBLE,
  confidence STRING, score DOUBLE, score_explained STRING, evidence_level STRING, evidence_quote STRING,
  quote_source STRING, confidence_reason STRING, warnings STRING, phone STRING, website STRING,
  facility_type STRING, num_beds INT, matched_place STRING, radius_km DOUBLE)
COMMENT 'Recommends up to 5 facilities for a need near a place. Score = confidence points (HIGH 6, MEDIUM 4) minus distance / km-per-point for the service; trust flags can lower confidence; LOW is always last. Returns the evidence quote, the reason for the confidence, the score arithmetic and any data warnings for every row.'
RETURN
  WITH q AS (
    SELECT lower(trim(recommend_facilities.need)) AS need_key, trim(recommend_facilities.place) AS raw_place
  ),
  -- ── where is the patient? ────────────────────────────────────────────────
  coord AS (
    SELECT CAST(regexp_extract(raw_place, '^\\s*(-?[0-9]+(\\.[0-9]+)?)\\s*,', 1) AS DOUBLE) AS lat0,
           CAST(regexp_extract(raw_place, ',\\s*(-?[0-9]+(\\.[0-9]+)?)\\s*$', 1) AS DOUBLE) AS lon0, raw_place
    FROM q WHERE raw_place RLIKE '^\\s*-?[0-9]+(\\.[0-9]+)?\\s*,\\s*-?[0-9]+(\\.[0-9]+)?\\s*$'
  ),
  tries AS (                                   -- candidate strings to look up, best first
    SELECT regexp_extract(raw_place, '([1-9][0-9]{5})', 1) AS t, 0 AS pri FROM q
    UNION ALL SELECT lower(raw_place), 1 FROM q
    UNION ALL SELECT lower(trim(p)), 2 + pos FROM q LATERAL VIEW posexplode(split(raw_place, ',')) AS pos, p
  ),
  looked AS (
    SELECT p.place_name, p.place_type, p.state, p.latitude AS lat0, p.longitude AS lon0,
           row_number() OVER (ORDER BY t.pri,
             CASE p.place_type WHEN 'pin_code' THEN 0 WHEN 'city' THEN 1 WHEN 'city_alias' THEN 2
                               WHEN 'district_hq' THEN 3 ELSE 4 END, p.n_facilities DESC) AS rn
    FROM tries t JOIN workspace.datathon.place_lookup p ON p.place_name = t.t
    WHERE t.t IS NOT NULL AND t.t <> ''
  ),
  origin AS (
    SELECT lat0, lon0, concat('coordinates ', raw_place) AS matched_place FROM coord
    UNION ALL
    SELECT lat0, lon0, concat(place_name, ' (', place_type, coalesce(concat(', ', state), ''), ')')
    FROM looked WHERE rn = 1 AND NOT EXISTS (SELECT 1 FROM coord)
  ),
  -- ── service settings ─────────────────────────────────────────────────────
  cfg AS (
    SELECT need_key,
           CASE WHEN need_key = 'general_care' THEN 5.0
                ELSE (SELECT km_per_evidence_point FROM workspace.datathon.service_definitions WHERE service_key = need_key) END AS kpp,
           CASE need_key WHEN 'general_care' THEN 30.0 WHEN 'cardiac_surgery' THEN 250.0 WHEN 'burn_care' THEN 200.0
                         ELSE 100.0 END AS radius0
    FROM q
  ),
  trust AS (
    SELECT unique_id AS facility_id, max(f_merged) AS merged, max(n_signs) AS n_signs,
           max(f_shared_page_20) AS shared_page_20, max(f_many_claims_little_text) AS thin_claims,
           max(max_url_share) AS max_url_share
    FROM workspace.datathon.facility_trust_flags GROUP BY unique_id
  ),
  -- ── candidates: specialist services ──────────────────────────────────────
  spec AS (
    SELECT f.facility_id, f.facility_name, f.city, f.state, f.latitude, f.longitude, f.phone, f.website,
           f.facility_type, f.num_beds, f.has_location_conflict, f.data_quality_notes,
           e.confidence AS base_conf, e.evidence_level, e.evidence_quote, e.quote_source, e.confidence_reason,
           CAST(NULL AS DOUBLE) AS general_points
    FROM workspace.datathon.facility_service_evidence e
    JOIN workspace.datathon.facilities_clean f ON f.facility_id = e.facility_id
    WHERE e.service_key = (SELECT need_key FROM q)
  ),
  -- ── candidates: general care ─────────────────────────────────────────────
  gen AS (
    SELECT f.facility_id, f.facility_name, f.city, f.state, f.latitude, f.longitude, f.phone, f.website,
           f.facility_type, f.num_beds, f.has_location_conflict, f.data_quality_notes,
           CAST(NULL AS STRING) AS base_conf,
           IF(g.mentions, 'mentions general care', 'general facility') AS evidence_level,
           coalesce(nullif(regexp_extract(f.description,
             '([^.]*(general medicine|general physician|family medicine|internal medicine|OPD|out-?patient|health check-?up)[^.]*\\.?)', 1), ''),
             concat_ws(' · ', f.facility_type, nullif(f.specialties, ''))) AS evidence_quote,
           IF(g.mentions, 'description', 'facility type / specialties') AS quote_source,
           IF(g.mentions, 'Text mentions general medicine, OPD or health check-ups.',
              'General facility; check-ups are not explicitly mentioned.') AS confidence_reason,
           IF(g.mentions, 4.0, 3.0)
             + IF(coalesce(f.operator_type, '') RLIKE 'public|gov|charit|ngo|trust', 1.0, 0.0)
             + IF(f.phone IS NOT NULL, 0.5, 0.0) AS general_points
    FROM workspace.datathon.facilities_clean f
    CROSS JOIN LATERAL (SELECT lower(concat_ws(' ', f.description, f.specialties)) RLIKE
        'general medicine|general physician|family medicine|internal medicine|generalsurgery|familymedicine|internalmedicine|(^|[^a-z])opd([^a-z]|$)|out-?patient|health check' AS mentions) g
    WHERE (SELECT need_key FROM q) = 'general_care'
      AND coalesce(f.facility_type, '') IN ('hospital', 'clinic', 'doctor', '')
      AND NOT (lower(concat_ws(' ', f.facility_name, f.specialties)) RLIKE
               'dental|dentist|eye|ophthal|ivf|fertility|cosmetic|hair|skin|derma|physio|patholog|diagnostic|(^|[^a-z])lab([^a-z]|$)'
               AND NOT g.mentions)
  ),
  cand AS (SELECT * FROM spec UNION ALL SELECT * FROM gen),
  measured AS (
    SELECT c.*, o.matched_place, cfg.kpp, cfg.radius0,
           round(2 * 6371 * asin(sqrt(pow(sin(radians(c.latitude - o.lat0) / 2), 2)
             + cos(radians(o.lat0)) * cos(radians(c.latitude)) * pow(sin(radians(c.longitude - o.lon0) / 2), 2))), 1) AS distance_km,
           coalesce(t.merged, FALSE) AS merged, coalesce(t.n_signs, 0) AS n_signs,
           coalesce(t.shared_page_20, FALSE) AS shared_page_20, coalesce(t.thin_claims, FALSE) AS thin_claims,
           coalesce(t.max_url_share, 0) AS max_url_share
    FROM cand c CROSS JOIN origin o CROSS JOIN cfg
    LEFT JOIN trust t ON t.facility_id = c.facility_id
    WHERE c.latitude IS NOT NULL
  ),
  graded AS (
    SELECT m.*,
      CASE
        WHEN m.has_location_conflict OR m.merged OR m.n_signs >= 3 OR m.base_conf = 'LOW' THEN 'LOW'
        WHEN m.general_points IS NOT NULL THEN IF(m.evidence_level = 'mentions general care' AND NOT (m.shared_page_20 OR m.thin_claims), 'HIGH', 'MEDIUM')
        WHEN m.base_conf = 'HIGH' AND (m.shared_page_20 OR m.thin_claims) THEN 'MEDIUM'
        ELSE m.base_conf END AS confidence,
      CAST(m.has_location_conflict AS INT) + CAST(m.merged AS INT) + CAST(m.shared_page_20 AS INT) + CAST(m.thin_claims AS INT) AS n_warn
    FROM measured m
  ),
  scored AS (
    SELECT g.*,
      round(coalesce(g.general_points - g.n_warn, CASE g.confidence WHEN 'HIGH' THEN 6.0 WHEN 'MEDIUM' THEN 4.0 ELSE 0.0 END)
            - g.distance_km / g.kpp, 2) AS score,
      concat(
        IF(g.general_points IS NOT NULL,
           concat('general ', g.general_points, IF(g.n_warn > 0, concat(' − ', g.n_warn, ' warning(s)'), '')),
           concat(g.confidence, ' ', CASE g.confidence WHEN 'HIGH' THEN '6' WHEN 'MEDIUM' THEN '4' ELSE '0' END)),
        ' − ', g.distance_km, ' km ÷ ', CAST(g.kpp AS INT), ' = ',
        round(coalesce(g.general_points - g.n_warn, CASE g.confidence WHEN 'HIGH' THEN 6.0 WHEN 'MEDIUM' THEN 4.0 ELSE 0.0 END)
              - g.distance_km / g.kpp, 2),
        IF(g.confidence = 'LOW', ' (LOW: ranked last)', '')) AS score_explained,
      nullif(concat_ws('; ',
        IF(g.merged, 'record may describe more than one facility (branches/chain or mixed contacts)', NULL),
        IF(g.shared_page_20, concat('details come from a directory page listing ', g.max_url_share, ' facilities'), NULL),
        IF(g.thin_claims, 'many services listed with very little supporting text', NULL),
        IF(g.n_signs >= 3, concat(g.n_signs, ' data-quality warning signs'), NULL),
        g.data_quality_notes), '') AS warnings,
      count(IF(g.confidence <> 'LOW' AND g.distance_km <= g.radius0, 1, NULL)) OVER () AS n_inside
    FROM graded g
  ),
  ranged AS (
    SELECT s.*, IF(s.n_inside >= 3, s.radius0, 2 * s.radius0) AS radius_used FROM scored s
  )
  SELECT CAST(row_number() OVER (ORDER BY IF(confidence = 'LOW', 1, 0), score DESC, distance_km) AS INT) AS rank_no,
         facility_id, facility_name, city, state, distance_km, confidence, score, score_explained, evidence_level,
         evidence_quote, quote_source, confidence_reason, warnings, phone, website, facility_type, num_beds,
         matched_place, radius_used AS radius_km
  FROM ranged
  WHERE distance_km <= radius_used
  ORDER BY rank_no
  LIMIT 5
-- @@
GRANT EXECUTE ON FUNCTION workspace.datathon.recommend_facilities TO `7c00f9ea-557e-493a-b32c-7d27d564c226`
-- @@
GRANT SELECT ON TABLE workspace.datathon.facilities_clean TO `7c00f9ea-557e-493a-b32c-7d27d564c226`
-- @@
GRANT SELECT ON TABLE workspace.datathon.facility_service_evidence TO `7c00f9ea-557e-493a-b32c-7d27d564c226`
-- @@
GRANT SELECT ON TABLE workspace.datathon.place_lookup TO `7c00f9ea-557e-493a-b32c-7d27d564c226`
-- @@
GRANT SELECT ON TABLE workspace.datathon.service_definitions TO `7c00f9ea-557e-493a-b32c-7d27d564c226`
-- @@
GRANT SELECT ON TABLE workspace.datathon.facility_trust_flags TO `7c00f9ea-557e-493a-b32c-7d27d564c226`
