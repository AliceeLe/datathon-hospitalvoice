-- Hackathon scope cut: keep only coordinated_cases (extended), call_attempts, appointments.
-- Drops the extra objects created by 01_referral_tables.sql (they held no case data; templates are now hard-coded in the app).
DROP VIEW IF EXISTS workspace.datathon.hospital_refusals_30d
-- @@
DROP TABLE IF EXISTS workspace.datathon.patients
-- @@
DROP TABLE IF EXISTS workspace.datathon.refusals
-- @@
DROP TABLE IF EXISTS workspace.datathon.checklist_steps
-- @@
DROP TABLE IF EXISTS workspace.datathon.visit_outcomes
-- @@
DROP TABLE IF EXISTS workspace.datathon.mock_sms_outbox
-- @@
DROP TABLE IF EXISTS workspace.datathon.care_pathway_templates
-- @@
-- Patient details and the checklist live on the case row.
ALTER TABLE workspace.datathon.coordinated_cases ADD COLUMNS (
  age_years            INT     COMMENT 'Patient age (demo data only)',
  consent_to_reminders BOOLEAN COMMENT 'Patient agreed to reminders (reminders are mocked, never sent)',
  checklist            STRING  COMMENT 'JSON list [{key,title,detail,status: todo|done|blocked}] from a DRAFT template that needs clinical review'
)
-- @@
ALTER TABLE workspace.datathon.coordinated_cases ALTER COLUMN medical_history
  COMMENT 'DEMO DATA ONLY - do not enter real patient data.'
-- @@
ALTER TABLE workspace.datathon.coordinated_cases ALTER COLUMN patient_id
  COMMENT 'Unused (patient details are stored on this row).'
