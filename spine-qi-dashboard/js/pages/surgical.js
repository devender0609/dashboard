/* surgical.js — Surgical Quality: complication profile, process metrics,
   provider view WITHOUT league-table ranking (alphabetical, case mix shown,
   CIs and small-sample flags), and case-level drill-down. */
(function () {
  const U = window.SQIComponents, St = window.SQIStats, Ch = window.SQICharts;
  const { daysBetween, AS_OF } = window.SQISeed.helpers;

  function compFlag(S, procId, pred) {
    return S.complications().some(c => c.procedureId === procId && pred(c));
  }

  function render(root) {
    const S = window.SQIStore;
    const procs = S.procedures();
    const comps = S.complications();

    const compTypes = ["Surgical site infection", "New neurologic deficit", "Dural tear", "Venous thromboembolism", "Implant complication", "Nonunion / pseudarthrosis", "Postoperative hematoma", "Medical complication"];
    const typeCounts = compTypes.map(t => comps.filter(c => c.complicationType === t).length);

    const orTimes = procs.map(p => p.operativeMinutes);
    const ebls = procs.map(p => p.ebl);
    const loss = procs.map(p => p.lengthOfStay);
    const destCounts = {};
    procs.forEach(p => { destCounts[p.dischargeDestination] = (destCounts[p.dischargeDestination] || 0) + 1; });

    const flagRate = pred => { const x = procs.filter(p => compFlag(S, p.procedureId, pred)).length; return { x, n: procs.length, rate: St.pct(x, procs.length), ci: procs.length ? St.wilsonCI(x, procs.length).map(v => St.round(v * 100, 1)) : null }; };
    const ed = flagRate(c => c.edVisit === "Yes");
    const readm = flagRate(c => c.readmission === "Yes");
    const reop = flagRate(c => c.reoperation === "Yes");
    const mort = flagRate(c => c.mortality === "Yes");
    const unadjudicated = comps.filter(c => c.reviewStatus !== "Adjudicated").length;

    // provider table — alphabetical, never ranked
    const surgeons = [...new Set(procs.map(p => p.surgeon))].sort();
    const provRows = surgeons.map(sg => {
      const own = procs.filter(p => p.surgeon === sg);
      const ownComps = comps.filter(c => own.some(p => p.procedureId === c.procedureId));
      const anyComp = own.filter(p => comps.some(c => c.procedureId === p.procedureId)).length;
      const deformityShare = St.pct(own.filter(p => p.spineRegion === "Deformity").length, own.length) || 0;
      const revShare = St.pct(own.filter(p => p.primaryOrRevision === "Revision").length, own.length) || 0;
      const ci = own.length ? St.wilsonCI(anyComp, own.length).map(v => St.round(v * 100, 1)) : null;
      return {
        surgeon: sg, n: own.length,
        caseMix: `${deformityShare}% deformity · ${revShare}% revision · median ${St.round(St.median(own.map(p => p.levels)), 0)} levels`,
        compRate: (St.pct(anyComp, own.length) ?? "—") + "%" + (own.length < St.MIN_N ? "" : ""),
        ciText: ci ? `${ci[0]}–${ci[1]}%` : "—",
        flag: own.length < St.MIN_N ? "small" : "",
        losMed: St.round(St.median(own.map(p => p.lengthOfStay)), 1),
        orMed: St.round(St.median(own.map(p => p.operativeMinutes)), 0),
        _ids: own.map(p => p.episodeId)
      };
    });

    root.innerHTML = `
      <div class="grid kpi">
        ${U.kpiCard({ name: "Procedures in filter", value: procs.length, denomText: "completed spine procedures", tip: "All completed procedures matching global filters." })}
        ${U.kpiCard({ name: "Any recorded complication", value: St.pct(comps.length ? procs.filter(p => comps.some(c => c.procedureId === p.procedureId)).length : 0, procs.length) + "%", denomText: procs.filter(p => comps.some(c => c.procedureId === p.procedureId)).length + " of " + procs.length + " procedures", tip: "Procedures with ≥1 complication of any severity. Includes adjudicated and pending events; pending events are flagged below." })}
        ${U.kpiCard({ name: "ED visits", value: ed.rate + "%", denomText: `${ed.x} of ${ed.n} · 95% CI ${ed.ci ? ed.ci.join("–") : "—"}%`, tip: "Procedures followed by an emergency department visit recorded in the complications table." })}
        ${U.kpiCard({ name: "Readmission (any window)", value: readm.rate + "%", denomText: `${readm.x} of ${readm.n} · 95% CI ${readm.ci ? readm.ci.join("–") : "—"}%`, tip: "Any readmission recorded regardless of timing window. The 30-day measure on the Executive page uses adjudicated events only." })}
        ${U.kpiCard({ name: "Reoperation (any window)", value: reop.rate + "%", denomText: `${reop.x} of ${reop.n} · 95% CI ${reop.ci ? reop.ci.join("–") : "—"}%`, tip: "Any unplanned return to the operating room recorded in the complications table." })}
        ${U.kpiCard({ name: "Mortality", value: mort.x, denomText: "events among " + mort.n + " procedures", tip: "Deaths recorded in the complications table. Every mortality requires case review regardless of count." })}
      </div>

      ${unadjudicated ? `<div class="flag-note">${unadjudicated} complication record(s) are pending adjudication. Rates that specify "adjudicated only" exclude them; the counts above include them. Complete reviews on the Data Quality page worklist.</div>` : ""}

      <div class="grid two">
        <div class="card"><h3>Complication types ${U.infoIcon("Counts of recorded complications by type under current filters. Denominator for rates: " + procs.length + " procedures.")}</h3>
          <div class="sub">n = ${comps.length} complications across ${procs.length} procedures</div>
          <div class="chart-box tall"><canvas id="sq-types"></canvas></div></div>
        <div class="card"><h3>Process metrics ${U.infoIcon("Distributions across procedures in filter. Operative time and EBL vary appropriately with case complexity — compare within procedure type, not across.")}</h3>
          <div class="sub">Interpret with case mix; deformity and multilevel cases shift all three distributions</div>
          ${U.table(
            [{ key: "m", label: "Metric" }, { key: "mean", label: "Mean", num: true }, { key: "median", label: "Median", num: true }, { key: "iqr", label: "IQR", num: true }, { key: "sd", label: "SD", num: true }],
            [
              { m: "Operative time (min)", mean: St.round(St.mean(orTimes), 0), median: St.round(St.median(orTimes), 0), iqr: St.iqr(orTimes) ? St.iqr(orTimes).map(v => St.round(v, 0)).join("–") : "—", sd: St.round(St.sd(orTimes), 0) },
              { m: "Estimated blood loss (mL)", mean: St.round(St.mean(ebls), 0), median: St.round(St.median(ebls), 0), iqr: St.iqr(ebls) ? St.iqr(ebls).map(v => St.round(v, 0)).join("–") : "—", sd: St.round(St.sd(ebls), 0) },
              { m: "Length of stay (days)", mean: St.round(St.mean(loss), 1), median: St.round(St.median(loss), 1), iqr: St.iqr(loss) ? St.iqr(loss).map(v => St.round(v, 1)).join("–") : "—", sd: St.round(St.sd(loss), 1) }
            ], { note: "n = " + procs.length + " procedures." })}
          <h3 style="margin-top:14px">Discharge destination</h3>
          ${U.table([{ key: "d", label: "Destination" }, { key: "n", label: "n", num: true }, { key: "pct", label: "%", num: true }],
            Object.entries(destCounts).map(([d, n]) => ({ d, n, pct: St.pct(n, procs.length) + "%" })))}
        </div>
      </div>

      <div class="section-title">By surgeon ${U.infoIcon("Listed alphabetically — this is NOT a ranking. Complication rates are unadjusted; case mix is shown beside every rate and differs meaningfully between surgeons. Risk-adjusted comparison requires the planned case-mix model and adequate volume.")}</div>
      <div class="method-note">Unadjusted rates with overlapping confidence intervals cannot distinguish surgeon performance. Rows with n&lt;${St.MIN_N} are flagged and must not be compared. A separate risk-adjusted view will be added once the case-mix model is approved (see implementation plan).</div>
      <div class="card">${U.table([
        { key: "surgeon", label: "Surgeon (alphabetical)" },
        { key: "n", label: "Cases", num: true, render: r => r.n + (r.flag ? ` <span class="small-n">⚠ below min n</span>` : "") },
        { key: "caseMix", label: "Case mix" },
        { key: "compRate", label: "Unadjusted complication rate", num: true },
        { key: "ciText", label: "95% CI", num: true },
        { key: "orMed", label: "Median OR min", num: true },
        { key: "losMed", label: "Median LOS", num: true }
      ], provRows, { rowClick: r => U.showEpisodeList("Cases — " + r.surgeon, r._ids, "Click a row for the patient timeline"), note: "Click a row to open the surgeon's case list, then any case for the full patient timeline." })}</div>

      <div class="section-title">Case-level review ${U.infoIcon("Every complication, linked to its procedure and patient. Use for M&M preparation and adjudication.")}</div>
      <div class="card">${U.table([
        { key: "complicationId", label: "ID" }, { key: "complicationType", label: "Type" },
        { key: "date", label: "Date" }, { key: "timing", label: "Timing" },
        { key: "severity", label: "Severity" }, { key: "relatedToProcedure", label: "Related" },
        { key: "preventability", label: "Preventability" },
        { key: "reviewStatus", label: "Review", render: r => r.reviewStatus === "Adjudicated" ? U.badge("Adjudicated", "good") : U.badge("Pending review", "warn") }
      ], comps, { rowClick: r => window.SQIRegistry.openPatient(r.patientId, r.episodeId), note: "Click any row for the patient timeline." })}</div>
    `;

    Ch.bar("sq-types", compTypes.map(t => t.replace(" / pseudarthrosis", "")), [{ label: "Count", data: typeCounts, color: "#b3261e" }]);
    U.bindTooltips(root);
  }

  window.SQIPages = window.SQIPages || {};
  window.SQIPages.surgical = { title: "Surgical Quality", render };
})();
