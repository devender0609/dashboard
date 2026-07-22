/* config.js — instruments, timepoints, and the administrator-controlled
   MCID/PASS threshold defaults for the PROM registry.
   All thresholds are literature-derived PLACEHOLDERS pending local validation. */
(function () {
  const INSTRUMENTS = {
    "PROMIS-PF": { name: "PROMIS Physical Function", dir: +1, min: 20, max: 80 },
    "PROMIS-PI": { name: "PROMIS Pain Interference", dir: -1, min: 40, max: 85 },
    "PROMIS-SR": { name: "PROMIS Ability to Participate in Social Roles", dir: +1, min: 20, max: 80 },
    "PROMIS-FA": { name: "PROMIS Fatigue", dir: -1, min: 30, max: 85 },
    "PROMIS-AX": { name: "PROMIS Anxiety", dir: -1, min: 35, max: 85 },
    "PROMIS-DE": { name: "PROMIS Depression", dir: -1, min: 35, max: 85 },
    "ODI": { name: "Oswestry Disability Index", dir: -1, min: 0, max: 100 },
    "NDI": { name: "Neck Disability Index", dir: -1, min: 0, max: 100 },
    "SRS-22r": { name: "SRS-22r total", dir: +1, min: 1, max: 5 },
    "NRS-Pain": { name: "Numeric pain rating (0-10)", dir: -1, min: 0, max: 10 }
  };

  const TIMEPOINTS = [
    { code: "baseline", label: "Baseline", days: 0, window: null },
    { code: "6w", label: "6 weeks", days: 42, window: 14 },
    { code: "3m", label: "3 months", days: 91, window: 21 },
    { code: "6m", label: "6 months", days: 182, window: 42 },
    { code: "12m", label: "12 months", days: 365, window: 56 },
    { code: "24m", label: "24 months", days: 730, window: 84 }
  ];

  const DEFAULT_THRESHOLDS = [
    { instrument: "ODI", population: "Lumbar", mcid: 12.8, pass: 22, direction: "decrease", source: "Placeholder — pending local validation (lit. 10-15)", versionDate: "2026-06-01", status: "Pending clinical approval" },
    { instrument: "NDI", population: "Cervical", mcid: 7.5, pass: 17, direction: "decrease", source: "Placeholder — pending local validation (lit. 5.5-10)", versionDate: "2026-06-01", status: "Pending clinical approval" },
    { instrument: "PROMIS-PF", population: "Spine (all)", mcid: 4.5, pass: null, direction: "increase", source: "Placeholder — pending local validation", versionDate: "2026-06-01", status: "Pending clinical approval" },
    { instrument: "PROMIS-PI", population: "Spine (all)", mcid: 4.0, pass: null, direction: "decrease", source: "Placeholder — pending local validation", versionDate: "2026-06-01", status: "Pending clinical approval" },
    { instrument: "PROMIS-SR", population: "Spine (all)", mcid: 4.0, pass: null, direction: "increase", source: "Placeholder — pending local validation", versionDate: "2026-06-01", status: "Pending clinical approval" },
    { instrument: "PROMIS-FA", population: "Spine (all)", mcid: 4.0, pass: null, direction: "decrease", source: "Placeholder — pending local validation", versionDate: "2026-06-01", status: "Pending clinical approval" },
    { instrument: "PROMIS-AX", population: "Spine (all)", mcid: 4.0, pass: null, direction: "decrease", source: "Placeholder — pending local validation", versionDate: "2026-06-01", status: "Pending clinical approval" },
    { instrument: "PROMIS-DE", population: "Spine (all)", mcid: 4.0, pass: null, direction: "decrease", source: "Placeholder — pending local validation", versionDate: "2026-06-01", status: "Pending clinical approval" },
    { instrument: "SRS-22r", population: "Deformity", mcid: 0.4, pass: null, direction: "increase", source: "Placeholder — pending local validation", versionDate: "2026-06-01", status: "Pending clinical approval" },
    { instrument: "NRS-Pain", population: "Spine (all)", mcid: 2.0, pass: 3, direction: "decrease", source: "Placeholder — pending local validation (lit. 1.5-2.5)", versionDate: "2026-06-01", status: "Pending clinical approval" }
  ];

  // Column aliases for import auto-mapping (lowercased, stripped of non-alphanumerics)
  const ALIASES = {
    subjectId: ["subjectid", "studyid", "recordid", "record_id", "episodeid", "id", "participantid", "mrnhash", "researchid"],
    cohort: ["cohort", "region", "spineregion", "group", "diagnosisgroup"],
    anchorDate: ["anchordate", "enrollmentdate", "enrolldate", "surgerydate", "proceduredate", "indexdate", "firstvisitdate", "firstappointmentdate", "baselinedate", "startdate"],
    diagnosis: ["diagnosis", "primarydiagnosis", "dx"],
    provider: ["provider", "treatingprovider", "surgeon", "clinician"],
    instrument: ["instrument", "measure", "survey", "questionnaire", "tool", "promtype"],
    timepoint: ["timepoint", "visit", "event", "redcapevent", "redcapeventname", "eventname", "visitname", "interval", "followup", "followupinterval", "timept"],
    collectedDate: ["collecteddate", "date", "surveydate", "assessmentdate", "completeddate", "responsedate"],
    score: ["score", "value", "result", "totalscore", "tscore", "rawscore"],
    source: ["source", "mode", "method", "collectionmode", "channel"]
  };

  window.PROMConfig = { INSTRUMENTS, TIMEPOINTS, DEFAULT_THRESHOLDS, ALIASES };
  if (typeof module !== "undefined") module.exports = window.PROMConfig;
})();
