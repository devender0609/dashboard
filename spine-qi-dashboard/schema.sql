-- =============================================================================
-- Spine Quality & Outcomes System — PostgreSQL schema (pilot target, v1.0)
-- =============================================================================
-- Design principles:
--   * Identifiers are separated from analytical data (patient_identifiers holds
--     PHI; every analytical table references the surrogate patient_id only).
--   * Every clinical fact is attributable to a source system and load batch.
--   * Measure definitions and MCID/PASS thresholds are versioned tables, never
--     application constants.
--   * Enumerations use lookup tables (abridged here with CHECK constraints for
--     readability; production uses reference tables + FK).
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS phi;       -- restricted: identifiers only
CREATE SCHEMA IF NOT EXISTS clinical;  -- de-identified analytical data
CREATE SCHEMA IF NOT EXISTS quality;   -- measures, thresholds, worklists
CREATE SCHEMA IF NOT EXISTS ops;       -- audit, imports, users

-- ---------------------------------------------------------------- PHI split --
CREATE TABLE phi.patient_identifiers (
    patient_id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    mrn               VARCHAR(32) UNIQUE,          -- EHR medical record number
    first_name        TEXT,
    last_name         TEXT,
    dob               DATE,
    zip_code          VARCHAR(10),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Access to phi.* is limited to roles data_entry and quality_admin via GRANTs.

-- ------------------------------------------------------------------ patients --
CREATE TABLE clinical.patients (
    patient_id        BIGINT PRIMARY KEY REFERENCES phi.patient_identifiers(patient_id),
    birth_year        SMALLINT,                    -- analytics use year, not DOB
    sex               VARCHAR(10) CHECK (sex IN ('Female','Male','Other','Unknown')),
    bmi               NUMERIC(4,1) CHECK (bmi BETWEEN 10 AND 90),
    smoking_status    VARCHAR(10) CHECK (smoking_status IN ('Never','Former','Current','Unknown')),
    insurance_category VARCHAR(30),
    preferred_language VARCHAR(30),
    travel_distance_cat VARCHAR(20),               -- derived from ZIP at load time
    clinic_location   VARCHAR(40),
    source_system     VARCHAR(40) NOT NULL DEFAULT 'manual',
    load_batch_id     BIGINT
);

CREATE TABLE clinical.patient_comorbidities (
    patient_id        BIGINT REFERENCES clinical.patients(patient_id),
    comorbidity_code  VARCHAR(20) NOT NULL,        -- ICD-10 or local code set
    comorbidity_label TEXT NOT NULL,
    PRIMARY KEY (patient_id, comorbidity_code)
);

-- ------------------------------------------------------------------ episodes --
CREATE TABLE clinical.episodes (
    episode_id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    patient_id        BIGINT NOT NULL REFERENCES clinical.patients(patient_id),
    spine_region      VARCHAR(12) NOT NULL CHECK (spine_region IN ('Cervical','Thoracic','Lumbar','Deformity')),
    primary_diagnosis_code  VARCHAR(12),           -- ICD-10
    primary_diagnosis_label TEXT,
    episode_type      VARCHAR(24) CHECK (episode_type IN ('New','Follow-up','Postoperative','Nonsurgical','Surgical evaluation')),
    treating_provider_id BIGINT REFERENCES ops.providers(provider_id),
    referral_source   VARCHAR(40),
    referral_date     DATE NOT NULL,
    first_appt_date   DATE CHECK (first_appt_date >= referral_date),
    treatment_plan_date DATE CHECK (treatment_plan_date >= referral_date),
    status            VARCHAR(20) NOT NULL DEFAULT 'Active'
                      CHECK (status IN ('Active','Closed','Lost to follow-up')),
    closure_date      DATE CHECK (closure_date >= referral_date),
    clinic_location   VARCHAR(40),
    source_system     VARCHAR(40) NOT NULL DEFAULT 'manual',
    load_batch_id     BIGINT
);
CREATE INDEX ON clinical.episodes (patient_id);
CREATE INDEX ON clinical.episodes (referral_date);

-- ----------------------------------------------------------- clinical pathway --
-- Event-log design: one row per pathway milestone, derived where possible from
-- orders/scheduling feeds so staff do not re-document care.
CREATE TABLE clinical.pathway_events (
    event_id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    episode_id        BIGINT NOT NULL REFERENCES clinical.episodes(episode_id),
    event_type        VARCHAR(40) NOT NULL CHECK (event_type IN (
                        'PT recommended','PT initiated','PT completed',
                        'Medication started','Medication stopped',
                        'Injection recommended','Injection completed',
                        'Imaging ordered','Imaging completed',
                        'Surgery recommended','Surgery scheduled','Surgery completed',
                        'Missed appointment','Follow-up contact','Episode note')),
    event_date        DATE,
    detail            TEXT,                        -- e.g., med name, imaging modality
    delay_reason      VARCHAR(60),                 -- structured list + free text
    recorded_by       BIGINT,                      -- ops.users
    source_system     VARCHAR(40) NOT NULL DEFAULT 'manual',
    UNIQUE (episode_id, event_type, event_date, detail)
);
CREATE INDEX ON clinical.pathway_events (episode_id, event_type);

CREATE TABLE quality.worklist_items (
    item_id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    episode_id        BIGINT NOT NULL REFERENCES clinical.episodes(episode_id),
    category          VARCHAR(40) NOT NULL,        -- Awaiting imaging, Overdue PROMs, ...
    recommended_action TEXT NOT NULL,
    owner_role        VARCHAR(40) NOT NULL,
    owner_user_id     BIGINT,
    due_date          DATE NOT NULL,
    status            VARCHAR(16) NOT NULL DEFAULT 'Open'
                      CHECK (status IN ('Open','In progress','Done','Dismissed')),
    resolved_at       TIMESTAMPTZ,
    resolution_note   TEXT
);

-- ---------------------------------------------------------------- procedures --
CREATE TABLE clinical.procedures (
    procedure_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    episode_id        BIGINT NOT NULL REFERENCES clinical.episodes(episode_id),
    procedure_date    DATE NOT NULL,
    procedure_type    VARCHAR(60) NOT NULL,        -- local list mapped to CPT
    cpt_codes         VARCHAR(120),
    primary_or_revision VARCHAR(10) CHECK (primary_or_revision IN ('Primary','Revision')),
    spine_region      VARCHAR(12) CHECK (spine_region IN ('Cervical','Thoracic','Lumbar','Deformity')),
    levels            SMALLINT CHECK (levels BETWEEN 1 AND 20),
    approach          VARCHAR(12) CHECK (approach IN ('Anterior','Posterior','Lateral','Combined')),
    mis_or_open       VARCHAR(4)  CHECK (mis_or_open IN ('MIS','Open')),
    operative_minutes SMALLINT CHECK (operative_minutes > 0),
    ebl_ml            SMALLINT CHECK (ebl_ml >= 0),
    length_of_stay    SMALLINT CHECK (length_of_stay >= 0),
    discharge_destination VARCHAR(40),
    surgeon_id        BIGINT REFERENCES ops.providers(provider_id),
    facility          VARCHAR(60),
    source_system     VARCHAR(40) NOT NULL DEFAULT 'manual'
);
CREATE INDEX ON clinical.procedures (episode_id);
CREATE INDEX ON clinical.procedures (procedure_date);

-- -------------------------------------------------------------- complications --
CREATE TABLE clinical.complications (
    complication_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    procedure_id      BIGINT REFERENCES clinical.procedures(procedure_id),
    episode_id        BIGINT NOT NULL REFERENCES clinical.episodes(episode_id),
    complication_type VARCHAR(50) NOT NULL,        -- reference list incl. SSI, VTE, dural tear...
    event_date        DATE NOT NULL,
    timing            VARCHAR(10) CHECK (timing IN ('Inpatient','30-day','90-day','Later')),
    severity          VARCHAR(40),                 -- clinic-approved scale
    related_to_procedure VARCHAR(10) CHECK (related_to_procedure IN ('Yes','No','Uncertain')),
    preventability    VARCHAR(30),
    ed_visit          BOOLEAN NOT NULL DEFAULT FALSE,
    readmission       BOOLEAN NOT NULL DEFAULT FALSE,
    readmission_planned BOOLEAN,                   -- adjudicated: planned vs unplanned
    reoperation       BOOLEAN NOT NULL DEFAULT FALSE,
    infection         BOOLEAN NOT NULL DEFAULT FALSE,
    neuro_deficit     BOOLEAN NOT NULL DEFAULT FALSE,
    dural_tear        BOOLEAN NOT NULL DEFAULT FALSE,
    vte               BOOLEAN NOT NULL DEFAULT FALSE,
    implant_complication BOOLEAN NOT NULL DEFAULT FALSE,
    nonunion          BOOLEAN NOT NULL DEFAULT FALSE,
    mortality         BOOLEAN NOT NULL DEFAULT FALSE,
    review_status     VARCHAR(20) NOT NULL DEFAULT 'Pending review'
                      CHECK (review_status IN ('Pending review','Adjudicated','Disputed')),
    reviewed_by       BIGINT,
    reviewed_at       TIMESTAMPTZ
);

-- -------------------------------------------------------- patient-reported outcomes --
CREATE TABLE quality.prom_instruments (
    instrument_code   VARCHAR(20) PRIMARY KEY,     -- ODI, NDI, PROMIS-PF, ...
    instrument_name   TEXT NOT NULL,
    scale_min         NUMERIC(6,1),
    scale_max         NUMERIC(6,1),
    direction         VARCHAR(8) NOT NULL CHECK (direction IN ('increase','decrease'))
);

CREATE TABLE quality.prom_timepoints (
    timepoint_code    VARCHAR(10) PRIMARY KEY,     -- baseline, 6w, 3m, 6m, 12m, 24m
    label             TEXT NOT NULL,
    offset_days       SMALLINT NOT NULL,
    window_days       SMALLINT                     -- ± allowed collection window
);

CREATE TABLE clinical.prom_scores (
    prom_id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    episode_id        BIGINT NOT NULL REFERENCES clinical.episodes(episode_id),
    instrument_code   VARCHAR(20) NOT NULL REFERENCES quality.prom_instruments(instrument_code),
    timepoint_code    VARCHAR(10) NOT NULL REFERENCES quality.prom_timepoints(timepoint_code),
    due_date          DATE,
    collected_date    DATE NOT NULL,
    score             NUMERIC(6,1) NOT NULL,
    collection_source VARCHAR(20),                 -- Portal, Clinic tablet, Phone, REDCap
    source_system     VARCHAR(40) NOT NULL DEFAULT 'manual',
    UNIQUE (episode_id, instrument_code, timepoint_code)
);
CREATE INDEX ON clinical.prom_scores (episode_id, instrument_code);

-- Versioned, administrator-controlled thresholds. Nothing hard-coded.
CREATE TABLE quality.prom_thresholds (
    threshold_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    instrument_code   VARCHAR(20) NOT NULL REFERENCES quality.prom_instruments(instrument_code),
    population        TEXT NOT NULL,               -- e.g., 'Lumbar surgery'
    mcid              NUMERIC(6,1),
    pass_threshold    NUMERIC(6,1),                -- NULL = no validated PASS exists
    direction         VARCHAR(8) NOT NULL CHECK (direction IN ('increase','decrease')),
    source            TEXT NOT NULL,               -- citation / local validation study
    version_date      DATE NOT NULL,
    approval_status   VARCHAR(30) NOT NULL DEFAULT 'Pending clinical approval',
    approved_by       BIGINT,
    superseded_by     BIGINT REFERENCES quality.prom_thresholds(threshold_id)
);

-- ------------------------------------------------------------- patient experience --
CREATE TABLE clinical.experience_surveys (
    survey_id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    episode_id        BIGINT REFERENCES clinical.episodes(episode_id),
    survey_date       DATE NOT NULL,
    overall_satisfaction SMALLINT CHECK (overall_satisfaction BETWEEN 1 AND 5),
    communication     SMALLINT CHECK (communication BETWEEN 1 AND 5),
    plan_understanding SMALLINT CHECK (plan_understanding BETWEEN 1 AND 5),
    scheduling_ease   SMALLINT CHECK (scheduling_ease BETWEEN 1 AND 5),
    wait_time         SMALLINT CHECK (wait_time BETWEEN 1 AND 5),
    responsiveness    SMALLINT CHECK (responsiveness BETWEEN 1 AND 5),
    recommend_likelihood SMALLINT CHECK (recommend_likelihood BETWEEN 0 AND 10),
    comment           TEXT,
    complaint_type    VARCHAR(40),
    resolution_status VARCHAR(16) CHECK (resolution_status IN ('Open','Resolved','')),
    resolution_days   SMALLINT
);

-- --------------------------------------------------------------- measure registry --
CREATE TABLE quality.measure_definitions (
    measure_id        VARCHAR(10) PRIMARY KEY,     -- M1, M2, ...
    name              TEXT NOT NULL,
    clinical_purpose  TEXT,
    numerator_desc    TEXT NOT NULL,
    denominator_desc  TEXT NOT NULL,
    inclusion_criteria TEXT,
    exclusion_criteria TEXT,
    target_value      NUMERIC(6,2),
    warning_value     NUMERIC(6,2),
    direction         VARCHAR(8) CHECK (direction IN ('higher','lower')),
    measurement_period VARCHAR(30),
    data_source       TEXT,
    owner_role        VARCHAR(40),
    review_frequency  VARCHAR(20),
    risk_adjustment   TEXT,
    status            VARCHAR(60) NOT NULL DEFAULT 'Draft',
    numerator_sql     TEXT,                        -- governed, reviewed SQL
    denominator_sql   TEXT
);

CREATE TABLE quality.measure_versions (
    version_id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    measure_id        VARCHAR(10) NOT NULL REFERENCES quality.measure_definitions(measure_id),
    version_label     VARCHAR(10) NOT NULL,
    change_date       DATE NOT NULL,
    change_note       TEXT NOT NULL,
    changed_by        BIGINT,
    snapshot          JSONB NOT NULL               -- full definition at that version
);

-- ------------------------------------------------------------------- operations --
CREATE TABLE ops.providers (
    provider_id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    npi               VARCHAR(10) UNIQUE,
    display_name      TEXT NOT NULL,
    role              VARCHAR(40) NOT NULL,        -- Spine surgeon, Physiatrist, APP
    active            BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE ops.users (
    user_id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email             TEXT UNIQUE NOT NULL,
    display_name      TEXT NOT NULL,
    role              VARCHAR(30) NOT NULL CHECK (role IN
                      ('clinician','quality_admin','clinic_manager','research_analyst','data_entry','executive_readonly')),
    active            BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at     TIMESTAMPTZ
);

CREATE TABLE ops.audit_log (
    audit_id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id           BIGINT REFERENCES ops.users(user_id),
    action            VARCHAR(60) NOT NULL,        -- view, export, import, edit, login...
    entity            VARCHAR(60),
    entity_id         TEXT,
    detail            JSONB
);
-- audit_log is append-only: REVOKE UPDATE, DELETE ON ops.audit_log FROM ALL;

CREATE TABLE ops.load_batches (
    load_batch_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_system     VARCHAR(40) NOT NULL,        -- csv_import, athenahealth, redcap...
    loaded_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    loaded_by         BIGINT REFERENCES ops.users(user_id),
    row_count         INTEGER,
    rejected_count    INTEGER,
    rejection_report  JSONB
);

-- ------------------------------------------------------------- security notes --
-- * Row-level security: enable RLS on clinical.* and phi.* per role.
-- * phi schema is encrypted at rest (cluster-level) and access-audited.
-- * Retention: audit_log 7 years; rejected import payloads 90 days.
-- * Backups: nightly full + WAL archiving; quarterly restore test.
