/* dataquality.js — trust page for the PROM feed. */
(function () {
  const U = window.PROMUi;

  function render(root) {
    const S = window.PROMStore;
    const order = { Error: 0, Warning: 1, Info: 2 };
    const issues = S.dataQuality().sort((a, b) => order[a.severity] - order[b.severity]);
    const sev = s => issues.filter(i => i.severity === s).length;
    const byCat = {}; issues.forEach(i => byCat[i.category] = (byCat[i.category] || 0) + 1);

    root.innerHTML = `
      <div class="grid kpi">
        ${U.kpi({ name: "Errors", value: sev("Error"), status: sev("Error") ? "bad" : "good", denomText: "block outcome computation", tip: "Duplicates, orphan scores, out-of-range values, import rejections. Excluded until fixed." })}
        ${U.kpi({ name: "Warnings", value: sev("Warning"), status: sev("Warning") ? "warn" : "good", denomText: "reduce completeness", tip: "Missing anchor dates, missing baselines, overdue assessments." })}
        ${U.kpi({ name: "Informational", value: sev("Info"), denomText: "context flags", tip: "Out-of-window collections — kept but excluded from timepoint means." })}
        ${U.kpi({ name: "Subjects / scores", value: S.subjects.length + " / " + S.scores.length, denomText: "loaded · as of " + S.asOf, tip: "Total enrolled subjects and PROM scores currently loaded." })}
      </div>
      <div class="card" style="margin-top:14px"><h3>Issues by category</h3>${U.table([{ key: "cat", label: "Category" }, { key: "n", label: "Count", num: true }], Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([cat, n]) => ({ cat, n })))}</div>
      <div class="card" style="margin-top:14px"><h3>Issue detail <span class="muted" style="font-weight:400">· ${issues.length}${issues.length > 300 ? " (first 300 shown)" : ""}</span></h3>
        ${U.table([{ key: "severity", label: "Severity", render: r => U.badge(r.severity, r.severity === "Error" ? "bad" : r.severity === "Warning" ? "warn" : "neutral") }, { key: "category", label: "Category" }, { key: "id", label: "Subject/File" }, { key: "detail", label: "Detail" }], issues.slice(0, 300), {})}
        <div class="btn-row"><button class="btn small" id="dq-exp">Export issues (CSV)</button></div></div>
      <div class="card" style="margin-top:14px"><h3>Import &amp; audit log</h3>${U.table([{ key: "ts", label: "Timestamp" }, { key: "action", label: "Action" }, { key: "detail", label: "Detail" }], S.auditLog.slice(0, 30))}</div>`;
    document.getElementById("dq-exp").onclick = () => { window.SQICsv.downloadCSV(issues, "prom_data_quality.csv"); S.audit("Export", "Data quality"); };
    U.bindTooltips(root);
  }

  window.PROMPages = window.PROMPages || {};
  window.PROMPages.dataquality = { title: "Data Quality", render };
})();
