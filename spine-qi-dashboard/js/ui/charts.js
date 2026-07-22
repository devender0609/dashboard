/* charts.js — thin wrappers around Chart.js with the app's palette, plus a
   graceful fallback table when the CDN is unavailable (offline use). */
(function () {
  const C = {};
  const PALETTE = ["#155e9e", "#1c7a43", "#9a6700", "#7b4fa6", "#b3261e", "#0d7f8c"];
  const registry = {};

  const hasChart = () => typeof Chart !== "undefined";

  C.destroyAll = () => { Object.values(registry).forEach(ch => ch.destroy()); Object.keys(registry).forEach(k => delete registry[k]); };

  function baseOptions(extra) {
    return Object.assign({
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { labels: { boxWidth: 12, font: { size: 11 } } },
        tooltip: { bodyFont: { size: 12 } }
      },
      scales: {
        x: { ticks: { font: { size: 11 } }, grid: { display: false } },
        y: { ticks: { font: { size: 11 } }, grid: { color: "#eceff3" } }
      }
    }, extra || {});
  }

  function fallback(canvasId, labels, datasets) {
    const el = document.getElementById(canvasId);
    if (!el) return;
    const rows = labels.map((l, i) => `<tr><td>${l}</td>${datasets.map(d => `<td class="num">${d.data[i] ?? "—"}</td>`).join("")}</tr>`).join("");
    el.parentElement.innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th></th>${datasets.map(d => `<th class="num">${d.label}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table><div class="tbl-note">Chart library unavailable offline — values shown as a table.</div></div>`;
  }

  /* datasets: [{label, data, ci?:[lo,hi][], dashed?, color?}] */
  C.line = (canvasId, labels, datasets, opts = {}) => {
    if (!hasChart()) return fallback(canvasId, labels, datasets);
    const ctx = document.getElementById(canvasId); if (!ctx) return;
    if (registry[canvasId]) registry[canvasId].destroy();
    const ds = datasets.map((d, i) => ({
      label: d.label, data: d.data,
      borderColor: d.color || PALETTE[i % PALETTE.length],
      backgroundColor: (d.color || PALETTE[i % PALETTE.length]) + "22",
      borderWidth: 2, pointRadius: 3, tension: 0.25, spanGaps: true,
      borderDash: d.dashed ? [6, 4] : []
    }));
    registry[canvasId] = new Chart(ctx, { type: "line", data: { labels, datasets: ds }, options: baseOptions(opts) });
  };

  C.bar = (canvasId, labels, datasets, opts = {}) => {
    if (!hasChart()) return fallback(canvasId, labels, datasets);
    const ctx = document.getElementById(canvasId); if (!ctx) return;
    if (registry[canvasId]) registry[canvasId].destroy();
    const ds = datasets.map((d, i) => ({
      label: d.label, data: d.data,
      backgroundColor: (d.color || PALETTE[i % PALETTE.length]) + "cc",
      borderRadius: 4, maxBarThickness: 42
    }));
    registry[canvasId] = new Chart(ctx, { type: "bar", data: { labels, datasets: ds }, options: baseOptions(opts) });
  };

  /* Control chart: observed proportion + centerline + UCL/LCL step lines. */
  C.controlChart = (canvasId, pchart, labels) => {
    if (!pchart) return;
    const pts = pchart.points;
    C.line(canvasId, labels, [
      { label: "Observed %", data: pts.map(p => p.p === null ? null : Math.round(p.p * 1000) / 10), color: "#155e9e" },
      { label: "Centerline", data: pts.map(() => Math.round(pchart.pBar * 1000) / 10), color: "#71808f", dashed: true },
      { label: "UCL (3σ)", data: pts.map(p => Math.round(p.ucl * 1000) / 10), color: "#b3261e", dashed: true },
      { label: "LCL (3σ)", data: pts.map(p => Math.round(p.lcl * 1000) / 10), color: "#b3261e", dashed: true }
    ]);
  };

  window.SQICharts = C;
})();
