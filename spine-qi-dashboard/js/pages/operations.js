/* operations.js — Operations: access, throughput, and a referral-wait control
   chart. Metrics needing feeds not yet integrated are shown as explicit
   placeholders instead of fake numbers. */
(function () {
  const U = window.SQIComponents, St = window.SQIStats, Ch = window.SQICharts;
  const { daysBetween, AS_OF } = window.SQISeed.helpers;

  function lastMonths(n) {
    const out = []; const end = new Date(AS_OF + "T00:00:00");
    for (let i = n - 1; i >= 0; i--) out.push(new Date(end.getFullYear(), end.getMonth() - i, 1).toISOString().slice(0, 7));
    return out;
  }

  function render(root) {
    const S = window.SQIStore;
    const eps = S.episodes();
    const months = lastMonths(12);

    const waits = eps.filter(e => e.firstApptDate).map(e => ({ m: e.referralDate.slice(0, 7), d: daysBetween(e.referralDate, e.firstApptDate) }));
    const allWait = waits.map(w => w.d);
    // p-chart: % seen within 14 days per month
    const periods = months.map(m => { const set = waits.filter(w => w.m === m); return { label: m, n: set.length, x: set.filter(w => w.d <= 14).length }; });
    const pchart = St.pChart(periods.filter(p => p.n > 0));

    const pws = S.data.pathways.filter(p => S.byEpisode[p.episodeId] && S.episodeMatches(S.byEpisode[p.episodeId].episode));
    const missedTotal = pws.reduce((a, p) => a + (p.missedAppointments || 0), 0);
    const imgDays = pws.filter(p => p.imagingDays).map(p => p.imagingDays);
    const procs = S.procedures();
    const schedDays = procs.map(p => {
      const e = S.byEpisode[p.episodeId].episode;
      return e.treatmentPlanDate ? daysBetween(e.treatmentPlanDate, p.procedureDate) : null;
    }).filter(v => v !== null && v >= 0);
    const visitVolume = months.map(m => eps.filter(e => e.firstApptDate && e.firstApptDate.slice(0, 7) === m).length);
    const fuAdherence = St.pct(pws.filter(p => p.followUpStatus === "On schedule" || p.followUpStatus === "Complete").length, pws.length);

    const placeholder = (name, why) => U.kpiCard({ name, value: "—", denomText: "requires integration", tip: why + " This metric is intentionally blank rather than estimated — see the phased integration plan." });

    root.innerHTML = `
      <div class="grid kpi">
        ${U.kpiCard({ name: "Referral → first visit", value: allWait.length ? St.round(St.median(allWait), 0) + " d" : "—", denomText: "median · IQR " + (allWait.length ? St.iqr(allWait).map(v => St.round(v, 0)).join("–") : "—") + " · n=" + allWait.length, tip: "Median calendar days from referral receipt to completed first appointment." })}
        ${U.kpiCard({ name: "Seen within 14 days", value: allWait.length ? St.pct(allWait.filter(d => d <= 14).length, allWait.length) + "%" : "—", denomText: allWait.filter(d => d <= 14).length + " of " + allWait.length, status: allWait.length >= St.MIN_N ? (St.pct(allWait.filter(d => d <= 14).length, allWait.length) >= 80 ? "good" : St.pct(allWait.filter(d => d <= 14).length, allWait.length) >= 70 ? "warn" : "bad") : "none", tip: "Measure M5. Target ≥80%, warning <70% (pending clinic approval)." })}
        ${U.kpiCard({ name: "Missed appointments", value: missedTotal, denomText: "across " + pws.length + " episodes", tip: "Total missed appointments recorded in pathway data. True visit-level no-show and cancellation rates require the scheduling feed." })}
        ${U.kpiCard({ name: "Imaging completion time", value: imgDays.length ? St.round(St.median(imgDays), 0) + " d" : "—", denomText: "median · n=" + imgDays.length, tip: "Days from imaging order to completion where recorded." })}
        ${U.kpiCard({ name: "Decision → surgery", value: schedDays.length ? St.round(St.median(schedDays), 0) + " d" : "—", denomText: "median · IQR " + (schedDays.length ? St.iqr(schedDays).map(v => St.round(v, 0)).join("–") : "—") + " · n=" + schedDays.length, tip: "Days from treatment-plan date to completed procedure, a proxy for surgical scheduling time until scheduling data is integrated." })}
        ${U.kpiCard({ name: "Follow-up adherence", value: fuAdherence !== null ? fuAdherence + "%" : "—", denomText: "episodes on schedule or complete", tip: "Share of episodes whose follow-up status is on schedule or complete." })}
        ${placeholder("Third-next-available", "Requires the scheduling-system feed (appointment templates and slot availability).")}
        ${placeholder("Prior-auth turnaround", "Requires the authorization queue export from the billing/authorization system.")}
        ${placeholder("OR cancellation rate", "Requires the OR scheduling feed including cancellation reasons.")}
        ${placeholder("Documentation completion", "Requires EHR chart-closure timestamps (Athenahealth integration).")}
        ${placeholder("Portal response time", "Requires portal message metadata from the EHR.")}
      </div>

      <div class="grid two">
        <div class="card"><h3>Access control chart — % of new patients seen within 14 days ${U.infoIcon("p-chart with 3σ limits around the centerline (overall proportion). Points outside the limits suggest special-cause variation worth investigating; points inside reflect common-cause variation and should not trigger one-off reactions.")}</h3>
          <div class="sub">Monthly cohorts by referral month; per-month n varies and is listed below</div>
          <div class="chart-box tall"><canvas id="op-pchart"></canvas></div>
          <div class="denominator-line">${periods.filter(p => p.n > 0).map(p => p.label + ": n=" + p.n).join(" · ")}</div></div>
        <div class="card"><h3>First visits per month</h3>
          <div class="sub">Completed first appointments by month</div>
          <div class="chart-box tall"><canvas id="op-vol"></canvas></div></div>
      </div>
      <div class="method-note">Blank tiles are deliberate: those metrics need scheduling, authorization, OR, or EHR feeds that arrive in Phase 2–3 of the integration plan. Showing estimated numbers here would be fake precision.</div>
    `;

    Ch.controlChart("op-pchart", pchart, periods.filter(p => p.n > 0).map(p => p.label));
    Ch.bar("op-vol", months, [{ label: "First visits", data: visitVolume, color: "#7b4fa6" }]);
    U.bindTooltips(root);
  }

  window.SQIPages = window.SQIPages || {};
  window.SQIPages.operations = { title: "Operations", render };
})();
