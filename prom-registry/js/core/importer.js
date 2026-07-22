/* importer.js — two-file import (enrollment + scores) with column mapping.
   Handles the header variety of REDCap, PROMIS/Assessment Center, and portal
   exports: it auto-maps columns by alias, lets the user correct the mapping,
   normalizes instrument and timepoint labels, validates, and reports rejects. */
(function () {
  const { ALIASES, INSTRUMENTS, TIMEPOINTS } = window.PROMConfig;
  const norm = h => String(h || "").toLowerCase().replace(/[^a-z0-9]/g, "");

  // instrument label normalization (accepts many spellings)
  const INSTR_MAP = {};
  Object.keys(INSTRUMENTS).forEach(k => { INSTR_MAP[norm(k)] = k; INSTR_MAP[norm(INSTRUMENTS[k].name)] = k; });
  Object.assign(INSTR_MAP, {
    promisphysicalfunction: "PROMIS-PF", pfpromis: "PROMIS-PF", pf: "PROMIS-PF", promispf: "PROMIS-PF",
    promispaininterference: "PROMIS-PI", pi: "PROMIS-PI", promispi: "PROMIS-PI",
    promissocialroles: "PROMIS-SR", sr: "PROMIS-SR",
    promisfatigue: "PROMIS-FA", promisanxiety: "PROMIS-AX", promisdepression: "PROMIS-DE",
    oswestry: "ODI", odi: "ODI", neckdisabilityindex: "NDI", ndi: "NDI",
    srs22: "SRS-22r", srs22r: "SRS-22r", srs: "SRS-22r",
    nrs: "NRS-Pain", nrspain: "NRS-Pain", vas: "NRS-Pain", painscore: "NRS-Pain", numericpain: "NRS-Pain"
  });

  // timepoint normalization
  const TP_MAP = {};
  TIMEPOINTS.forEach(t => { TP_MAP[norm(t.code)] = t.code; TP_MAP[norm(t.label)] = t.code; });
  Object.assign(TP_MAP, {
    base: "baseline", pre: "baseline", preop: "baseline", baseline: "baseline", enrollment: "baseline", visit0: "baseline",
    "6week": "6w", "6weeks": "6w", "6wk": "6w", week6: "6w", wk6: "6w", "6w": "6w",
    "3month": "3m", "3months": "3m", month3: "3m", mo3: "3m", "90day": "3m",
    "6month": "6m", "6months": "6m", month6: "6m", mo6: "6m",
    "12month": "12m", "12months": "12m", "1year": "12m", year1: "12m", month12: "12m",
    "24month": "24m", "24months": "24m", "2year": "24m", year2: "24m", month24: "24m"
  });
  // Fuzzy timepoint match: strips REDCap "arm" suffixes and checks contained tokens.
  function matchTimepoint(raw) {
    let n = norm(raw);
    if (TP_MAP[n]) return TP_MAP[n];
    n = n.replace(/arm\d+$/, "").replace(/arm\d+/, "");
    if (TP_MAP[n]) return TP_MAP[n];
    const tokens = [
      ["baseline", ["baseline", "preop", "pre", "enroll", "visit0", "index"]],
      ["24m", ["24m", "24month", "2year", "month24", "mo24"]],
      ["12m", ["12m", "12month", "1year", "month12", "mo12"]],
      ["6m", ["6m", "6month", "month6", "mo6"]],
      ["3m", ["3m", "3month", "month3", "mo3", "90day"]],
      ["6w", ["6w", "6week", "week6", "wk6"]]
    ];
    for (const [code, toks] of tokens) if (toks.some(t => n.includes(t))) return code;
    return raw;
  }

  function autoMap(headers, fields) {
    const map = {};
    fields.forEach(f => {
      const aliases = ALIASES[f] || [];
      const hit = headers.find(h => aliases.includes(norm(h))) || headers.find(h => norm(h) === norm(f));
      map[f] = hit || "";
    });
    return map;
  }

  const Importer = {
    // fields required per file type
    ENROLL_FIELDS: ["subjectId", "cohort", "anchorDate", "diagnosis", "provider"],
    ENROLL_REQUIRED: ["subjectId", "anchorDate"],
    SCORE_FIELDS: ["subjectId", "instrument", "timepoint", "collectedDate", "score", "source"],
    SCORE_REQUIRED: ["subjectId", "instrument", "timepoint", "score", "collectedDate"],

    proposeMapping(kind, headers) {
      const fields = kind === "enrollment" ? this.ENROLL_FIELDS : this.SCORE_FIELDS;
      return { fields, required: kind === "enrollment" ? this.ENROLL_REQUIRED : this.SCORE_REQUIRED, map: autoMap(headers, fields), headers };
    },

    applyEnrollment(records, map) {
      const S = window.PROMStore, out = [], errors = [];
      records.forEach((r, i) => {
        const row = "row " + (i + 2);
        const g = f => (map[f] ? r[map[f]] : "") || "";
        const subjectId = String(g("subjectId")).trim();
        if (!subjectId) { errors.push({ row, message: "Missing subject/study ID" }); return; }
        let anchor = String(g("anchorDate")).trim();
        if (anchor && isNaN(Date.parse(anchor))) { errors.push({ row, message: "Invalid anchor date: " + anchor }); return; }
        if (anchor) anchor = new Date(anchor).toISOString().slice(0, 10);
        out.push({ subjectId, cohort: String(g("cohort")).trim(), anchorDate: anchor, diagnosis: String(g("diagnosis")).trim(), provider: String(g("provider")).trim() });
      });
      // upsert by subjectId
      const idx = {}; S.subjects.forEach((s, i) => idx[s.subjectId] = i);
      out.forEach(s => { if (idx[s.subjectId] != null) S.subjects[idx[s.subjectId]] = s; else S.subjects.push(s); });
      S.importLog.unshift({ file: "enrollment", accepted: out.length, errors, date: new Date().toISOString() });
      S.audit("Enrollment import", out.length + " subjects accepted, " + errors.length + " rejected");
      S.index(); S.save();
      return { accepted: out.length, rejected: errors.length, errors };
    },

    applyScores(records, map) {
      const S = window.PROMStore, out = [], errors = [];
      records.forEach((r, i) => {
        const row = "row " + (i + 2);
        const g = f => (map[f] ? r[map[f]] : "") || "";
        const subjectId = String(g("subjectId")).trim();
        const instrRaw = String(g("instrument")).trim();
        const tpRaw = String(g("timepoint")).trim();
        const instrument = INSTR_MAP[norm(instrRaw)] || instrRaw;
        const timepoint = matchTimepoint(tpRaw);
        const dateRaw = String(g("collectedDate")).trim();
        const scoreRaw = String(g("score")).trim();
        if (!subjectId) { errors.push({ row, message: "Missing subject ID" }); return; }
        if (!INSTRUMENTS[instrument]) { errors.push({ row, message: "Unrecognized instrument: '" + instrRaw + "'" }); return; }
        if (!TIMEPOINTS.find(t => t.code === timepoint)) { errors.push({ row, message: "Unrecognized timepoint: '" + tpRaw + "'" }); return; }
        if (!dateRaw || isNaN(Date.parse(dateRaw))) { errors.push({ row, message: "Invalid collected date: " + dateRaw }); return; }
        const score = parseFloat(scoreRaw);
        if (isNaN(score)) { errors.push({ row, message: "Non-numeric score: " + scoreRaw }); return; }
        out.push({ subjectId, instrument, timepoint, collectedDate: new Date(dateRaw).toISOString().slice(0, 10), score, source: String(g("source")).trim() || "Import" });
      });
      // upsert by subject+instrument+timepoint (re-import updates existing)
      const key = s => s.subjectId + "|" + s.instrument + "|" + s.timepoint;
      const idx = {}; S.scores.forEach((s, i) => idx[key(s)] = i);
      out.forEach(s => { if (idx[key(s)] != null) S.scores[idx[key(s)]] = s; else S.scores.push(s); });
      S.importLog.unshift({ file: "scores", accepted: out.length, errors, date: new Date().toISOString() });
      S.audit("Score import", out.length + " scores accepted, " + errors.length + " rejected");
      S.index(); S.save();
      return { accepted: out.length, rejected: errors.length, errors };
    }
  };

  window.PROMImporter = Importer;
  if (typeof module !== "undefined") module.exports = Importer;
})();
