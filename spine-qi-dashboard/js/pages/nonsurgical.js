/* nonsurgical.js — Nonsurgical Quality: conservative-care funnel, injection
   response, opioid exposure, escalation to surgery, and patients getting worse
   without a documented plan. */
(function () {
  const U = window.SQIComponents, St = window.SQIStats, Ch = window.SQICharts;

  function render(root) {
    const S = window.SQIStore;
    // nonsurgical = episodes without a completed procedure
    const eps = S.episodes().filter(e => !S.byEpisode[e.episodeId].procedures.length);
    const ids = new Set(eps.map(e => e.episodeId));
    const pws = S.data.pathways.filter(p => ids.has(p.episodeId));

    const ptRec = pws.filter(p => p.ptRecommended === "Yes");
    const ptInit = ptRec.filter(p => p.ptInitiated === "Yes");
    const ptComp = ptInit.filter(p => p.ptCompleted === "Yes");
    const injRec = pws.filter(p => p.injectionRecommended === "Yes");
    const injDone = injRec.filter(p => p.injectionCompleted === "Yes");
    const opioid = pws.filter(p => p.opioidDays > 0);
    const opioidLong = pws.filter(p => p.opioidDays > 42);
    const escalated = pws.filter(p => p.surgeryRecommended === "Yes");
    const noFU = eps.filter(e => (S.byEpisode[e.episodeId].pathway || {}).followUpStatus === "Overdue" || e.status === "Lost to follow-up");

    // pain/function improvement using NRS + PROMIS-PF at 3m
    const pa = S.promAnalysis().filter(r => ids.has(r.episodeId) && r.timepoint === "3m" && r.change !== null);
    const painRows = pa.filter(r => r.instrument === "NRS-Pain");
    const funcRows = pa.filter(r => r.instrument === "PROMIS-PF");
    const painImproved = painRows.filter(r => r.mcidMet === true).length;
    const funcImproved = funcRows.filter(r => r.mcidMet === true).length;
    const worse = S.promAnalysis().filter(r => ids.has(r.episodeId) && r.deteriorated === true);
    const worseEps = [...new Set(worse.map(r => r.episodeId))];

    // injection response: NRS change at 6w among injection-completed episodes
    const injIds = new Set(injDone.map(p => p.episodeId));
    const injResp = S.promAnalysis().filter(r => injIds.has(r.episodeId) && r.instrument === "NRS-Pain" && r.timepoint === "6w" && r.change !== null);
    const injResponders = injResp.filter(r => r.mcidMet === true).length;

    // ED visits among nonsurgical episodes (complications table covers surgical; use worklist proxy)
    const edVisits = S.data.complications.filter(c => ids.has(c.episodeId) && c.edVisit === "Yes").length;

    root.innerHTML = `
      <div class="grid kpi">
        ${U.kpiCard({ name: "Nonsurgical episodes", value: eps.length, denomText: "no completed procedure, current filters", tip: "Episodes without a completed procedure. Surgical-evaluation episodes that have not reached the OR are included." })}
        ${U.kpiCard({ name: "PT initiation", value: St.pct(ptInit.length, ptRec.length) !== null ? St.pct(ptInit.length, ptRec.length) + "%" : "—", denomText: `${ptInit.length} of ${ptRec.length} recommended`, tip: "Among episodes where physical therapy was recommended, the share with a documented first PT visit." })}
        ${U.kpiCard({ name: "PT completion", value: St.pct(ptComp.length, ptInit.length) !== null ? St.pct(ptComp.length, ptInit.length) + "%" : "—", denomText: `${ptComp.length} of ${ptInit.length} initiated`, tip: "Among initiated courses, the share documented as completed." })}
        ${U.kpiCard({ name: "Injection completion", value: St.pct(injDone.length, injRec.length) !== null ? St.pct(injDone.length, injRec.length) + "%" : "—", denomText: `${injDone.length} of ${injRec.length} recommended`, tip: "Among recommended injections, share performed." })}
        ${U.kpiCard({ name: "Injection response (6w)", value: injResp.length ? St.pct(injResponders, injResp.length) + "%" : "—", denomText: `${injResponders} of ${injResp.length} with paired pain scores`, tip: "Pain improvement ≥ MCID (placeholder threshold) on NRS at 6 weeks among injection-completed episodes with paired scores. Association only — no causal claim; natural history and co-interventions are not controlled." })}
        ${U.kpiCard({ name: "Opioid exposure", value: St.pct(opioid.length, pws.length) + "%", denomText: `${opioid.length} episodes · ${opioidLong.length} beyond 6 weeks`, status: opioidLong.length ? "warn" : "none", tip: "Episodes with any documented opioid days. Amber when any course exceeds 6 weeks (draft threshold pending clinical approval)." })}
        ${U.kpiCard({ name: "Escalation to surgery", value: St.pct(escalated.length, pws.length) + "%", denomText: `${escalated.length} of ${pws.length} episodes`, tip: "Nonsurgical episodes in which surgery has been recommended. Not inherently good or bad — review alongside symptom trajectory." })}
        ${U.kpiCard({ name: "ED visits", value: edVisits, denomText: "recorded among nonsurgical episodes", tip: "Emergency department visits recorded for nonsurgical episodes." })}
        ${U.kpiCard({ name: "No documented follow-up", value: noFU.length, denomText: "episodes overdue or lost", status: noFU.length ? "bad" : "good", tip: "Nonsurgical episodes overdue for contact or lost to follow-up.", onClick: "fu" })}
        ${U.kpiCard({ name: "Symptoms worsened", value: worseEps.length, denomText: "episodes with deterioration ≥ MCID magnitude", status: worseEps.length ? "warn" : "none", tip: "Any instrument worsening by at least the MCID magnitude from baseline (placeholder thresholds). These patients appear in the Care-Pathway worklist for clinician review.", onClick: "worse" })}
      </div>

      <div class="grid two">
        <div class="card"><h3>Conservative-care funnel ${U.infoIcon("Where recommended care is not happening. Each stage's denominator is the previous stage.")}</h3>
          <div class="sub">Denominators: recommended → initiated → completed</div>
          <div class="chart-box"><canvas id="ns-funnel"></canvas></div>
          <div class="denominator-line">PT: ${ptRec.length} recommended → ${ptInit.length} initiated → ${ptComp.length} completed. Injections: ${injRec.length} recommended → ${injDone.length} completed.</div></div>
        <div class="card"><h3>Improvement at 3 months ${U.infoIcon("Share of nonsurgical episodes with paired baseline/3-month scores whose improvement meets the placeholder MCID. Missing follow-up is shown — absent patients are not assumed improved.")}</h3>
          <div class="sub">Paired scores only; denominators shown per bar</div>
          <div class="chart-box"><canvas id="ns-improve"></canvas></div>
          <div class="denominator-line">Pain: ${painImproved}/${painRows.length} · Function: ${funcImproved}/${funcRows.length}. Time-to-improvement analysis requires visit-level data (planned).</div></div>
      </div>
      <div class="method-note">Injection "response" and improvement percentages describe association, not causation: patients improve for many reasons including natural history. MCID thresholds are placeholders pending validation.</div>
    `;

    Ch.bar("ns-funnel", ["PT rec.", "PT init.", "PT compl.", "Inj rec.", "Inj compl."],
      [{ label: "Episodes", data: [ptRec.length, ptInit.length, ptComp.length, injRec.length, injDone.length], color: "#0d7f8c" }]);
    Ch.bar("ns-improve", ["Pain (NRS)", "Function (PROMIS-PF)"],
      [{ label: "% meeting MCID (placeholder)", data: [St.pct(painImproved, painRows.length), St.pct(funcImproved, funcRows.length)], color: "#1c7a43" }]);

    root.querySelectorAll("[data-drill]").forEach(el => {
      el.addEventListener("click", () => {
        if (el.dataset.drill === "fu") U.showEpisodeList("Nonsurgical — no documented follow-up", noFU.map(e => e.episodeId));
        if (el.dataset.drill === "worse") U.showEpisodeList("Nonsurgical — symptoms worsened", worseEps);
      });
    });
    U.bindTooltips(root);
  }

  window.SQIPages = window.SQIPages || {};
  window.SQIPages.nonsurgical = { title: "Nonsurgical Quality", render };
})();
