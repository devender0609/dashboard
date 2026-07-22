/* measures.js — declarative quality-measure engine.
   Every measure is a definition object; the engine evaluates numerator /
   denominator functions against the (filtered) store and returns rate, CI,
   the contributing patient list (for drill-down), and threshold status.
   RAG status appears ONLY when target/warning thresholds are defined. */
(function () {
  const St = window.SQIStats;

  const Engine = {
    definitions: [],

    seedDefinitions(store) {
      const { daysBetween } = window.SQISeed.helpers;
      this.definitions = [
        {
          id: "M1", name: "Baseline PROM capture before surgery",
          purpose: "Outcome measurement is only interpretable when a pre-treatment score exists.",
          numeratorDesc: "Surgical episodes with at least one baseline PROM collected on or before the procedure date",
          denominatorDesc: "All episodes with a completed surgical procedure in the period",
          inclusion: "Completed spine procedures", exclusion: "Episodes without a procedure",
          target: 90, warning: 80, direction: "higher", unit: "%",
          period: "Rolling 12 months", dataSource: "PROM table + procedures", owner: "Outcomes coordinator",
          reviewFrequency: "Monthly", riskAdjustment: "None (process measure)",
          status: "Active", versions: [{ v: "1.0", date: "2026-06-01", note: "Initial definition — pending clinical approval" }],
          compute(s) {
            const procs = s.procedures();
            const den = procs.map(p => p.episodeId);
            const num = procs.filter(p => {
              const b = s.byEpisode[p.episodeId];
              return b && b.proms.some(pr => pr.timepoint === "baseline" && pr.collectedDate <= p.procedureDate);
            }).map(p => p.episodeId);
            return { num, den };
          }
        },
        {
          id: "M2", name: "MCID achievement at 12 months (primary instrument)",
          purpose: "Fraction of surgical patients achieving a minimal clinically important difference on their region-appropriate primary instrument (ODI, NDI, or SRS-22r).",
          numeratorDesc: "Episodes whose 12-month primary-instrument change meets the MCID threshold in the administrator threshold table",
          denominatorDesc: "Surgical episodes with baseline AND 12-month primary-instrument scores",
          inclusion: "Surgical episodes ≥12 months post-procedure with paired scores",
          exclusion: "Missing baseline or 12-month score (reported separately as follow-up completeness)",
          target: null, warning: null, direction: "higher", unit: "%",
          period: "Rolling 24 months", dataSource: "PROM table + threshold table", owner: "Quality administrator",
          reviewFrequency: "Quarterly", riskAdjustment: "Planned: case-mix stratification (region, revision, comorbidity)",
          status: "Display only — MCID thresholds pending validation",
          versions: [{ v: "1.0", date: "2026-06-01", note: "Display only until threshold table is clinically approved" }],
          compute(s) {
            const rows = s.promAnalysis().filter(r =>
              r.timepoint === "12m" && ["ODI", "NDI", "SRS-22r"].includes(r.instrument) &&
              r.mcidMet !== null && s.byEpisode[r.episodeId].procedures.length);
            return { num: rows.filter(r => r.mcidMet).map(r => r.episodeId), den: rows.map(r => r.episodeId) };
          }
        },
        {
          id: "M3", name: "30-day readmission after spine surgery",
          purpose: "Safety signal for early postoperative complications and discharge planning.",
          numeratorDesc: "Procedures followed by an inpatient readmission within 30 days (adjudicated events only)",
          denominatorDesc: "All completed procedures with ≥30 days of follow-up",
          inclusion: "All spine procedures", exclusion: "Planned staged returns (requires adjudication flag)",
          target: 5, warning: 4, direction: "lower", unit: "%",
          period: "Rolling 12 months", dataSource: "Complications table", owner: "Quality nurse",
          reviewFrequency: "Monthly", riskAdjustment: "Placeholder — unadjusted; interpret with case mix",
          status: "Active", versions: [{ v: "1.0", date: "2026-06-01", note: "Unplanned/planned distinction requires adjudication" }],
          compute(s) {
            const procs = s.procedures().filter(p => daysBetween(p.procedureDate, window.SQISeed.helpers.AS_OF) >= 30);
            const den = procs.map(p => p.procedureId);
            const num = procs.filter(p => s.complications().some(c =>
              c.procedureId === p.procedureId && c.readmission === "Yes" &&
              (c.timing === "Inpatient" || c.timing === "30-day") && c.reviewStatus === "Adjudicated"))
              .map(p => p.procedureId);
            return { num, den };
          }
        },
        {
          id: "M4", name: "90-day reoperation",
          purpose: "Captures early surgical failure, infection washouts, and hematoma evacuations.",
          numeratorDesc: "Procedures followed by an unplanned return to the OR within 90 days (adjudicated)",
          denominatorDesc: "All completed procedures with ≥90 days of follow-up",
          inclusion: "All spine procedures", exclusion: "Planned staged procedures",
          target: 3, warning: 2.5, direction: "lower", unit: "%",
          period: "Rolling 12 months", dataSource: "Complications table", owner: "Quality nurse",
          reviewFrequency: "Monthly", riskAdjustment: "Placeholder — unadjusted",
          status: "Active", versions: [{ v: "1.0", date: "2026-06-01", note: "Initial definition" }],
          compute(s) {
            const procs = s.procedures().filter(p => daysBetween(p.procedureDate, window.SQISeed.helpers.AS_OF) >= 90);
            const den = procs.map(p => p.procedureId);
            const num = procs.filter(p => s.complications().some(c =>
              c.procedureId === p.procedureId && c.reoperation === "Yes" &&
              ["Inpatient", "30-day", "90-day"].includes(c.timing) && c.reviewStatus === "Adjudicated"))
              .map(p => p.procedureId);
            return { num, den };
          }
        },
        {
          id: "M5", name: "New patients seen within 14 days of referral",
          purpose: "Access measure: delayed first visits are associated with patient attrition and dissatisfaction.",
          numeratorDesc: "Episodes whose first appointment occurred ≤14 calendar days after referral",
          denominatorDesc: "All new episodes with a recorded first appointment",
          inclusion: "New referrals", exclusion: "Episodes missing a first-appointment date (counted in data quality)",
          target: 80, warning: 70, direction: "higher", unit: "%",
          period: "Rolling 6 months", dataSource: "Episodes table", owner: "Clinic manager",
          reviewFrequency: "Monthly", riskAdjustment: "None (access measure)",
          status: "Active", versions: [{ v: "1.0", date: "2026-06-01", note: "14-day target requires clinic approval" }],
          compute(s) {
            const eps = s.episodes().filter(e => e.firstApptDate && e.referralDate);
            const den = eps.map(e => e.episodeId);
            const num = eps.filter(e => daysBetween(e.referralDate, e.firstApptDate) <= 14).map(e => e.episodeId);
            return { num, den };
          }
        },
        {
          id: "M6", name: "Postoperative patients lost to follow-up",
          purpose: "Loss to follow-up hides both complications and poor outcomes; it is the denominator's biggest threat.",
          numeratorDesc: "Surgical episodes with status 'Lost to follow-up' or no contact for >6 months before expected closure",
          denominatorDesc: "All surgical episodes",
          inclusion: "Episodes with a completed procedure", exclusion: "Episodes closed appropriately",
          target: 10, warning: 15, direction: "lower", unit: "%",
          period: "Rolling 24 months", dataSource: "Episodes + pathway", owner: "Care navigator",
          reviewFrequency: "Monthly", riskAdjustment: "None",
          status: "Active", versions: [{ v: "1.0", date: "2026-06-01", note: "Lost-to-follow-up definition requires clinical approval" }],
          compute(s) {
            const eps = s.episodes().filter(e => s.byEpisode[e.episodeId].procedures.length);
            const den = eps.map(e => e.episodeId);
            const num = eps.filter(e => e.status === "Lost to follow-up" ||
              (s.byEpisode[e.episodeId].pathway || {}).followUpStatus === "Lost to follow-up").map(e => e.episodeId);
            return { num, den };
          }
        }
      ];
    },

    evaluate(def, store) {
      const { num, den } = def.compute(store);
      const n = den.length, x = num.length;
      const rate = n ? (x / n) * 100 : null;
      const ci = n ? St.wilsonCI(x, n).map(v => St.round(v * 100, 1)) : null;
      let status = "none";
      if (def.target !== null && rate !== null && n >= St.MIN_N) {
        const good = def.direction === "higher" ? rate >= def.target : rate <= def.target;
        const warn = def.direction === "higher" ? rate >= def.warning : rate <= def.warning;
        status = good ? "good" : warn ? "warn" : "bad";
      }
      return {
        def, numerator: x, denominator: n, rate: St.round(rate, 1), ci,
        status, smallSample: n > 0 && n < St.MIN_N,
        numeratorIds: num, denominatorIds: den
      };
    },

    evaluateAll(store) { return this.definitions.map(d => this.evaluate(d, store)); },

    addDefinition(def) {
      def.versions = def.versions || [{ v: "1.0", date: new Date().toISOString().slice(0, 10), note: "Created in measure builder" }];
      def.compute = def.compute || (() => ({ num: [], den: [] })); // user-defined measures start as documentation-only
      def.status = def.status || "Draft — awaiting data mapping and clinical approval";
      this.definitions.push(def);
    }
  };

  const { daysBetween } = window.SQISeed.helpers;
  window.SQIMeasures = Engine;
})();
