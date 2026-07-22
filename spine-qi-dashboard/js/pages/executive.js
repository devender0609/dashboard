/* executive.js — Executive Overview. Five-second readability: one KPI band,
   one trend row, drill-down for everything red. RAG only where thresholds exist. */
(function () {
  const U = window.SQIComponents, St = window.SQIStats, Ch = window.SQICharts;
  const { daysBetween, addDays, AS_OF } = window.SQISeed.helpers;

  function monthKey(d) { return d ? d.slice(0, 7) : null; }
  function lastMonths(n) {
    const out = [];
    const end = new Date(AS_OF + "T00:00:00");
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
      out.push(d.toISOString().slice(0, 7));
    }
    return out;
  }
  function momText(series) {
    const vals = series.filter(v => v !== null);
    if (vals.length < 2) return "";
    const cur = vals[vals.length - 1], prev = vals[vals.length - 2];
    if (prev === 0 || prev === null) return "";
    const delta = St.round(cur - prev, 1);
    return `MoM ${delta > 0 ? "▲" : delta < 0 ? "▼" : "▬"} ${Math.abs(delta)}`;
  }

  function render(root) {
    const S = window.SQIStore, M = window.SQIMeasures;
    const eps = S.episodes(), procs = S.procedures(), comps = S.complications();
    const activeEps = eps.filter(e => e.status === "Active");
    const months = lastMonths(12);

    // measure evaluations
    const evals = {};
    M.evaluateAll(S).forEach(ev => { evals[ev.def.id] = ev; });

    // PROM completion (all due follow-up timepoints that were collected)
    const pa = S.promAnalysis().filter(r => r.status !== "Not yet due");
    const promDue = pa.length, promDone = pa.filter(r => r.status === "Collected").length;

    // new patients per month (trend)
    const newByMonth = months.map(m => eps.filter(e => monthKey(e.referralDate) === m).length);
    const surgByMonth = months.map(m => procs.filter(p => monthKey(p.procedureDate) === m).length);

    // satisfaction
    const sat = S.experience().map(x => x.overallSatisfaction);
    // referral-to-appointment
    const waits = eps.filter(e => e.firstApptDate).map(e => daysBetween(e.referralDate, e.firstApptDate));
    // no-show proxy
    const missed = S.data.pathways.filter(pw => S.byEpisode[pw.episodeId] && S.episodeMatches(S.byEpisode[pw.episodeId].episode));
    const noShowEps = missed.filter(pw => pw.missedAppointments > 0).length;
    // overdue follow-up
    const overdueFU = eps.filter(e => (S.byEpisode[e.episodeId].pathway || {}).followUpStatus === "Overdue");
    // major complications
    const major = comps.filter(c => /Major|Life/.test(c.severity));
    const los = procs.map(p => p.lengthOfStay);

    const m3 = evals.M3, m4 = evals.M4, m5 = evals.M5, m6 = evals.M6, m1 = evals.M1, m2 = evals.M2;

    const drills = {};
    let di = 0;
    const drill = (title, ids, sub) => { const k = "d" + (di++); drills[k] = () => U.showEpisodeList(title, ids, sub); return k; };

    root.innerHTML = `
      <div class="grid kpi">
        ${U.kpiCard({ name: "Active episodes", value: activeEps.length, denomText: eps.length + " total episodes in filter", tip: "Episodes with status Active under current global filters.", onClick: drill("Active episodes", activeEps.map(e => e.episodeId)) })}
        ${U.kpiCard({ name: "New patients (12 mo)", value: eps.filter(e => daysBetween(e.referralDate, AS_OF) <= 365).length, denomText: "by referral date", trend: momText(newByMonth), tip: "Unique new episodes referred in the trailing 12 months." })}
        ${U.kpiCard({ name: "Surgical volume (12 mo)", value: procs.filter(p => daysBetween(p.procedureDate, AS_OF) <= 365).length, denomText: procs.length + " procedures in filter", trend: momText(surgByMonth), tip: "Completed spine procedures in the trailing 12 months." })}
        ${U.kpiCard({ name: "PROM completion", value: promDue ? St.pct(promDone, promDue) + "%" : "—", denomText: promDone + " of " + promDue + " due assessments", status: promDue >= St.MIN_N ? (St.pct(promDone, promDue) >= 70 ? "good" : St.pct(promDone, promDue) >= 60 ? "warn" : "bad") : "none", tip: "Collected ÷ due follow-up PROM assessments (baseline excluded). Threshold: ≥70% green, 60–70% amber (draft — pending approval).", onClick: drill("Episodes with overdue PROMs", pa.filter(r => r.status === "Overdue").map(r => r.episodeId), "Assessments past their window") })}
        ${U.kpiCard({ name: "MCID at 12 months", value: m2.rate !== null ? m2.rate + "%" : "—", denomText: m2.numerator + " of " + m2.denominator + " paired scores · " + U.ciText(m2.ci), status: "none", tip: "Display only: MCID thresholds are placeholders pending clinical validation. " + m2.def.numeratorDesc, onClick: drill("MCID achieved at 12m", m2.numeratorIds, "Primary instrument, paired scores") })}
        ${U.kpiCard({ name: "30-day readmission", value: m3.rate !== null ? m3.rate + "%" : "—", denomText: m3.numerator + " of " + m3.denominator + " procedures · " + U.ciText(m3.ci), status: m3.status, tip: m3.def.numeratorDesc + ". Target ≤" + m3.def.target + "%.", onClick: drill("30-day readmissions", m3.numeratorIds.map(id => (S.data.procedures.find(p => p.procedureId === id) || {}).episodeId).filter(Boolean), "Adjudicated events") })}
        ${U.kpiCard({ name: "90-day reoperation", value: m4.rate !== null ? m4.rate + "%" : "—", denomText: m4.numerator + " of " + m4.denominator + " procedures · " + U.ciText(m4.ci), status: m4.status, tip: m4.def.numeratorDesc + ". Target ≤" + m4.def.target + "%.", onClick: drill("90-day reoperations", m4.numeratorIds.map(id => (S.data.procedures.find(p => p.procedureId === id) || {}).episodeId).filter(Boolean)) })}
        ${U.kpiCard({ name: "Major complications", value: major.length, denomText: "of " + comps.length + " recorded complications", tip: "Severity 'Major (invasive intervention)' or 'Life-threatening'. No rate threshold defined yet — counts only.", onClick: drill("Major complications", major.map(c => c.episodeId)) })}
        ${U.kpiCard({ name: "Average length of stay", value: los.length ? St.round(St.mean(los), 1) + " d" : "—", denomText: "median " + St.round(St.median(los), 1) + " d · n=" + los.length, tip: "Mean and median inpatient days across procedures in filter. Interpret with case mix — deformity cases stay longer." })}
        ${U.kpiCard({ name: "Patient satisfaction", value: sat.length ? St.round(St.mean(sat), 2) + " / 5" : "—", denomText: "n=" + sat.length + " surveys", tip: "Mean overall satisfaction from patient-experience surveys (1–5)." })}
        ${U.kpiCard({ name: "Referral → first visit", value: waits.length ? St.round(St.median(waits), 0) + " d median" : "—", denomText: "IQR " + (waits.length ? St.iqr(waits).map(v => St.round(v, 0)).join("–") : "—") + " · n=" + waits.length, status: m5.status, tip: "Median days from referral to first appointment. Related measure M5: ≥" + m5.def.target + "% seen within 14 days (currently " + m5.rate + "%).", onClick: drill("Seen >14 days after referral", m5.denominatorIds.filter(id => !m5.numeratorIds.includes(id)), "Access outliers") })}
        ${U.kpiCard({ name: "Episodes with missed visits", value: St.pct(noShowEps, missed.length) !== null ? St.pct(noShowEps, missed.length) + "%" : "—", denomText: noShowEps + " of " + missed.length + " episodes", tip: "Episodes with ≥1 missed appointment. Visit-level no-show rate requires the scheduling feed (planned integration)." })}
        ${U.kpiCard({ name: "Overdue for follow-up", value: overdueFU.length, denomText: "episodes past expected contact", status: overdueFU.length ? "bad" : "good", tip: "Episodes whose follow-up status is Overdue. Drill through to the worklist to assign outreach.", onClick: drill("Overdue for follow-up", overdueFU.map(e => e.episodeId)) })}
        ${U.kpiCard({ name: "Lost to follow-up (surgical)", value: m6.rate !== null ? m6.rate + "%" : "—", denomText: m6.numerator + " of " + m6.denominator + " surgical episodes", status: m6.status, tip: m6.def.numeratorDesc + ". Target ≤" + m6.def.target + "%.", onClick: drill("Lost to follow-up", m6.numeratorIds) })}
        ${U.kpiCard({ name: "Baseline PROM capture", value: m1.rate !== null ? m1.rate + "%" : "—", denomText: m1.numerator + " of " + m1.denominator + " surgical episodes · " + U.ciText(m1.ci), status: m1.status, tip: m1.def.numeratorDesc + ". Target ≥" + m1.def.target + "%.", onClick: drill("Missing baseline PROMs", m1.denominatorIds.filter(id => !m1.numeratorIds.includes(id))) })}
      </div>

      <div class="section-title">Twelve-month trends ${U.infoIcon("Month-over-month volumes by referral/procedure date under current filters. Year-over-year comparison appears in the tooltip of each point where available.")}</div>
      <div class="grid two">
        <div class="card"><h3>New episodes per month</h3><div class="sub">Denominator: all episodes matching filters, by referral month</div><div class="chart-box"><canvas id="ex-new"></canvas></div></div>
        <div class="card"><h3>Procedures per month</h3><div class="sub">Denominator: completed procedures, by procedure month</div><div class="chart-box"><canvas id="ex-surg"></canvas></div></div>
      </div>
      <div class="method-note">Red/amber/green appears only for measures with an explicitly defined target and warning threshold (M1, M3, M4, M5, M6, PROM completion). All other tiles are informational. Every red tile links to the underlying episode list. Trends are descriptive; no statistical-significance claims are made.</div>
    `;

    Ch.bar("ex-new", months, [{ label: "New episodes", data: newByMonth }]);
    Ch.bar("ex-surg", months, [{ label: "Procedures", data: surgByMonth, color: "#1c7a43" }]);

    root.querySelectorAll("[data-drill]").forEach(el => {
      const fn = drills[el.dataset.drill];
      if (fn) { el.addEventListener("click", fn); el.addEventListener("keydown", e => { if (e.key === "Enter") fn(); }); }
    });
    U.bindTooltips(root);
  }

  window.SQIPages = window.SQIPages || {};
  window.SQIPages.executive = { title: "Executive Overview", render };
})();
