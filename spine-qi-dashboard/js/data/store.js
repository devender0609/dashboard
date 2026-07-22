/* store.js — data layer.
   The Store wraps a DataAdapter so the UI never touches raw storage. The demo
   ships with SyntheticAdapter (seeded generator + CSV/Excel import). Production
   adapters (Athenahealth, warehouse, REDCap, PROM vendor) implement the same
   four methods: load(), meta(), importTable(), exportTables(). */
(function () {
  const { daysBetween, addDays } = window.SQISeed.helpers;
  const AS_OF = window.SQISeed.helpers.AS_OF;

  // ---- adapter -------------------------------------------------------------
  function SyntheticAdapter() {
    const data = window.SQISeed.generate();
    return {
      load: () => data,
      meta: () => ({ ...data.meta, adapter: "Synthetic demonstration adapter" }),
      importTable: (table, records) => {
        // Imported rows are merged with provenance tagging; validation happens in Store.
        records.forEach(r => { r._source = "CSV import"; });
        data[table] = data[table].concat(records);
        return records.length;
      }
    };
  }

  // ---- store ----------------------------------------------------------------
  const Store = {
    adapter: null, data: null,
    importLog: [],   // {table, rows, errors:[], date}
    auditLog: [],    // {ts, user, action, detail}
    filters: { period: "all", provider: "all", region: "all", location: "all", treatment: "all" },
    role: "Quality administrator",

    ROLES: {
      "Clinician": { pages: ["executive", "outcomes", "surgical", "nonsurgical", "pathway", "registry"], canExport: true, admin: false },
      "Quality administrator": { pages: "all", canExport: true, admin: true },
      "Clinic manager": { pages: ["executive", "pathway", "operations", "registry", "dataquality"], canExport: true, admin: false },
      "Research analyst": { pages: ["outcomes", "surgical", "nonsurgical", "registry", "dataquality"], canExport: true, admin: false },
      "Data-entry user": { pages: ["registry", "dataquality", "pathway"], canExport: false, admin: false },
      "Read-only executive": { pages: ["executive"], canExport: false, admin: false }
    },

    init() {
      this.adapter = SyntheticAdapter();
      this.data = this.adapter.load();
      this.audit("system", "Data loaded", this.adapter.meta().adapter);
      this.buildIndexes();
      this.buildWorklist();
    },

    audit(user, action, detail) {
      this.auditLog.unshift({ ts: new Date().toISOString(), user: user || this.role, action, detail });
    },

    buildIndexes() {
      const d = this.data;
      this.byEpisode = {}; this.patientById = {};
      d.patients.forEach(p => { this.patientById[p.patientId] = p; });
      d.episodes.forEach(e => {
        this.byEpisode[e.episodeId] = {
          episode: e, patient: this.patientById[e.patientId],
          pathway: null, procedures: [], complications: [], proms: [], experience: []
        };
      });
      d.pathways.forEach(pw => { if (this.byEpisode[pw.episodeId]) this.byEpisode[pw.episodeId].pathway = pw; });
      d.procedures.forEach(pr => { if (this.byEpisode[pr.episodeId]) this.byEpisode[pr.episodeId].procedures.push(pr); });
      d.complications.forEach(c => { if (this.byEpisode[c.episodeId]) this.byEpisode[c.episodeId].complications.push(c); });
      d.proms.forEach(p => { if (this.byEpisode[p.episodeId]) this.byEpisode[p.episodeId].proms.push(p); });
      d.experience.forEach(x => { if (this.byEpisode[x.episodeId]) this.byEpisode[x.episodeId].experience.push(x); });
    },

    // ---- global filters ------------------------------------------------------
    periodBounds() {
      const map = { "3m": 91, "6m": 182, "12m": 365, "24m": 730 };
      if (this.filters.period === "all") return null;
      return addDays(AS_OF, -map[this.filters.period]);
    },

    episodeMatches(e) {
      const f = this.filters;
      if (f.provider !== "all" && e.treatingProvider !== f.provider) return false;
      if (f.region !== "all" && e.spineRegion !== f.region) return false;
      if (f.location !== "all" && e.clinicLocation !== f.location) return false;
      if (f.treatment !== "all") {
        const hasProc = this.byEpisode[e.episodeId].procedures.length > 0;
        if (f.treatment === "surgical" && !hasProc) return false;
        if (f.treatment === "nonsurgical" && hasProc) return false;
      }
      const start = this.periodBounds();
      if (start && e.referralDate < start) return false;
      return true;
    },

    episodes() { return this.data.episodes.filter(e => this.episodeMatches(e)); },
    procedures() {
      const ids = new Set(this.episodes().map(e => e.episodeId));
      return this.data.procedures.filter(p => ids.has(p.episodeId));
    },
    complications() {
      const ids = new Set(this.episodes().map(e => e.episodeId));
      return this.data.complications.filter(c => ids.has(c.episodeId));
    },
    proms() {
      const ids = new Set(this.episodes().map(e => e.episodeId));
      return this.data.proms.filter(p => ids.has(p.episodeId));
    },
    experience() {
      const ids = new Set(this.episodes().map(e => e.episodeId));
      return this.data.experience.filter(x => ids.has(x.episodeId));
    },

    // ---- PROM analysis ---------------------------------------------------------
    threshold(instrument) {
      return this.data.promThresholds.find(t => t.instrument === instrument) || null;
    },

    /* Returns per (episode, instrument, timepoint) analysis rows:
       baseline, score, change, pctImprovement, mcidMet, passMet, deteriorated,
       windowCompliant, overdue. */
    promAnalysis() {
      if (this._promCache && this._promCacheKey === JSON.stringify(this.filters)) return this._promCache;
      const rows = [];
      const tpByCode = {}; this.data.timepoints.forEach(t => { tpByCode[t.code] = t; });
      this.episodes().forEach(e => {
        const bundle = this.byEpisode[e.episodeId];
        const byInstr = {};
        bundle.proms.forEach(p => { (byInstr[p.instrument] = byInstr[p.instrument] || {})[p.timepoint] = p; });
        Object.entries(byInstr).forEach(([instr, tps]) => {
          const base = tps["baseline"];
          const th = this.threshold(instr);
          const dirDecrease = th ? th.direction === "decrease" : (this.data.instruments[instr] || {}).dir === -1;
          this.data.timepoints.forEach(tp => {
            if (tp.code === "baseline") return;
            const rec = tps[tp.code];
            const anchor = bundle.procedures[0] ? bundle.procedures[0].procedureDate : e.firstApptDate;
            if (!anchor) return;
            const due = addDays(anchor, tp.days);
            const overdueNow = !rec && daysBetween(due, AS_OF) > tp.window;
            const notYetDue = !rec && daysBetween(due, AS_OF) < -tp.window;
            let out = {
              episodeId: e.episodeId, patientId: e.patientId, instrument: instr,
              timepoint: tp.code, due, hasBaseline: !!base,
              baseline: base ? base.score : null, score: rec ? rec.score : null,
              collectedDate: rec ? rec.collectedDate : null,
              change: null, pctImprovement: null, mcidMet: null, passMet: null,
              deteriorated: null, windowCompliant: null,
              status: rec ? "Collected" : notYetDue ? "Not yet due" : overdueNow ? "Overdue" : "In window"
            };
            if (rec && base) {
              const rawChange = rec.score - base.score;
              out.change = Math.round(rawChange * 10) / 10;
              const improvement = dirDecrease ? -rawChange : rawChange;
              out.pctImprovement = base.score !== 0 ? Math.round((improvement / Math.abs(base.score)) * 1000) / 10 : null;
              if (th && th.mcid !== null) out.mcidMet = improvement >= th.mcid;
              if (th && th.pass !== null && th.pass !== undefined) {
                out.passMet = dirDecrease ? rec.score <= th.pass : rec.score >= th.pass;
              }
              out.deteriorated = improvement <= -(th && th.mcid ? th.mcid : 0.5 * Math.abs(base.score) * 0.2);
              const offset = Math.abs(daysBetween(due, rec.collectedDate));
              out.windowCompliant = offset <= tp.window;
            }
            rows.push(out);
          });
        });
      });
      this._promCache = rows; this._promCacheKey = JSON.stringify(this.filters);
      return rows;
    },

    invalidateCaches() { this._promCache = null; this._worklist = null; },

    // ---- care-pathway worklist ---------------------------------------------------
    buildWorklist() {
      const items = [];
      const owners = { auth: "Referral coordinator", imaging: "Imaging coordinator", pt: "Care navigator", inj: "Procedure scheduler", surg: "Surgical scheduler", prom: "Outcomes coordinator", fu: "Care navigator", comp: "Quality nurse" };
      this.data.episodes.forEach(e => {
        const b = this.byEpisode[e.episodeId]; const pw = b.pathway; if (!pw) return;
        const pt = b.patient;
        const push = (category, action, owner, daysDue) => items.push({
          category, episodeId: e.episodeId, patientId: e.patientId,
          patientLabel: e.patientId + " · " + e.spineRegion + " · " + e.primaryDiagnosis,
          provider: e.treatingProvider, action, owner,
          dueDate: addDays(AS_OF, daysDue), status: daysDue < 0 ? "Overdue" : "Open"
        });
        if (e.status === "Lost to follow-up") push("Lost to follow-up", "Outreach call; document disposition or discharge from pathway", owners.fu, -14);
        if (pw.imagingOrdered === "Yes" && pw.imagingCompleted === "No") push("Awaiting imaging", "Confirm imaging appointment; escalate if authorization pending", owners.imaging, 3);
        if (pw.delayReason === "Prior authorization pending" || pw.delayReason === "Insurance denial under appeal") push("Awaiting authorization", "Check payer status; initiate peer-to-peer if >7 days", owners.auth, 2);
        if (pw.ptRecommended === "Yes" && pw.ptInitiated === "No") push("Awaiting physical therapy", "Verify PT referral received; help patient schedule first visit", owners.pt, 5);
        if (pw.injectionRecommended === "Yes" && pw.injectionCompleted === "No") push("Awaiting injection", "Schedule injection; confirm anticoagulation instructions", owners.inj, 5);
        if (pw.surgeryRecommended === "Yes" && pw.surgeryCompleted !== "Yes" && e.status === "Active") push("Awaiting surgery", "Confirm surgical date, clearances, and authorization", owners.surg, 7);
        if (pw.followUpStatus === "Overdue" && b.procedures.length) push("Overdue postoperative visit", "Schedule postoperative follow-up visit", owners.fu, -7);
        b.complications.forEach(c => { if (c.reviewStatus !== "Adjudicated") push("Unresolved complication", "Complete complication review and adjudication: " + c.complicationType, owners.comp, -3); });
      });
      // PROM-related items
      this.promAnalysisAll().forEach(r => {
        if (r.status === "Overdue" && r.timepoint !== "24m") {
          items.push({
            category: "Overdue PROMs", episodeId: r.episodeId, patientId: r.patientId,
            patientLabel: r.patientId + " · " + r.instrument + " " + r.timepoint,
            provider: (this.byEpisode[r.episodeId] || {}).episode?.treatingProvider || "",
            action: "Send portal PROM request; phone outreach if no response in 7 days",
            owner: owners.prom, dueDate: addDays(AS_OF, 7), status: "Open"
          });
        }
        if (r.deteriorated === true) {
          items.push({
            category: "Outcome deterioration", episodeId: r.episodeId, patientId: r.patientId,
            patientLabel: r.patientId + " · " + r.instrument + " worsened by " + Math.abs(r.change) + " at " + r.timepoint,
            provider: (this.byEpisode[r.episodeId] || {}).episode?.treatingProvider || "",
            action: "Clinician review of worsening score; consider earlier visit",
            owner: "Treating clinician", dueDate: addDays(AS_OF, 3), status: "Open"
          });
        }
      });
      // de-duplicate overdue PROMs to one row per episode
      const seen = new Set();
      this._worklist = items.filter(i => {
        if (i.category !== "Overdue PROMs") return true;
        const k = i.episodeId + i.category;
        if (seen.has(k)) return false; seen.add(k); return true;
      });
    },

    promAnalysisAll() {
      // unfiltered version used for worklist construction
      const saved = this.filters;
      this.filters = { period: "all", provider: "all", region: "all", location: "all", treatment: "all" };
      this.invalidateCaches();
      const rows = this.promAnalysis();
      this.filters = saved; this.invalidateCaches();
      return rows;
    },

    worklist() {
      if (!this._worklist) this.buildWorklist();
      return this._worklist.filter(i => {
        const e = this.byEpisode[i.episodeId]; if (!e) return true;
        return this.episodeMatches(e.episode);
      });
    },

    // ---- data quality --------------------------------------------------------------
    dataQualityIssues() {
      const issues = [];
      const add = (severity, category, entity, id, detail) => issues.push({ severity, category, entity, id, detail });
      this.data.patients.forEach(p => {
        ["dob", "sex", "bmi", "smoking", "insurance"].forEach(f => {
          if (p[f] === null || p[f] === undefined || p[f] === "") add("Warning", "Missing field", "Patient", p.patientId, "Missing " + f);
        });
      });
      // duplicates: same dob+sex+zip-ish
      const key = p => p.dob + "|" + p.sex + "|" + p.travelDistance;
      const map = {};
      this.data.patients.forEach(p => { if (p.dob) (map[key(p)] = map[key(p)] || []).push(p.patientId); });
      Object.values(map).filter(v => v.length > 1).forEach(v => add("Error", "Possible duplicate", "Patient", v.join(", "), "Same DOB, sex, and travel category — requires reconciliation"));
      this.data.episodes.forEach(e => {
        if (!e.firstApptDate && e.status !== "Lost to follow-up") add("Warning", "Missing field", "Episode", e.episodeId, "Missing first appointment date");
        if (e.treatmentPlanDate && e.referralDate && e.treatmentPlanDate < e.referralDate) add("Error", "Invalid date", "Episode", e.episodeId, "Treatment-plan date precedes referral date");
        if (e.closureDate && e.closureDate < e.referralDate) add("Error", "Invalid date", "Episode", e.episodeId, "Closure precedes referral");
      });
      // PROM issues
      const analysis = this.promAnalysisAll();
      const noBase = new Set(analysis.filter(r => !r.hasBaseline).map(r => r.episodeId + "|" + r.instrument));
      noBase.forEach(k => { const [ep, ins] = k.split("|"); add("Warning", "Missing baseline PROM", "Episode", ep, ins + " has follow-up scores but no baseline"); });
      analysis.filter(r => r.windowCompliant === false).forEach(r => add("Info", "Out-of-window PROM", "Episode", r.episodeId, r.instrument + " " + r.timepoint + " collected outside the allowed window"));
      analysis.filter(r => r.status === "Overdue").forEach(r => add("Warning", "Overdue PROM", "Episode", r.episodeId, r.instrument + " " + r.timepoint + " overdue"));
      this.data.complications.filter(c => c.reviewStatus !== "Adjudicated").forEach(c => add("Warning", "Unreviewed complication", "Complication", c.complicationId, c.complicationType + " pending adjudication"));
      this.importLog.forEach(l => l.errors.forEach(er => add("Error", "Import validation", l.table, er.row, er.message)));
      return issues;
    },

    // ---- CSV import with validation ---------------------------------------------
    IMPORT_SPECS: {
      patients: { required: ["patientId", "dob", "sex"], dateFields: ["dob"] },
      episodes: { required: ["episodeId", "patientId", "spineRegion", "referralDate"], dateFields: ["referralDate", "firstApptDate", "treatmentPlanDate", "closureDate"] },
      proms: { required: ["episodeId", "instrument", "timepoint", "score", "collectedDate"], dateFields: ["collectedDate"] }
    },

    importCSV(table, parsed) {
      const spec = this.IMPORT_SPECS[table];
      const errors = []; const valid = [];
      parsed.records.forEach((r, i) => {
        const rowNo = "row " + (i + 2);
        const missing = spec.required.filter(f => !r[f]);
        if (missing.length) { errors.push({ row: rowNo, message: "Missing required: " + missing.join(", ") }); return; }
        for (const f of spec.dateFields) {
          if (r[f] && isNaN(Date.parse(r[f]))) { errors.push({ row: rowNo, message: "Invalid date in " + f + ": " + r[f] }); return; }
        }
        if (table === "proms" && isNaN(parseFloat(r.score))) { errors.push({ row: rowNo, message: "Non-numeric score" }); return; }
        if (table === "proms") r.score = parseFloat(r.score);
        valid.push(r);
      });
      if (valid.length) this.adapter.importTable(table, valid);
      this.importLog.unshift({ table, rows: valid.length, errors, date: new Date().toISOString() });
      this.audit(this.role, "CSV import", table + ": " + valid.length + " rows accepted, " + errors.length + " rejected");
      this.buildIndexes(); this.invalidateCaches();
      return { accepted: valid.length, rejected: errors.length, errors };
    }
  };

  window.SQIStore = Store;
})();
