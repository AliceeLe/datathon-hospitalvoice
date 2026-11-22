-- Q4 Cardiac surgery (CABG / valve replacement) near Kozhikode a.k.a. Calicut, Kerala
-- Persona: NGO coordinator in Kozhikode; patient told after angiography that he needs bypass surgery
-- Read-only: SELECTs from the source catalog; nothing is written.
WITH
origin AS (                                   -- input location -> one (lat0, lon0) point
  SELECT percentile(latitude, 0.5) AS lat0, percentile(longitude, 0.5) AS lon0
  FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities   -- median location of facilities listed in Kozhikode/Calicut
  WHERE lower(address_city) IN ('kozhikode', 'calicut') AND latitude BETWEEN 6 AND 37 AND longitude BETWEEN 68 AND 98
),
base AS (                                     -- clean, de-duplicated facilities
  SELECT *
  FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities
  WHERE unique_id RLIKE '^[0-9a-f]{8}-[0-9a-f]{4}-'      -- drop 88 line-break fragment rows
    AND latitude BETWEEN 6 AND 37 AND longitude BETWEEN 68 AND 98   -- drop 6 coordinates outside India
  QUALIFY row_number() OVER (PARTITION BY unique_id ORDER BY name) = 1   -- drop 11 exact duplicate rows
),
city_center AS (                              -- median location of each city's facilities
  SELECT lower(address_city) AS city, address_stateOrRegion AS state, count(*) AS n_city,
         percentile_approx(latitude, 0.5) AS c_lat, percentile_approx(longitude, 0.5) AS c_lon
  FROM base GROUP BY 1, 2
),
pin_center AS (                               -- median location per 3-digit PIN sorting district
  SELECT left(address_zipOrPostcode, 3) AS pin3, count(*) AS n_pin,
         percentile_approx(latitude, 0.5) AS p_lat, percentile_approx(longitude, 0.5) AS p_lon
  FROM base WHERE address_zipOrPostcode RLIKE '^[1-9][0-9]{5}$' GROUP BY 1
),
pin_zone AS (                                 -- first PIN digit expected for each state (India Post zones)
  SELECT * FROM VALUES
    ('1','Delhi'),('1','Haryana'),('1','Punjab'),('1','Himachal Pradesh'),('1','Jammu And Kashmir'),('1','Chandigarh'),
    ('2','Uttar Pradesh'),('2','Uttarakhand'),('3','Rajasthan'),('3','Gujarat'),
    ('4','Maharashtra'),('4','Madhya Pradesh'),('4','Chhattisgarh'),('4','Goa'),
    ('5','Andhra Pradesh'),('5','Telangana'),('5','Karnataka'),('6','Tamil Nadu'),('6','Kerala'),('6','Puducherry'),
    ('7','West Bengal'),('7','Odisha'),('7','Assam'),('8','Bihar'),('8','Jharkhand') AS t(digit, state)
),
scored AS (
  SELECT
    b.name, b.address_city, b.address_stateOrRegion AS state, b.address_zipOrPostcode AS pin,
    b.facilityTypeId AS type, b.operatorTypeId AS operator,
    try_cast(b.numberDoctors AS INT) AS doctors, try_cast(b.capacity AS INT) AS beds,
    round(2 * 6371 * asin(sqrt(pow(sin(radians(b.latitude - o.lat0) / 2), 2) + cos(radians(o.lat0)) * cos(radians(b.latitude)) * pow(sin(radians(b.longitude - o.lon0) / 2), 2))), 1) AS dist_km,
    -- location consistency: are the coordinates near the other facilities of the same city / PIN district?
    IF(cc.n_city >= 3, round(2 * 6371 * asin(sqrt(pow(sin(radians(b.latitude - cc.c_lat) / 2), 2) + cos(radians(cc.c_lat)) * cos(radians(b.latitude)) * pow(sin(radians(b.longitude - cc.c_lon) / 2), 2))), 1), NULL) AS km_from_city_peers,
    IF(pc.n_pin  >= 3, round(2 * 6371 * asin(sqrt(pow(sin(radians(b.latitude - pc.p_lat) / 2), 2) + cos(radians(pc.p_lat)) * cos(radians(b.latitude)) * pow(sin(radians(b.longitude - pc.p_lon) / 2), 2))), 1),  NULL) AS km_from_pin_peers,
    -- where does the specific evidence appear? (each column = independent extraction from web text)
    lower(b.procedure)   RLIKE 'cabg|coronary artery bypass|heart bypass|cardiac bypass|cardiac surg|cardiothoracic|ctvs|open[- ]heart|valve (replacement|repair) surg|heart surgery' AS ev_procedure,
    lower(b.equipment)   RLIKE 'cabg|coronary artery bypass|heart bypass|cardiac bypass|cardiac surg|cardiothoracic|ctvs|open[- ]heart|valve (replacement|repair) surg|heart surgery' AS ev_equipment,
    lower(b.capability)  RLIKE 'cabg|coronary artery bypass|heart bypass|cardiac bypass|cardiac surg|cardiothoracic|ctvs|open[- ]heart|valve (replacement|repair) surg|heart surgery' AS ev_capability,
    lower(b.description) RLIKE 'cabg|coronary artery bypass|heart bypass|cardiac bypass|cardiac surg|cardiothoracic|ctvs|open[- ]heart|valve (replacement|repair) surg|heart surgery' AS ev_description,
    lower(b.specialties) RLIKE 'cardiothoracicsurgery|cardiacsurgery'   AS ev_specialty_only,
    lower(concat_ws(' ', b.description, b.procedure, b.equipment, b.capability)) RLIKE 'cath lab|cardiac icu|ccu|iccu|heart[- ]lung machine|perfusion' AS has_support,
    lower(concat_ws(' ', b.description, b.procedure, b.equipment, b.capability)) RLIKE 'refer(red|ral)? (to|out)|coming soon|not available|no facility for|visiting consultant' AS has_negative,
    -- the exact text that supports the match (window around the keyword): description first, then the lists
    nullif(regexp_extract(b.description, '(?is)([^.]{0,120}(?:cabg|coronary artery bypass|heart bypass|cardiac bypass|cardiac surg|cardiothoracic|ctvs|open[- ]heart|valve (replacement|repair) surg|heart surgery)[^.]{0,120})', 1), '') AS q_description,
    nullif(regexp_extract(b.capability,  '(?is)([^"]{0,100}(?:cabg|coronary artery bypass|heart bypass|cardiac bypass|cardiac surg|cardiothoracic|ctvs|open[- ]heart|valve (replacement|repair) surg|heart surgery)[^"]{0,100})', 1), '') AS q_capability,
    nullif(regexp_extract(b.procedure,   '(?is)([^"]{0,100}(?:cabg|coronary artery bypass|heart bypass|cardiac bypass|cardiac surg|cardiothoracic|ctvs|open[- ]heart|valve (replacement|repair) surg|heart surgery)[^"]{0,100})', 1), '') AS q_procedure,
    nullif(regexp_extract(b.equipment,   '(?is)([^"]{0,100}(?:cabg|coronary artery bypass|heart bypass|cardiac bypass|cardiac surg|cardiothoracic|ctvs|open[- ]heart|valve (replacement|repair) surg|heart surgery)[^"]{0,100})', 1), '') AS q_equipment,
    -- risk flags
    b.source IS NULL AS truncated_record,
    count(*) OVER (PARTITION BY b.source_content_id) - 1 AS shares_source_with,
    (z.digit IS NOT NULL AND left(b.address_zipOrPostcode, 1) <> z.digit) AS pin_state_mismatch
  FROM base b
  CROSS JOIN origin o
  LEFT JOIN (SELECT state, min(digit) AS digit FROM pin_zone GROUP BY state) z
    ON z.state = b.address_stateOrRegion
  LEFT JOIN city_center cc ON cc.city = lower(b.address_city) AND cc.state = b.address_stateOrRegion
  LEFT JOIN pin_center  pc ON pc.pin3 = left(b.address_zipOrPostcode, 3)
),
ranked AS (
  SELECT *,
    3 * (int(ev_procedure) + int(ev_equipment)) + 2 * (int(ev_capability) + int(ev_description))
      + int(ev_specialty_only) + int(has_support) - 2 * int(has_negative) AS evidence_score,
    int(ev_procedure) + int(ev_equipment) + int(ev_capability) + int(ev_description) AS n_specific_cols,
    coalesce(km_from_city_peers > 50 OR km_from_pin_peers > 75, FALSE) AS geo_conflict,
    coalesce(beds <= 10, FALSE) AS small_facility                     -- advanced service claimed by a tiny unit
  FROM scored
  WHERE dist_km <= 120
    AND (ev_procedure OR ev_equipment OR ev_capability OR ev_description OR ev_specialty_only)
)
SELECT
  name, address_city, state, pin, type, operator, doctors, beds, dist_km,
  evidence_score,
  round(evidence_score - dist_km / 50, 1) AS match_score,   -- every 50 km costs one evidence point
  CASE
    WHEN geo_conflict OR n_specific_cols = 0 THEN 'LOW'                -- location unknown, or specialty tag only
    WHEN n_specific_cols >= 2 AND has_support
         AND NOT (has_negative OR truncated_record OR pin_state_mismatch OR small_facility)               THEN 'HIGH'
    WHEN n_specific_cols >= 1 AND NOT has_negative                                                            THEN 'MEDIUM'
    ELSE 'LOW'
  END AS confidence,
  concat_ws(',', IF(ev_procedure,'procedure',NULL), IF(ev_equipment,'equipment',NULL),
                 IF(ev_capability,'capability',NULL), IF(ev_description,'description',NULL),
                 IF(ev_specialty_only AND n_specific_cols = 0,'specialty only',NULL)) AS evidence_in,
  concat_ws('; ', IF(truncated_record,'record truncated',NULL),
                  IF(pin_state_mismatch,'PIN zone != state',NULL),
                  IF(shares_source_with > 0, concat('source page shared with ', shares_source_with, ' other(s)'), NULL),
                  IF(has_negative,'negative/referral wording',NULL),
                  IF(small_facility, concat('only ', beds, ' beds listed'), NULL),
                  IF(doctors IS NOT NULL AND beds IS NOT NULL AND doctors * 20 < beds,
                     concat(doctors, ' doctors for ', beds, ' beds (staff count unreliable)'), NULL),
                  IF(geo_conflict, concat('LOCATION CONFLICT: coords ',
                     coalesce(km_from_city_peers, 0), ' km from other ', address_city, ' facilities, ',
                     coalesce(km_from_pin_peers, 0), ' km from PIN ', left(pin, 3), 'xxx peers'), NULL)) AS risk_flags,
  CASE WHEN q_description IS NOT NULL THEN 'description' WHEN q_capability IS NOT NULL THEN 'capability'
       WHEN q_procedure IS NOT NULL THEN 'procedure' WHEN q_equipment IS NOT NULL THEN 'equipment'
       ELSE 'none (specialty tag only)' END AS quote_from,
  trim(coalesce(q_description, q_capability, q_procedure, q_equipment)) AS evidence_quote,
  q_description AS description_quote
FROM ranked
ORDER BY CASE confidence WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END, match_score DESC, dist_km ASC
LIMIT 10
