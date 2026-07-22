/* store.js — PROM registry data layer.
   Persists to localStorage so imports survive refreshes and app restarts
   (this is a real, standing monitor — not an in-memory demo). Data is keyed by
   de-identified study/subject IDs; no names, MRN, or DOB are stored.
   Analytical engine: change, % improvement, MCID, PASS, deterioration,
   window compliance, and overdue detection. */
(function () {
  const { INSTRUMENTS, TIMEPOINTS, DEFAULT_THRESHOLDS } = window.PROMConfig;
  const KEY = "prom_registry_v1";
  const DAY = 86400000;
  const iso = d => new Date(d).toISOString().slice(0, 10);
  const addDays = (dateStr, n) => iso(new Date(dateStr + "T00:00:00").getTime() + n * DAY);
  const daysBetween = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / DAY);

  const Store = {
    subjects: [], scores: [], thresholds: [], importLog: [], auditLog: [],
    asOf: new Date().toISOString().slice(0, 10),
    filters: { instrument: "ODI", cohort: "all", provider: "all" },

    // ---- persistence -----------------------------------------------------
    load() {
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem(KEY)); } catch (e) { saved = null; }
      if (saved && saved.scores) {
        this.subjects = saved.subjects || [];
        this.scores = saved.scores || [];
        this.thresholds = saved.thresholds || JSON.parse(JSON.stringify(DEFAULT_THRESHOLDS));
        this.importLog = saved.importLog || [];
        this.auditLog = saved.auditLog || [];
        this.asOf = saved.asOf || this.asOf;
      } else {
        this.thresholds = JSON.parse(JSON.stringify(DEFAULT_THRESHOLDS));
      }
      this.index();
      return !!(saved && saved.scores);
    },
    save() {
      try {
        localStorage.setItem(KEY, JSON.stringify({
          subjects: this.subjects, scores: this.scores, thresholds: this.thresholds,
          importLog: this.importLog.slice(0, 50), auditLog: this.auditLog.slice(0, 200), asOf: this.asOf
        }));
      } catch (e) { /* file:// or quota — data still lives in memory this session */ }
    },
    exportJSON() {
      return JSON.stringify({ subjects: this.subjects, scores: this.scores, thresholds: this.thresholds, asOf: this.asOf }, null, 2);
    },
    importJSON(text) {
      const o = JSON.parse(text);
      this.subjects = o.subjects || []; this.scores = o.scores || [];
      if (o.thresholds) this.thresholds = o.thresholds;
      this.index(); this.save(); this.audit("Dataset restored from JSON backup");
    },
    clearAll() { this.subjects = []; this.scores = []; this.importLog = []; this.index(); this.save(); this.audit("All subject and score data cleared"); },

    audit(action, detail) { this.auditLog.unshift({ ts: new Date().toISOString(), action, detail: detail || "" }); },

    // ---- manual data entry (add/edit/delete) -----------------------------
    upsertSubject(s) {
      const i = this.subjects.findIndex(x => x.subjectId === s.subjectId);
      if (i >= 0) { this.subjects[i] = Object.assign({}, this.subjects[i], s); this.audit("Subject edited", s.subjectId); }
      else { this.subjects.push(s); this.audit("Subject added", s.subjectId); }
      this.index(); this.save();
    },
    deleteSubject(id) {
      this.subjects = this.subjects.filter(s => s.subjectId !== id);
      this.scores = this.scores.filter(s => s.subjectId !== id);
      this.audit("Subject deleted", id); this.index(); this.save();
    },
    upsertScore(sc) {
      const key = x => x.subjectId + "|" + x.instrument + "|" + x.timepoint;
      const i = this.scores.findIndex(x => key(x) === key(sc));
      if (i >= 0) { this.scores[i] = Object.assign({}, this.scores[i], sc); this.audit("Assessment edited", key(sc)); }
      else { this.scores.push(sc); this.audit("Assessment added", key(sc)); }
      this.index(); this.save();
    },
    deleteScore(subjectId, instrument, timepoint) {
      this.scores = this.scores.filter(s => !(s.subjectId === subjectId && s.instrument === instrument && s.timepoint === timepoint));
      this.audit("Assessment deleted", subjectId + "|" + instrument + "|" + timepoint);
      this.index(); this.save();
    },

    // ---- indexing --------------------------------------------------------
    index() {
      this.subjectById = {};
      this.subjects.forEach(s => { this.subjectById[s.subjectId] = s; this._anchorSet(s); });
      this.scoresBySubject = {};
      this.scores.forEach(sc => { (this.scoresBySubject[sc.subjectId] = this.scoresBySubject[sc.subjectId] || []).push(sc); });
      // refresh as-of to latest collected date if data present
      const dates = this.scores.map(s => s.collectedDate).filter(Boolean).sort();
      if (dates.length) this.asOf = dates[dates.length - 1] > this.asOf ? this.asOf : this.asOf; // keep max(now, data) handled in app
      this._cache = null;
    },
    _anchorSet(s) { if (!s.anchorDate && s.enrollmentDate) s.anchorDate = s.enrollmentDate; },

    threshold(instrument, cohort) {
      return this.thresholds.find(t => t.instrument === instrument && (cohort ? t.population === cohort : true))
          || this.thresholds.find(t => t.instrument === instrument) || null;
    },

    cohorts() { return [...new Set(this.subjects.map(s => s.cohort).filter(Boolean))].sort(); },
    providers() { return [...new Set(this.subjects.map(s => s.provider).filter(Boolean))].sort(); },
    instrumentsPresent() { return [...new Set(this.scores.map(s => s.instrument))].sort(); },

    subjectMatches(s) {
      const f = this.filters;
      if (f.cohort !== "all" && s.cohort !== f.cohort) return false;
      if (f.provider !== "all" && s.provider !== f.provider) return false;
      return true;
    },

    // ---- core analysis ---------------------------------------------------
    /* Returns one row per (subject, instrument, timepoint>baseline) with the
       full outcome computation and status. */
    analysis() {
      if (this._cache) return this._cache;
      const rows = [];
      this.subjects.forEach(sub => {
        const anchor = sub.anchorDate;
        const scs = (this.scoresBySubject[sub.subjectId] || []);
        const byInstr = {};
        scs.forEach(sc => { (byInstr[sc.instrument] = byInstr[sc.instrument] || {})[sc.timepoint] = sc; });
        Object.entries(byInstr).forEach(([instr, tps]) => {
          const base = tps["baseline"];
          const th = this.threshold(instr, sub.cohort);
          const dirDecrease = th ? th.direction === "decrease" : (INSTRUMENTS[instr] || {}).dir === -1;
          TIMEPOINTS.forEach(tp => {
            if (tp.code === "baseline") return;
            const rec = tps[tp.code];
            const due = anchor ? addDays(anchor, tp.days) : null;
            const overdue = !rec && due && daysBetween(due, this.asOf) > tp.window;
            const notYetDue = !rec && due && daysBetween(due, this.asOf) < -tp.window;
            const out = {
              subjectId: sub.subjectId, cohort: sub.cohort, provider: sub.provider,
              instrument: instr, timepoint: tp.code, due,
              hasBaseline: !!base, baseline: base ? base.score : null,
              score: rec ? rec.score : null, collectedDate: rec ? rec.collectedDate : null,
              change: null, pctImprovement: null, mcidMet: null, passMet: null,
              deteriorated: null, windowCompliant: null,
              status: rec ? "Collected" : notYetDue ? "Not yet due" : overdue ? "Overdue" : due ? "In window" : "No anchor date"
            };
            if (rec && base) {
              const raw = rec.score - base.score;
              out.change = Math.round(raw * 10) / 10;
              const improvement = dirDecrease ? -raw : raw;
              out.pctImprovement = base.score !== 0 ? Math.round((improvement / Math.abs(base.score)) * 1000) / 10 : null;
              if (th && th.mcid != null) out.mcidMet = improvement >= th.mcid;
              if (th && th.pass != null) out.passMet = dirDecrease ? rec.score <= th.pass : rec.score >= th.pass;
              out.deteriorated = improvement <= -(th && th.mcid ? th.mcid : Math.abs(base.score) * 0.1);
              out.windowCompliant = Math.abs(daysBetween(due, rec.collectedDate)) <= tp.window;
            }
            rows.push(out);
          });
        });
      });
      this._cache = rows;
      return rows;
    },

    filteredAnalysis() {
      return this.analysis().filter(r => {
        const s = this.subjectById[r.subjectId];
        return s && this.subjectMatches(s);
      });
    },

    // ---- monitoring worklist --------------------------------------------
    worklist() {
      const items = [];
      this.filteredAnalysis().forEach(r => {
        if (r.status === "Overdue") items.push({
          category: "Overdue assessment", subjectId: r.subjectId, cohort: r.cohort,
          detail: `${r.instrument} ${r.timepoint} — due ${r.due}`,
          action: "Send survey request; phone outreach if no response in 7 days",
          owner: "Outcomes coordinator", due: r.due, priority: 2
        });
        if (r.deteriorated === true) items.push({
          category: "Outcome deterioration", subjectId: r.subjectId, cohort: r.cohort,
          detail: `${r.instrument} worsened ${Math.abs(r.change)} pts by ${r.timepoint}`,
          action: "Clinician review of worsening score; consider earlier visit",
          owner: "Treating clinician", due: r.collectedDate, priority: 1
        });
      });
      // de-dupe overdue to one per subject+instrument+timepoint already unique
      return items.sort((a, b) => a.priority - b.priority || (a.due > b.due ? 1 : -1));
    },

    // ---- data quality ----------------------------------------------------
    dataQuality() {
      const issues = [];
      const add = (sev, cat, id, detail) => issues.push({ severity: sev, category: cat, id, detail });
      const seen = {};
      this.scores.forEach(sc => {
        const k = sc.subjectId + "|" + sc.instrument + "|" + sc.timepoint;
        if (seen[k]) add("Error", "Duplicate score", sc.subjectId, `${sc.instrument} ${sc.timepoint} appears more than once — reconcile`);
        seen[k] = true;
        if (!this.subjectById[sc.subjectId]) add("Error", "Orphan score", sc.subjectId, `Score references a subject not in the enrollment file`);
        const inst = INSTRUMENTS[sc.instrument];
        if (inst && (sc.score < inst.min || sc.score > inst.max)) add("Error", "Out-of-range score", sc.subjectId, `${sc.instrument}=${sc.score} outside ${inst.min}-${inst.max}`);
      });
      this.subjects.forEach(s => { if (!s.anchorDate) add("Warning", "Missing anchor date", s.subjectId, "No enrollment/surgery date — due dates cannot be computed"); });
      const a = this.analysis();
      const noBase = new Set(a.filter(r => !r.hasBaseline).map(r => r.subjectId + "|" + r.instrument));
      noBase.forEach(k => { const [id, ins] = k.split("|"); add("Warning", "Missing baseline", id, `${ins} has follow-up but no baseline — change cannot be computed`); });
      a.filter(r => r.windowCompliant === false).forEach(r => add("Info", "Out-of-window", r.subjectId, `${r.instrument} ${r.timepoint} collected outside allowed window`));
      a.filter(r => r.status === "Overdue").forEach(r => add("Warning", "Overdue", r.subjectId, `${r.instrument} ${r.timepoint} overdue`));
      this.importLog.forEach(l => (l.errors || []).forEach(e => add("Error", "Import rejection", l.file, `${e.row}: ${e.message}`)));
      return issues;
    },

    helpers: { addDays, daysBetween, iso }
  };

  window.PROMStore = Store;
  if (typeof module !== "undefined") module.exports = Store;
})();
