/* registry.js — Patient Registry: searchable table + full patient timeline
   (appointments, treatments, procedures, outcomes, complications, pending
   actions). Exposed globally as SQIRegistry so other pages can drill in. */
(function () {
  const U = window.SQIComponents, St = window.SQIStats;
  const { AS_OF } = window.SQISeed.helpers;
  let search = "";

  function registryRows(S) {
    return S.episodes().map(e => {
      const b = S.byEpisode[e.episodeId];
      const primary = b.proms.filter(p => ["ODI", "NDI", "SRS-22r"].includes(p.instrument));
      const latest = primary.sort((a, x) => (a.collectedDate < x.collectedDate ? 1 : -1))[0];
      const base = latest ? primary.find(p => p.instrument === latest.instrument && p.timepoint === "baseline") : null;
      const wl = S.worklist().filter(w => w.episodeId === e.episodeId);
      const next = wl.sort((a, x) => (a.dueDate > x.dueDate ? 1 : -1))[0];
      return {
        patientId: e.patientId, episodeId: e.episodeId,
        diagnosis: e.primaryDiagnosis, region: e.spineRegion,
        provider: e.treatingProvider,
        status: e.status + (b.procedures.length ? " · post-op" : b.pathway && b.pathway.surgeryRecommended === "Yes" ? " · surgical path" : " · nonsurgical"),
        lastProm: latest ? `${latest.instrument} ${latest.score} (${latest.timepoint})` : "None",
        change: latest && base && latest.timepoint !== "baseline" ? St.round(latest.score - base.score, 1) : "—",
        compFlag: b.complications.length ? "⚑ " + b.complications.length : "",
        followUp: b.pathway ? b.pathway.followUpStatus : "—",
        nextAction: next ? next.action : "—",
        due: next ? next.dueDate : "—"
      };
    });
  }

  function render(root) {
    const S = window.SQIStore;
    let rows = registryRows(S);
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(q)));
    }
    root.innerHTML = `
      <div class="filter-bar">
        <input class="search-input" id="reg-search" placeholder="Search patient, diagnosis, provider…" value="${U.esc(search)}">
        <button class="btn small" id="reg-export">Export registry (CSV)</button>
        <button class="btn small ghost" id="reg-export-x">Export (Excel)</button>
        <button class="btn small ghost" id="reg-import">Import CSV/Excel…</button>
        <input type="file" id="reg-file" accept=".csv,.xlsx,.xls" hidden>
      </div>
      <div class="card">
        <h3>Patient registry <span class="muted" style="font-weight:400">· ${rows.length} episodes</span> ${U.infoIcon("One row per episode of care. Change column: latest primary-instrument score minus baseline (negative = improvement for ODI/NDI). Click a row for the full timeline.")}</h3>
        ${U.table([
          { key: "patientId", label: "Patient" }, { key: "episodeId", label: "Episode" },
          { key: "region", label: "Region" }, { key: "diagnosis", label: "Diagnosis" },
          { key: "provider", label: "Provider" }, { key: "status", label: "Treatment status" },
          { key: "lastProm", label: "Most recent PROM" }, { key: "change", label: "Δ from baseline", num: true },
          { key: "compFlag", label: "Compl.", render: r => r.compFlag ? U.badge(r.compFlag, "bad") : "" },
          { key: "followUp", label: "Follow-up" },
          { key: "nextAction", label: "Next action" }, { key: "due", label: "Due" }
        ], rows, { rowClick: r => openPatient(r.patientId, r.episodeId), note: "Imports accept the demo-data CSV templates (patients, episodes, proms); rejected rows appear on the Data Quality page." })}
      </div>`;

    const inp = document.getElementById("reg-search");
    inp.addEventListener("input", () => { search = inp.value; render(root); document.getElementById("reg-search").focus(); const v = document.getElementById("reg-search"); v.setSelectionRange(v.value.length, v.value.length); });
    const guard = fn => () => { if (!S.ROLES[S.role].canExport) { alert("Your demo role does not permit exports."); return; } fn(); S.audit(null, "Export", "Registry"); };
    document.getElementById("reg-export").onclick = guard(() => window.SQICsv.downloadCSV(rows, "patient_registry.csv"));
    document.getElementById("reg-export-x").onclick = guard(() => window.SQICsv.downloadExcel({ Registry: rows }, "patient_registry.xlsx"));
    document.getElementById("reg-import").onclick = () => document.getElementById("reg-file").click();
    document.getElementById("reg-file").addEventListener("change", ev => {
      const f = ev.target.files[0]; if (!f) return;
      const table = prompt("Import into which table? (patients / episodes / proms)", "proms");
      if (!["patients", "episodes", "proms"].includes(table)) { alert("Unknown table."); return; }
      window.SQICsv.readFile(f, parsed => {
        const res = S.importCSV(table, parsed);
        alert(`Import complete: ${res.accepted} rows accepted, ${res.rejected} rejected.${res.rejected ? " See Data Quality page for details." : ""}`);
        S.buildWorklist(); render(root);
      });
    });
    U.bindTooltips(root);
  }

  // ---- patient timeline ------------------------------------------------------
  function openPatient(patientId, episodeId) {
    const S = window.SQIStore;
    const p = S.patientById[patientId];
    const epIds = episodeId ? [episodeId] : S.data.episodes.filter(e => e.patientId === patientId).map(e => e.episodeId);
    const events = [];
    epIds.forEach(id => {
      const b = S.byEpisode[id]; if (!b) return;
      const e = b.episode;
      events.push({ d: e.referralDate, t: `Referral received (${e.referralSource}) — ${e.primaryDiagnosis}`, k: "" });
      if (e.firstApptDate) events.push({ d: e.firstApptDate, t: `First appointment — ${e.treatingProvider}`, k: "" });
      if (e.treatmentPlanDate) events.push({ d: e.treatmentPlanDate, t: "Treatment plan documented", k: "" });
      const pw = b.pathway;
      if (pw) {
        if (pw.ptInitiated === "Yes") events.push({ d: e.firstApptDate, t: "Physical therapy initiated", k: "good" });
        if (pw.injectionCompleted === "Yes") events.push({ d: e.treatmentPlanDate || e.firstApptDate, t: "Injection completed", k: "good" });
        if (pw.delayReason) events.push({ d: AS_OF, t: "Open delay: " + pw.delayReason, k: "bad" });
      }
      b.procedures.forEach(pr => events.push({ d: pr.procedureDate, t: `Surgery: ${pr.procedureType} (${pr.levels} level${pr.levels > 1 ? "s" : ""}, ${pr.misOrOpen}, ${pr.primaryOrRevision}) — ${pr.surgeon}, LOS ${pr.lengthOfStay}d → ${pr.dischargeDestination}`, k: "good" }));
      b.complications.forEach(c => events.push({ d: c.date, t: `Complication: ${c.complicationType} (${c.severity}; ${c.timing}${c.readmission === "Yes" ? "; readmitted" : ""}${c.reoperation === "Yes" ? "; reoperated" : ""}) — ${c.reviewStatus}`, k: "bad" }));
      b.proms.forEach(pm => events.push({ d: pm.collectedDate, t: `PROM ${pm.instrument} = ${pm.score} (${pm.timepoint}, ${pm.source})`, k: "" }));
      S.worklist().filter(w => w.episodeId === id).forEach(w => events.push({ d: w.dueDate, t: `PENDING (${w.owner}): ${w.action}`, k: "bad" }));
      if (e.closureDate) events.push({ d: e.closureDate, t: "Episode closed", k: "" });
    });
    events.sort((a, b) => (a.d > b.d ? 1 : -1));

    U.openModal({
      title: `<h2>${U.esc(patientId)} <span class="muted" style="font-size:13px;font-weight:400">${p ? `· ${p.age} y ${p.sex} · BMI ${p.bmi ?? "—"} · ${p.smoking || "—"} smoker · ${U.esc(p.comorbidities || "no recorded comorbidities")} · ${p.insurance} · ${p.clinicLocation}` : ""}</span></h2>
        <div class="muted" style="font-size:12px">Synthetic demonstration patient — not a real person.</div>`,
      body: `<div class="timeline">${events.map(ev => `<div class="tl-item ${ev.k ? "tl-" + ev.k : ""}"><div class="tl-date">${U.esc(ev.d || "date pending")}</div><div class="tl-text">${U.esc(ev.t)}</div></div>`).join("") || '<div class="empty-state">No recorded events.</div>'}</div>`
    });
  }

  window.SQIRegistry = { openPatient };
  window.SQIPages = window.SQIPages || {};
  window.SQIPages.registry = { title: "Patient Registry", render };
})();
