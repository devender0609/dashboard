/* worklist.js — the monitoring worklist: who is overdue and who is deteriorating,
   each with an owner, due date, and recommended action. This is the "monitor
   those" function. */
(function () {
  const U = window.PROMUi, P = window.PROMPages;
  let cat = "all";

  function render(root) {
    const S = window.PROMStore;
    const items = S.worklist();
    const cats = ["Overdue assessment", "Outcome deterioration"];
    const counts = {}; cats.forEach(c => counts[c] = items.filter(i => i.category === c).length);
    const shown = cat === "all" ? items : items.filter(i => i.category === cat);

    root.innerHTML = `
      <div class="filter-bar">${P._cohortFilter(S)}${P._providerFilter(S)}</div>
      <div class="method-note">Generated automatically from the score data — no extra documentation needed. Deterioration = a follow-up worse than baseline by at least the instrument's MCID magnitude (placeholder thresholds). Work priority-1 (deterioration) items first.</div>
      <div class="pill-tabs">
        <button data-c="all" class="${cat === "all" ? "active" : ""}">All (${items.length})</button>
        ${cats.map(c => `<button data-c="${U.esc(c)}" class="${cat === c ? "active" : ""}">${U.esc(c)} (${counts[c]})</button>`).join("")}
      </div>
      <div class="card">${U.table([
        { key: "category", label: "Category", render: r => U.badge(r.category, r.category === "Outcome deterioration" ? "bad" : "warn") },
        { key: "subjectId", label: "Subject" }, { key: "cohort", label: "Cohort" },
        { key: "detail", label: "Detail" }, { key: "action", label: "Recommended action" },
        { key: "owner", label: "Owner" }, { key: "due", label: "Due / observed" }
      ], shown, { rowClick: r => window.PROMPages.subjects.openSubject(r.subjectId), note: "Click a row to open the subject's score timeline. Export for outreach worksheets." })}
        <div class="btn-row"><button class="btn small" id="wl-exp">Export worklist (CSV)</button></div></div>`;

    root.querySelectorAll("[data-c]").forEach(b => b.addEventListener("click", () => { cat = b.dataset.c; render(root); }));
    P._bindFilters(root);
    document.getElementById("wl-exp").onclick = () => { window.SQICsv.downloadCSV(shown, "prom_monitoring_worklist.csv"); S.audit("Export", "Worklist"); };
    U.bindTooltips(root);
  }

  window.PROMPages = window.PROMPages || {};
  window.PROMPages.worklist = { title: "Monitoring Worklist", render };
})();
