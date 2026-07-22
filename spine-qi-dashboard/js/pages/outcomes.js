/* outcomes.js — Patient Outcomes: longitudinal PROM trajectories with the
   denominator at every timepoint, MCID/deterioration summaries, and cohort
   filters beyond the global ones. */
(function () {
  const U = window.SQIComponents, St = window.SQIStats, Ch = window.SQICharts;

  const local = { instrument: "ODI", age: "all", sex: "all", bmi: "all", smoking: "all", comorb: "all", mis: "all", revision: "all" };

  function cohortEpisodes(S) {
    return S.episodes().filter(e => {
      const p = S.patientById[e.patientId]; if (!p) return false;
      const b = S.byEpisode[e.episodeId];
      if (local.age !== "all") { const bands = { "<50": a => a < 50, "50-64": a => a >= 50 && a < 65, "65+": a => a >= 65 }; if (!bands[local.age](p.age)) return false; }
      if (local.sex !== "all" && p.sex !== local.sex) return false;
      if (local.bmi !== "all") { const ok = local.bmi === "<30" ? p.bmi < 30 : p.bmi >= 30; if (!p.bmi || !ok) return false; }
      if (local.smoking !== "all" && p.smoking !== local.smoking) return false;
      if (local.comorb !== "all") { const n = p.comorbidities ? p.comorbidities.split(";").length : 0; if (local.comorb === "0-1" ? n > 1 : n <= 1) return false; }
      if (local.mis !== "all") { if (!b.procedures.length || b.procedures[0].misOrOpen !== local.mis) return false; }
      if (local.revision !== "all") { if (!b.procedures.length || b.procedures[0].primaryOrRevision !== local.revision) return false; }
      return true;
    });
  }

  function render(root) {
    const S = window.SQIStore;
    const th = S.threshold(local.instrument);
    const eps = cohortEpisodes(S);
    const epIds = new Set(eps.map(e => e.episodeId));
    const rows = S.promAnalysis().filter(r => r.instrument === local.instrument && epIds.has(r.episodeId));

    const tps = S.data.timepoints;
    const labels = tps.map(t => t.label);
    const baselineScores = [];
    const perTp = tps.map(tp => {
      if (tp.code === "baseline") {
        const scores = [];
        eps.forEach(e => {
          const b = S.byEpisode[e.episodeId].proms.find(p => p.instrument === local.instrument && p.timepoint === "baseline");
          if (b) { scores.push(b.score); baselineScores.push(b.score); }
        });
        return { scores, n: scores.length, changes: [], mcid: null, det: null, due: null };
      }
      const collected = rows.filter(r => r.timepoint === tp.code && r.score !== null);
      const due = rows.filter(r => r.timepoint === tp.code && r.status !== "Not yet due");
      const paired = collected.filter(r => r.baseline !== null);
      return {
        scores: collected.map(r => r.score), n: collected.length,
        changes: paired.map(r => r.change),
        mcid: paired.filter(r => r.mcidMet === true).length,
        mcidDen: paired.filter(r => r.mcidMet !== null).length,
        det: paired.filter(r => r.deteriorated === true).length,
        pairedN: paired.length, due: due.length
      };
    });

    const meanSeries = perTp.map(t => t.scores.length ? St.round(St.mean(t.scores), 1) : null);
    const medianSeries = perTp.map(t => t.scores.length ? St.round(St.median(t.scores), 1) : null);
    const nSeries = perTp.map(t => t.n);

    const instrOpts = Object.keys(S.data.instruments).map(k => `<option value="${k}" ${k === local.instrument ? "selected" : ""}>${S.data.instruments[k].name}</option>`).join("");
    const sel = (id, opts, cur) => `<select data-local="${id}">${opts.map(o => `<option value="${o[0]}" ${o[0] === cur ? "selected" : ""}>${o[1]}</option>`).join("")}</select>`;

    const summaryCols = [
      { key: "tp", label: "Timepoint" },
      { key: "n", label: "n collected", num: true },
      { key: "due", label: "n due", num: true },
      { key: "completion", label: "Completion", num: true },
      { key: "mean", label: "Mean (95% CI)", num: true },
      { key: "median", label: "Median", num: true },
      { key: "meanChange", label: "Mean Δ from baseline", num: true },
      { key: "medianChange", label: "Median Δ", num: true },
      { key: "mcid", label: "MCID met", num: true },
      { key: "det", label: "Deteriorated", num: true }
    ];
    const summaryRows = tps.map((tp, i) => {
      const t = perTp[i];
      const ci = t.scores.length >= 2 ? St.meanCI(t.scores) : null;
      return {
        tp: tp.label, n: t.n, due: tp.code === "baseline" ? "—" : t.due,
        completion: tp.code === "baseline" ? "—" : (t.due ? St.pct(t.n, t.due) + "%" : "—"),
        mean: (meanSeries[i] ?? "—") + (ci ? ` (${St.round(ci[0], 1)}–${St.round(ci[1], 1)})` : ""),
        median: medianSeries[i] ?? "—",
        meanChange: t.changes.length ? St.round(St.mean(t.changes), 1) : "—",
        medianChange: t.changes.length ? St.round(St.median(t.changes), 1) : "—",
        mcid: t.mcidDen ? `${t.mcid}/${t.mcidDen} (${St.pct(t.mcid, t.mcidDen)}%)` : "—",
        det: t.pairedN ? `${t.det}/${t.pairedN}` : "—"
      };
    });

    root.innerHTML = `
      <div class="filter-bar">
        <div class="gf"><label>Instrument ${U.infoIcon("Scores are shown in the instrument's native scale. Direction of improvement: " + (th ? th.direction : "see threshold table"))}</label><select data-local="instrument">${instrOpts}</select></div>
        <div class="gf"><label>Age</label>${sel("age", [["all", "All"], ["<50", "<50"], ["50-64", "50–64"], ["65+", "65+"]], local.age)}</div>
        <div class="gf"><label>Sex</label>${sel("sex", [["all", "All"], ["Female", "Female"], ["Male", "Male"]], local.sex)}</div>
        <div class="gf"><label>BMI</label>${sel("bmi", [["all", "All"], ["<30", "<30"], ["30+", "≥30"]], local.bmi)}</div>
        <div class="gf"><label>Smoking</label>${sel("smoking", [["all", "All"], ["Never", "Never"], ["Former", "Former"], ["Current", "Current"]], local.smoking)}</div>
        <div class="gf"><label>Comorbidities</label>${sel("comorb", [["all", "All"], ["0-1", "0–1"], ["2+", "2+"]], local.comorb)}</div>
        <div class="gf"><label>MIS / Open</label>${sel("mis", [["all", "All"], ["MIS", "MIS"], ["Open", "Open"]], local.mis)}</div>
        <div class="gf"><label>Primary / Revision</label>${sel("revision", [["all", "All"], ["Primary", "Primary"], ["Revision", "Revision"]], local.revision)}</div>
      </div>

      ${th && th.status !== "Approved" ? `<div class="flag-note">MCID/PASS thresholds for ${U.esc(local.instrument)} are placeholder defaults (${U.esc(th.source)}). MCID rows below are for demonstration and must not be reported externally until the threshold table is clinically approved.</div>` : ""}

      <div class="grid two">
        <div class="card">
          <h3>${U.esc(S.data.instruments[local.instrument].name)} — mean trajectory ${U.infoIcon("Mean and median observed scores at each timepoint. Patients contribute only at timepoints where a score exists; attrition changes the cohort across timepoints — see the n row.")}</h3>
          <div class="sub">Cohort: ${eps.length} episodes under current filters</div>
          <div class="chart-box tall"><canvas id="oc-traj"></canvas></div>
          <div class="denominator-line">n contributing per timepoint: ${nSeries.map((n, i) => labels[i] + " = " + n).join(" · ")}</div>
        </div>
        <div class="card">
          <h3>Follow-up completion by timepoint ${U.infoIcon("Collected ÷ due. 'Due' excludes assessments whose window has not opened yet.")}</h3>
          <div class="sub">Missing follow-up threatens validity of every outcome above</div>
          <div class="chart-box tall"><canvas id="oc-comp"></canvas></div>
          <div class="denominator-line">Due per timepoint: ${perTp.map((t, i) => tps[i].code === "baseline" ? null : labels[i] + " = " + t.due).filter(Boolean).join(" · ")}</div>
        </div>
      </div>

      <div class="section-title">Timepoint summary</div>
      <div class="card">${U.table(summaryCols, summaryRows, { note: "Δ computed only for patients with paired baseline and follow-up scores. MCID denominators include only paired scores with an applicable threshold. Deterioration = worsening beyond the MCID magnitude. No statistical test has been applied; confidence intervals describe estimate precision only." })}</div>
    `;

    const dirNote = th ? (th.direction === "decrease" ? " (lower is better)" : " (higher is better)") : "";
    Ch.line("oc-traj", labels, [
      { label: "Mean" + dirNote, data: meanSeries },
      { label: "Median", data: medianSeries, dashed: true, color: "#7b4fa6" }
    ]);
    Ch.bar("oc-comp", labels.slice(1), [{
      label: "Completion %",
      data: perTp.slice(1).map(t => t.due ? St.pct(t.n, t.due) : null), color: "#0d7f8c"
    }]);

    root.querySelectorAll("[data-local]").forEach(el => el.addEventListener("change", () => {
      local[el.dataset.local] = el.value; render(root);
    }));
    U.bindTooltips(root);
  }

  window.SQIPages = window.SQIPages || {};
  window.SQIPages.outcomes = { title: "Patient Outcomes", render };
})();
