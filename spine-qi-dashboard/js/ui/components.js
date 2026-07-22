/* components.js — shared UI building blocks: KPI cards, tables, badges,
   tooltips, modals, drill-down lists. Every metric display carries its
   denominator and a definition tooltip. */
(function () {
  const U = {};
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  U.esc = esc;

  // ---- tooltips -------------------------------------------------------------
  const tipLayer = () => document.getElementById("tooltip-layer");
  U.infoIcon = def => `<button class="info-i" data-tip="${esc(def)}" aria-label="Definition">i</button>`;
  U.bindTooltips = root => {
    (root || document).querySelectorAll("[data-tip]").forEach(el => {
      el.addEventListener("mouseenter", e => {
        const t = tipLayer(); t.textContent = el.dataset.tip; t.hidden = false;
        const r = el.getBoundingClientRect();
        t.style.left = Math.min(window.innerWidth - 350, r.left) + "px";
        t.style.top = (r.bottom + 6) + "px";
      });
      el.addEventListener("mouseleave", () => { tipLayer().hidden = true; });
      el.addEventListener("focus", () => el.dispatchEvent(new Event("mouseenter")));
      el.addEventListener("blur", () => { tipLayer().hidden = true; });
    });
  };

  // ---- KPI card ---------------------------------------------------------------
  /* opts: {name, value, denomText, trend, status, tip, onClick} */
  U.kpiCard = opts => {
    const statusDot = `<span class="kpi-status ${opts.status || "none"}" title="${opts.status && opts.status !== "none" ? "Status vs defined threshold" : "No threshold defined — no status shown"}"></span>`;
    return `<div class="card kpi-card ${opts.onClick ? "clickable" : ""}" ${opts.onClick ? `data-drill="${esc(opts.onClick)}" role="button" tabindex="0"` : ""}>
      ${statusDot}
      <div class="kpi-name">${esc(opts.name)} ${opts.tip ? U.infoIcon(opts.tip) : ""}</div>
      <div class="kpi-value">${opts.value ?? "—"}</div>
      ${opts.denomText ? `<div class="kpi-denom">${esc(opts.denomText)}</div>` : ""}
      ${opts.trend ? `<div class="kpi-trend">${opts.trend}</div>` : ""}
    </div>`;
  };

  // ---- badges -------------------------------------------------------------------
  U.badge = (text, kind) => `<span class="badge ${kind || "neutral"}">${esc(text)}</span>`;
  U.ragBadge = status => status === "good" ? U.badge("On target", "good")
    : status === "warn" ? U.badge("Warning", "warn")
    : status === "bad" ? U.badge("Off target", "bad")
    : U.badge("No threshold", "neutral");

  // ---- table ----------------------------------------------------------------------
  /* cols: [{key,label,num?,render?}], rows: objects, opts: {rowClick(row), note} */
  U.table = (cols, rows, opts = {}) => {
    const head = cols.map(c => `<th class="${c.num ? "num" : ""}">${esc(c.label)}</th>`).join("");
    const body = rows.map((r, i) => {
      const tds = cols.map(c => `<td class="${c.num ? "num" : ""}">${c.render ? c.render(r) : esc(r[c.key])}</td>`).join("");
      return `<tr class="${opts.rowClick ? "row-click" : ""}" data-row="${i}">${tds}</tr>`;
    }).join("");
    const id = "tbl-" + Math.random().toString(36).slice(2, 8);
    setTimeout(() => {
      if (!opts.rowClick) return;
      const el = document.getElementById(id); if (!el) return;
      el.querySelectorAll("tr[data-row]").forEach(tr =>
        tr.addEventListener("click", () => opts.rowClick(rows[+tr.dataset.row])));
    }, 0);
    return `<div class="tbl-wrap"><table class="tbl" id="${id}"><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${cols.length}" class="empty-state">No rows match the current filters.</td></tr>`}</tbody></table></div>
      ${opts.note ? `<div class="tbl-note">${opts.note}</div>` : ""}`;
  };

  // ---- modal -----------------------------------------------------------------------
  U.openModal = html => {
    const layer = document.getElementById("modal-layer");
    layer.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
      <div class="modal-head"><div style="flex:1">${html.title || ""}</div>
      <button class="modal-close" id="modal-close-btn">Close ✕</button></div>${html.body}</div>`;
    layer.hidden = false;
    document.getElementById("modal-close-btn").onclick = U.closeModal;
    layer.onclick = e => { if (e.target === layer) U.closeModal(); };
    U.bindTooltips(layer);
  };
  U.closeModal = () => { const l = document.getElementById("modal-layer"); l.hidden = true; l.innerHTML = ""; };

  // ---- drill-down patient list -------------------------------------------------------
  U.showEpisodeList = (title, episodeIds, subtitle) => {
    const S = window.SQIStore;
    const rows = [...new Set(episodeIds)].map(id => {
      const b = S.byEpisode[id];
      if (!b) return { episodeId: id, patientId: "?", diagnosis: "?", provider: "?", status: "?" };
      return {
        episodeId: id, patientId: b.episode.patientId,
        diagnosis: b.episode.primaryDiagnosis, region: b.episode.spineRegion,
        provider: b.episode.treatingProvider, status: b.episode.status
      };
    });
    U.openModal({
      title: `<h2>${esc(title)}</h2><div class="muted" style="font-size:12.5px">${esc(subtitle || "")} · ${rows.length} episode(s)</div>`,
      body: U.table([
        { key: "episodeId", label: "Episode" }, { key: "patientId", label: "Patient" },
        { key: "region", label: "Region" }, { key: "diagnosis", label: "Diagnosis" },
        { key: "provider", label: "Provider" }, { key: "status", label: "Status" }
      ], rows, { rowClick: r => { U.closeModal(); window.SQIRegistry.openPatient(r.patientId, r.episodeId); } })
        + `<div class="btn-row"><button class="btn small" onclick="SQIComponents.exportEpisodeList('${esc(title)}')">Export list (CSV)</button></div>`
    });
    U._lastList = rows;
  };
  U.exportEpisodeList = title => {
    if (!window.SQIStore.ROLES[window.SQIStore.role].canExport) { alert("Your demo role does not permit exports."); return; }
    window.SQICsv.downloadCSV(U._lastList || [], title.replace(/[^a-z0-9]+/gi, "_") + ".csv");
    window.SQIStore.audit(null, "Export", "Episode list: " + title);
  };

  // ---- small-sample warning -------------------------------------------------------
  U.nWarn = n => n < window.SQIStats.MIN_N
    ? ` <span class="small-n" title="Sample below minimum (n<${window.SQIStats.MIN_N}); comparison unreliable">⚠ n=${n}</span>` : "";

  // ---- CI formatting ------------------------------------------------------------------
  U.ciText = ci => ci ? `95% CI ${ci[0]}–${ci[1]}%` : "";

  window.SQIComponents = U;
})();
