/* subjects.js — subject registry (keyed by study ID) + per-subject score
   timeline showing every assessment, its change, and the due schedule. */
(function () {
  const U = window.PROMUi, St = window.SQIStats, P = window.PROMPages;
  const { TIMEPOINTS, INSTRUMENTS } = window.PROMConfig;
  let search = "";

  function rows(S) {
    return S.subjects.filter(s => S.subjectMatches(s)).map(s => {
      const scs = (S.scoresBySubject[s.subjectId] || []);
      const primary = scs.filter(x => ["ODI", "NDI", "SRS-22r"].includes(x.instrument));
      const latest = primary.slice().sort((a, b) => a.collectedDate < b.collectedDate ? 1 : -1)[0];
      const base = latest ? primary.find(x => x.instrument === latest.instrument && x.timepoint === "baseline") : null;
      const over = S.analysis().filter(r => r.subjectId === s.subjectId && r.status === "Overdue").length;
      const det = S.analysis().some(r => r.subjectId === s.subjectId && r.deteriorated === true);
      return { subjectId: s.subjectId, cohort: s.cohort, provider: s.provider, anchorDate: s.anchorDate || "—",
        latest: latest ? `${latest.instrument} ${latest.score} (${latest.timepoint})` : "None",
        change: latest && base && latest.timepoint !== "baseline" ? St.round(latest.score - base.score, 1) : "—",
        overdue: over || "", deteriorating: det ? "⚑" : "", assessments: scs.length };
    });
  }

  function render(root) {
    const S = window.PROMStore;
    let r = rows(S);
    if (search) { const q = search.toLowerCase(); r = r.filter(x => Object.values(x).some(v => String(v).toLowerCase().includes(q))); }
    root.innerHTML = `
      <div class="filter-bar">
        <input class="search-input" id="sb-search" placeholder="Search subject, cohort, provider…" value="${U.esc(search)}">
        ${P._cohortFilter(S)}${P._providerFilter(S)}
        <button class="btn small" id="sb-exp">Export subjects (CSV)</button>
      </div>
      <div class="card"><h3>Subject registry <span class="muted" style="font-weight:400">· ${r.length} subjects</span> ${U.infoIcon("One row per enrolled study subject. No names or MRN — subjects are de-identified study IDs. Click a row for the score timeline.")}</h3>
        ${U.table([
          { key: "subjectId", label: "Subject" }, { key: "cohort", label: "Cohort" }, { key: "provider", label: "Provider" },
          { key: "anchorDate", label: "Anchor date" }, { key: "assessments", label: "Assessments", num: true },
          { key: "latest", label: "Most recent PROM" }, { key: "change", label: "Δ from baseline", num: true },
          { key: "overdue", label: "Overdue", render: x => x.overdue ? U.badge(x.overdue + " overdue", "warn") : "" },
          { key: "deteriorating", label: "Flag", render: x => x.deteriorating ? U.badge("Deteriorating", "bad") : "" }
        ], r, { rowClick: x => openSubject(x.subjectId), note: "Click any row for the full assessment timeline and due schedule." })}</div>`;

    const inp = document.getElementById("sb-search");
    inp.addEventListener("input", () => { search = inp.value; render(root); const v = document.getElementById("sb-search"); v.focus(); v.setSelectionRange(v.value.length, v.value.length); });
    P._bindFilters(root);
    document.getElementById("sb-exp").onclick = () => { window.SQICsv.downloadCSV(r, "prom_subjects.csv"); S.audit("Export", "Subjects"); };
    U.bindTooltips(root);
  }

  function openSubject(subjectId) {
    const S = window.PROMStore;
    const sub = S.subjectById[subjectId];
    const scs = (S.scoresBySubject[subjectId] || []).slice().sort((a, b) => a.collectedDate < b.collectedDate ? 1 : -1);
    const analysis = S.analysis().filter(r => r.subjectId === subjectId);
    const events = scs.map(sc => {
      const a = analysis.find(x => x.instrument === sc.instrument && x.timepoint === sc.timepoint);
      const k = a && a.deteriorated ? "bad" : a && a.mcidMet ? "good" : "";
      const chg = a && a.change !== null ? ` (Δ ${a.change > 0 ? "+" : ""}${a.change}${a.mcidMet ? ", MCID met" : a.deteriorated ? ", deteriorated" : ""})` : sc.timepoint === "baseline" ? " (baseline)" : "";
      return { d: sc.collectedDate, t: `${sc.instrument} = ${sc.score}${chg} · ${sc.timepoint} · ${sc.source}`, k };
    });
    // pending/overdue schedule
    analysis.filter(r => r.status === "Overdue" || r.status === "In window").forEach(r => events.push({ d: r.due, t: `DUE: ${r.instrument} ${r.timepoint}${r.status === "Overdue" ? " — OVERDUE" : ""}`, k: r.status === "Overdue" ? "bad" : "" }));
    events.sort((a, b) => a.d < b.d ? 1 : -1);

    U.openModal({
      title: `<h2>${U.esc(subjectId)} <span class="muted" style="font-size:13px;font-weight:400">· ${U.esc(sub ? sub.cohort : "")} · anchor ${U.esc(sub ? (sub.anchorDate || "none") : "")} · ${U.esc(sub ? sub.provider : "")}</span></h2><div class="muted" style="font-size:12px">De-identified study subject — no patient identifiers stored.</div>`,
      body: `<div class="timeline">${events.map(e => `<div class="tl-item ${e.k ? "tl-" + e.k : ""}"><div class="tl-date">${U.esc(e.d || "—")}</div><div class="tl-text">${U.esc(e.t)}</div></div>`).join("") || '<div class="empty-state">No assessments recorded.</div>'}</div>`
    });
  }

  window.PROMPages = window.PROMPages || {};
  window.PROMPages.subjects = { title: "Subjects", render, openSubject };
})();
