/* pathway.js — Care-Pathway Tracker: the actionable worklist. Every item has
   an owner, due date, status, and a recommended next action. */
(function () {
  const U = window.SQIComponents;
  let activeCat = "all";

  function render(root) {
    const S = window.SQIStore;
    const items = S.worklist();
    const cats = ["Awaiting imaging", "Awaiting authorization", "Awaiting physical therapy", "Awaiting injection", "Awaiting surgery", "Overdue postoperative visit", "Overdue PROMs", "Outcome deterioration", "Unresolved complication", "Lost to follow-up"];
    const counts = {}; cats.forEach(c => { counts[c] = items.filter(i => i.category === c).length; });
    const shown = activeCat === "all" ? items : items.filter(i => i.category === activeCat);
    const overdue = shown.filter(i => i.status === "Overdue");

    root.innerHTML = `
      <div class="method-note">This worklist is derived automatically from pathway, PROM, and complication data — no extra documentation is required to populate it. Work the overdue items first. Owners are role defaults; reassign in the production version.</div>
      <div class="pill-tabs">
        <button data-cat="all" class="${activeCat === "all" ? "active" : ""}">All (${items.length})</button>
        ${cats.map(c => `<button data-cat="${U.esc(c)}" class="${activeCat === c ? "active" : ""}">${U.esc(c)} (${counts[c]})</button>`).join("")}
      </div>
      <div class="card">
        <h3>${activeCat === "all" ? "All open items" : U.esc(activeCat)} <span class="muted" style="font-weight:400">· ${shown.length} items, ${overdue.length} overdue</span></h3>
        ${U.table([
          { key: "category", label: "Category" },
          { key: "patientLabel", label: "Patient / context" },
          { key: "provider", label: "Provider" },
          { key: "action", label: "Recommended next action" },
          { key: "owner", label: "Owner" },
          { key: "dueDate", label: "Due" },
          { key: "status", label: "Status", render: r => r.status === "Overdue" ? U.badge("Overdue", "bad") : U.badge("Open", "accent") }
        ], shown, { rowClick: r => window.SQIRegistry.openPatient(r.patientId, r.episodeId), note: "Click any row to open the patient timeline. Export below for huddle worksheets." })}
        <div class="btn-row">
          <button class="btn small" id="pw-export">Export worklist (CSV)</button>
          <button class="btn small ghost" id="pw-export-x">Export worklist (Excel)</button>
        </div>
      </div>`;

    root.querySelectorAll("[data-cat]").forEach(b => b.addEventListener("click", () => { activeCat = b.dataset.cat; render(root); }));
    const exportable = shown.map(({ category, patientId, episodeId, patientLabel, provider, action, owner, dueDate, status }) => ({ category, patientId, episodeId, patientLabel, provider, action, owner, dueDate, status }));
    const guard = fn => () => { if (!S.ROLES[S.role].canExport) { alert("Your demo role does not permit exports."); return; } fn(); S.audit(null, "Export", "Care-pathway worklist"); };
    document.getElementById("pw-export").onclick = guard(() => window.SQICsv.downloadCSV(exportable, "care_pathway_worklist.csv"));
    document.getElementById("pw-export-x").onclick = guard(() => window.SQICsv.downloadExcel({ Worklist: exportable }, "care_pathway_worklist.xlsx"));
    U.bindTooltips(root);
  }

  window.SQIPages = window.SQIPages || {};
  window.SQIPages.pathway = { title: "Care-Pathway Tracker", render };
})();
