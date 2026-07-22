/* app.js — router, global filters, role-based navigation, refresh stamp. */
(function () {
  const S = window.SQIStore, U = window.SQIComponents;

  const PAGES = [
    { id: "executive", label: "Executive Overview", section: "Dashboards" },
    { id: "outcomes", label: "Patient Outcomes", section: "Dashboards" },
    { id: "surgical", label: "Surgical Quality", section: "Dashboards" },
    { id: "nonsurgical", label: "Nonsurgical Quality", section: "Dashboards" },
    { id: "pathway", label: "Care-Pathway Tracker", section: "Work" },
    { id: "operations", label: "Operations", section: "Work" },
    { id: "registry", label: "Patient Registry", section: "Work" },
    { id: "dataquality", label: "Data Quality", section: "Governance" },
    { id: "admin", label: "Measure Builder", section: "Governance" }
  ];
  let current = "executive";

  function allowedPages() {
    const r = S.ROLES[S.role];
    return PAGES.filter(p => r.pages === "all" || r.pages.includes(p.id) || (p.id === "admin" && r.admin));
  }

  function renderNav() {
    const nav = document.getElementById("nav");
    const allowed = allowedPages();
    if (!allowed.find(p => p.id === current)) current = allowed[0].id;
    const wl = S.worklist().filter(i => i.status === "Overdue").length;
    let html = "", lastSection = "";
    allowed.forEach(p => {
      if (p.section !== lastSection) { html += `<div class="nav-section">${p.section}</div>`; lastSection = p.section; }
      const badge = p.id === "pathway" && wl ? `<span class="nav-badge">${wl}</span>` : "";
      html += `<button class="nav-item ${p.id === current ? "active" : ""}" data-page="${p.id}">${p.label}${badge}</button>`;
    });
    nav.innerHTML = html;
    nav.querySelectorAll("[data-page]").forEach(b => b.addEventListener("click", () => { current = b.dataset.page; renderAll(); }));
  }

  function renderFilters() {
    const gf = document.getElementById("global-filters");
    const provs = ["all", ...S.data.providers.map(p => p.name)];
    const sel = (id, opts, labels) => {
      const cur = S.filters[id];
      return `<div class="gf"><label>${labels}</label><select data-gf="${id}">${opts.map(o =>
        `<option value="${o}" ${o === cur ? "selected" : ""}>${o === "all" ? "All" : o}</option>`).join("")}</select></div>`;
    };
    gf.innerHTML =
      sel("period", ["all", "3m", "6m", "12m", "24m"], "Period") +
      sel("provider", provs, "Provider") +
      sel("region", ["all", ...S.data.regions], "Spine region") +
      sel("location", ["all", ...S.data.locations], "Location") +
      sel("treatment", ["all", "surgical", "nonsurgical"], "Treatment") +
      `<button class="btn small ghost" id="print-btn" title="Printable quality report of the current page">Print report</button>`;
    gf.querySelectorAll("[data-gf]").forEach(el => el.addEventListener("change", () => {
      S.filters[el.dataset.gf] = el.value;
      S.invalidateCaches();
      S.audit(null, "Filter change", el.dataset.gf + " → " + el.value);
      renderAll();
    }));
    document.getElementById("print-btn").onclick = () => window.print();
  }

  function renderRole() {
    const rs = document.getElementById("role-select");
    rs.innerHTML = Object.keys(S.ROLES).map(r => `<option ${r === S.role ? "selected" : ""}>${r}</option>`).join("");
    rs.onchange = () => { S.role = rs.value; S.audit(rs.value, "Role switched (demo)", ""); renderAll(); };
  }

  function periodLabel() {
    const map = { all: "All available data", "3m": "Trailing 3 months", "6m": "Trailing 6 months", "12m": "Trailing 12 months", "24m": "Trailing 24 months" };
    return map[S.filters.period];
  }

  function renderAll() {
    window.SQICharts.destroyAll();
    renderNav(); renderRole();
    const page = window.SQIPages[current];
    document.getElementById("page-title").textContent = page.title;
    const meta = S.adapter.meta();
    document.getElementById("page-context").textContent =
      `${periodLabel()} · Data as of ${meta.asOf} · ${meta.adapter}`;
    document.getElementById("refresh-note").textContent =
      `Last refresh: ${meta.asOf} · Synthetic demonstration data`;
    const root = document.getElementById("page-root");
    page.render(root);
    root.focus({ preventScroll: true });
  }

  document.addEventListener("DOMContentLoaded", () => {
    S.init();
    window.SQIMeasures.seedDefinitions(S);
    renderFilters();
    renderAll();
  });
})();
