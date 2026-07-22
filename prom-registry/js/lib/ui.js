/* ui.js — shared UI helpers: cards, tables, badges, tooltips, modal, charts. */
(function () {
  const U = {};
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  U.esc = esc;

  U.infoIcon = def => `<button class="info-i" data-tip="${esc(def)}" aria-label="Definition">i</button>`;
  U.bindTooltips = root => (root || document).querySelectorAll("[data-tip]").forEach(el => {
    el.addEventListener("mouseenter", () => {
      const t = document.getElementById("tooltip-layer"); t.textContent = el.dataset.tip; t.hidden = false;
      const r = el.getBoundingClientRect();
      t.style.left = Math.min(window.innerWidth - 350, r.left) + "px";
      t.style.top = (r.bottom + 6) + "px";
    });
    el.addEventListener("mouseleave", () => { document.getElementById("tooltip-layer").hidden = true; });
  });

  U.kpi = o => `<div class="card kpi-card ${o.onClick ? "clickable" : ""}" ${o.onClick ? `data-drill="${esc(o.onClick)}" role="button" tabindex="0"` : ""}>
    <span class="kpi-status ${o.status || "none"}"></span>
    <div class="kpi-name">${esc(o.name)} ${o.tip ? U.infoIcon(o.tip) : ""}</div>
    <div class="kpi-value">${o.value ?? "—"}</div>
    ${o.denomText ? `<div class="kpi-denom">${esc(o.denomText)}</div>` : ""}</div>`;

  U.badge = (t, k) => `<span class="badge ${k || "neutral"}">${esc(t)}</span>`;

  U.table = (cols, rows, opts = {}) => {
    const head = cols.map(c => `<th class="${c.num ? "num" : ""}">${esc(c.label)}</th>`).join("");
    const body = rows.map((r, i) => `<tr class="${opts.rowClick ? "row-click" : ""}" data-row="${i}">${cols.map(c => `<td class="${c.num ? "num" : ""}">${c.render ? c.render(r) : esc(r[c.key])}</td>`).join("")}</tr>`).join("");
    const id = "t" + Math.random().toString(36).slice(2, 8);
    setTimeout(() => { if (!opts.rowClick) return; const el = document.getElementById(id); if (!el) return; el.querySelectorAll("tr[data-row]").forEach(tr => tr.addEventListener("click", () => opts.rowClick(rows[+tr.dataset.row]))); }, 0);
    return `<div class="tbl-wrap"><table class="tbl" id="${id}"><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${cols.length}" class="empty-state">No rows.</td></tr>`}</tbody></table></div>${opts.note ? `<div class="tbl-note">${opts.note}</div>` : ""}`;
  };

  U.openModal = html => {
    const l = document.getElementById("modal-layer");
    l.innerHTML = `<div class="modal"><div class="modal-head"><div style="flex:1">${html.title || ""}</div><button class="modal-close" id="mc">Close ✕</button></div>${html.body}</div>`;
    l.hidden = false; document.getElementById("mc").onclick = U.closeModal;
    l.onclick = e => { if (e.target === l) U.closeModal(); }; U.bindTooltips(l);
  };
  U.closeModal = () => { const l = document.getElementById("modal-layer"); l.hidden = true; l.innerHTML = ""; };

  U.ciText = ci => ci ? `95% CI ${ci[0]}–${ci[1]}%` : "";

  window.PROMUi = U;
})();
