/* app.js — router and shell for the PROM registry. */
(function () {
  const S = window.PROMStore;
  const PAGES = [
    { id: "outcomes", label: "Outcome Monitoring", section: "Monitor" },
    { id: "worklist", label: "Monitoring Worklist", section: "Monitor" },
    { id: "subjects", label: "Subjects", section: "Monitor" },
    { id: "entry", label: "Data Entry", section: "Data" },
    { id: "import", label: "Import & Update", section: "Data" },
    { id: "dataquality", label: "Data Quality", section: "Governance" },
    { id: "thresholds", label: "MCID / PASS Thresholds", section: "Governance" }
  ];
  let current = "outcomes";

  function refreshNav() {
    const nav = document.getElementById("nav");
    const overdue = S.worklist().filter(i => i.category === "Overdue assessment").length;
    const det = S.worklist().filter(i => i.category === "Outcome deterioration").length;
    let html = "", last = "";
    PAGES.forEach(p => {
      if (p.section !== last) { html += `<div class="nav-section">${p.section}</div>`; last = p.section; }
      let badge = "";
      if (p.id === "worklist" && (overdue + det)) badge = `<span class="nav-badge">${overdue + det}</span>`;
      html += `<button class="nav-item ${p.id === current ? "active" : ""}" data-page="${p.id}">${p.label}${badge}</button>`;
    });
    nav.innerHTML = html;
    nav.querySelectorAll("[data-page]").forEach(b => b.addEventListener("click", () => go(b.dataset.page)));
  }

  function go(id) { current = id; renderAll(); }

  function renderAll() {
    if (window.PROMCharts) window.PROMCharts.destroyAll();
    refreshNav();
    const page = window.PROMPages[current];
    document.getElementById("page-title").textContent = page.title;
    document.getElementById("page-context").textContent = `${S.subjects.length} subjects · ${S.scores.length} scores · data as of ${S.asOf}`;
    document.getElementById("refresh-note").textContent = `Stored in this browser · as of ${S.asOf}`;
    const root = document.getElementById("page-root");
    page.render(root);
    root.focus({ preventScroll: true });
  }

  document.addEventListener("DOMContentLoaded", () => {
    const had = S.load();
    // keep as-of at max(today, latest score date) so overdue math is sensible for demo data
    const today = new Date().toISOString().slice(0, 10);
    const latest = S.scores.map(s => s.collectedDate).sort().slice(-1)[0];
    S.asOf = latest && latest > today ? latest : today;
    if (!had && !S.scores.length) current = "import"; // first run → send to import
    document.getElementById("print-btn").onclick = () => window.print();
    renderAll();
  });

  window.PROMApp = { go, refreshNav };
})();
