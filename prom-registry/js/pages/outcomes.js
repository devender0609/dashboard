/* outcomes.js — the outcome-monitoring dashboard. Longitudinal trajectory with
   the denominator at every timepoint, MCID/deterioration/completion summary. */
(function () {
  const U = window.PROMUi, St = window.SQIStats, Ch = window.PROMCharts;
  const { TIMEPOINTS, INSTRUMENTS } = window.PROMConfig;

  function render(root) {
    const S = window.PROMStore;
    const instr = S.filters.instrument;
    const th = S.threshold(instr, S.filters.cohort === "all" ? null : S.filters.cohort);
    const rows = S.filteredAnalysis().filter(r => r.instrument === instr);
    const subjIds = new Set(S.subjects.filter(s => S.subjectMatches(s)).map(s => s.subjectId));

    const perTp = TIMEPOINTS.map(tp => {
      if (tp.code === "baseline") {
        const scores = [];
        S.subjects.forEach(s => { if (!subjIds.has(s.subjectId)) return; const b = (S.scoresBySubject[s.subjectId] || []).find(x => x.instrument === instr && x.timepoint === "baseline"); if (b) scores.push(b.score); });
        return { scores, n: scores.length, changes: [], mcid: 0, mcidDen: 0, det: 0, pairedN: 0, due: null };
      }
      const collected = rows.filter(r => r.timepoint === tp.code && r.score !== null);
      const due = rows.filter(r => r.timepoint === tp.code && r.status !== "Not yet due").length;
      const paired = collected.filter(r => r.baseline !== null);
      return { scores: collected.map(r => r.score), n: collected.length, changes: paired.map(r => r.change),
        mcid: paired.filter(r => r.mcidMet === true).length, mcidDen: paired.filter(r => r.mcidMet !== null).length,
        det: paired.filter(r => r.deteriorated === true).length, pairedN: paired.length, due };
    });

    const labels = TIMEPOINTS.map(t => t.label);
    const meanS = perTp.map(t => t.scores.length ? St.round(St.mean(t.scores), 1) : null);
    const medS = perTp.map(t => t.scores.length ? St.round(St.median(t.scores), 1) : null);
    const nS = perTp.map(t => t.n);

    const instrOpts = Object.keys(INSTRUMENTS).map(k => `<option value="${k}" ${k === instr ? "selected" : ""}>${INSTRUMENTS[k].name}</option>`).join("");
    const dir = th ? (th.direction === "decrease" ? " (lower is better)" : " (higher is better)") : "";

    const summaryRows = TIMEPOINTS.map((tp, i) => {
      const t = perTp[i]; const ci = t.scores.length >= 2 ? St.meanCI(t.scores) : null;
      return { tp: tp.label, n: t.n, due: tp.code === "baseline" ? "—" : t.due,
        comp: tp.code === "baseline" ? "—" : (t.due ? St.pct(t.n, t.due) + "%" : "—"),
        mean: (meanS[i] ?? "—") + (ci ? ` (${St.round(ci[0], 1)}–${St.round(ci[1], 1)})` : ""),
        median: medS[i] ?? "—",
        mchange: t.changes.length ? St.round(St.mean(t.changes), 1) : "—",
        mdchange: t.changes.length ? St.round(St.median(t.changes), 1) : "—",
        mcid: t.mcidDen ? `${t.mcid}/${t.mcidDen} (${St.pct(t.mcid, t.mcidDen)}%)` : "—",
        det: t.pairedN ? `${t.det}/${t.pairedN}` : "—" };
    });

    // compact, meaningful overview strip (only threshold-linked or denominator-backed numbers)
    const allSubj = S.subjects.filter(s => S.subjectMatches(s));
    const dueRows = S.filteredAnalysis().filter(r => r.status !== "Not yet due");
    const collected = dueRows.filter(r => r.status === "Collected").length;
    const compPct = dueRows.length ? St.pct(collected, dueRows.length) : null;
    const paired12 = S.filteredAnalysis().filter(r => r.timepoint === "12m" && r.mcidMet !== null);
    const mcid12 = paired12.filter(r => r.mcidMet).length;
    const overdue = dueRows.filter(r => r.status === "Overdue").length;
    const deter = S.filteredAnalysis().filter(r => r.deteriorated === true).length;

    root.innerHTML = `
      <div class="grid kpi tight">
        ${U.kpi({ name: "Subjects", value: allSubj.length, denomText: "enrolled in filter", tip: "Subjects matching the current cohort/provider filters." })}
        ${U.kpi({ name: "Follow-up completion", value: compPct != null ? compPct + "%" : "—", denomText: `${collected} of ${dueRows.length} due assessments`, status: dueRows.length >= St.MIN_N ? (compPct >= 70 ? "good" : compPct >= 60 ? "warn" : "bad") : "none", tip: "Collected ÷ due follow-up assessments (all instruments). Draft target ≥70%." })}
        ${U.kpi({ name: "MCID at 12 months", value: paired12.length ? St.pct(mcid12, paired12.length) + "%" : "—", denomText: `${mcid12} of ${paired12.length} paired scores`, status: "none", tip: "Display only — MCID thresholds are placeholders pending approval. Paired baseline + 12-month scores." })}
        ${U.kpi({ name: "Overdue", value: overdue, denomText: "assessments past window", status: overdue ? "warn" : "good", tip: "Follow-up assessments now past their allowed window — see the Monitoring Worklist.", onClick: "worklist" })}
        ${U.kpi({ name: "Deteriorating", value: deter, denomText: "scores worse than baseline ≥ MCID", status: deter ? "bad" : "good", tip: "Assessments worse than baseline by at least the MCID magnitude (placeholder thresholds).", onClick: "worklist" })}
      </div>

      <div class="filter-bar" style="margin-top:16px">
        <div class="gf"><label>Instrument</label><select data-f="instrument">${instrOpts}</select></div>
        ${cohortFilter(S)}
        ${providerFilter(S)}
      </div>
      ${th && th.status !== "Approved" ? `<div class="flag-note">MCID/PASS for ${U.esc(instr)} is a placeholder (${U.esc(th.source)}). MCID figures below are demonstration until the threshold is clinically approved (Thresholds page).</div>` : ""}
      <div class="grid two">
        <div class="card"><h3>${U.esc(INSTRUMENTS[instr].name)} — trajectory${dir} ${U.infoIcon("Mean and median observed scores at each timepoint. Subjects contribute only where a score exists; attrition changes the cohort across timepoints — see the n row.")}</h3>
          <div class="sub">Cohort: ${subjIds.size} subjects under current filters</div>
          <div class="chart-box tall"><canvas id="oc-traj"></canvas></div>
          <div class="denominator-line">n contributing: ${nS.map((n, i) => labels[i] + "=" + n).join(" · ")}</div></div>
        <div class="card"><h3>Follow-up completion ${U.infoIcon("Collected ÷ due (due excludes windows not yet open). Missing follow-up threatens the validity of every mean above.")}</h3>
          <div class="sub">Denominator printed per bar</div>
          <div class="chart-box tall"><canvas id="oc-comp"></canvas></div>
          <div class="denominator-line">Due: ${perTp.map((t, i) => TIMEPOINTS[i].code === "baseline" ? null : labels[i] + "=" + t.due).filter(Boolean).join(" · ")}</div></div>
      </div>
      <div class="section-title">Timepoint summary</div>
      <div class="card">${U.table([
        { key: "tp", label: "Timepoint" }, { key: "n", label: "n collected", num: true }, { key: "due", label: "n due", num: true },
        { key: "comp", label: "Completion", num: true }, { key: "mean", label: "Mean (95% CI)", num: true }, { key: "median", label: "Median", num: true },
        { key: "mchange", label: "Mean Δ", num: true }, { key: "mdchange", label: "Median Δ", num: true },
        { key: "mcid", label: "MCID met", num: true }, { key: "det", label: "Deteriorated", num: true }
      ], summaryRows, { note: "Δ and MCID use paired baseline+follow-up subjects only. No statistical test applied; CIs describe precision. Association is not causation." })}</div>`;

    Ch.line("oc-traj", labels, [{ label: "Mean" + dir, data: meanS }, { label: "Median", data: medS, dashed: true, color: "#7b4fa6" }]);
    Ch.bar("oc-comp", labels.slice(1), [{ label: "Completion %", data: perTp.slice(1).map(t => t.due ? St.pct(t.n, t.due) : null), color: "#0d7f8c" }]);
    root.querySelectorAll("[data-drill]").forEach(el => { el.addEventListener("click", () => window.PROMApp.go(el.dataset.drill)); el.addEventListener("keydown", e => { if (e.key === "Enter") window.PROMApp.go(el.dataset.drill); }); });
    bindFilters(root); U.bindTooltips(root);
  }

  function cohortFilter(S) { const c = S.cohorts(); return `<div class="gf"><label>Cohort</label><select data-f="cohort"><option value="all">All</option>${c.map(x => `<option ${x === S.filters.cohort ? "selected" : ""}>${x}</option>`).join("")}</select></div>`; }
  function providerFilter(S) { const p = S.providers(); return `<div class="gf"><label>Provider</label><select data-f="provider"><option value="all">All</option>${p.map(x => `<option ${x === S.filters.provider ? "selected" : ""}>${x}</option>`).join("")}</select></div>`; }
  function bindFilters(root) { root.querySelectorAll("[data-f]").forEach(el => el.addEventListener("change", () => { window.PROMStore.filters[el.dataset.f] = el.value; render(root); })); }

  window.PROMPages = window.PROMPages || {};
  window.PROMPages.outcomes = { title: "Outcome Monitoring", render };
  window.PROMPages._cohortFilter = cohortFilter;
  window.PROMPages._providerFilter = providerFilter;
  window.PROMPages._bindFilters = bindFilters;
})();
