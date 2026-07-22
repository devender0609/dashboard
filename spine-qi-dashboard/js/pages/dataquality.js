/* dataquality.js — Data Quality: the trust page. Every downstream number is
   only as good as what appears here. */
(function () {
  const U = window.SQIComponents, St = window.SQIStats;

  function render(root) {
    const S = window.SQIStore;
    const sevOrder = { Error: 0, Warning: 1, Info: 2 };
    const issues = S.dataQualityIssues().sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);
    const bySev = s => issues.filter(i => i.severity === s).length;
    const byCat = {};
    issues.forEach(i => { byCat[i.category] = (byCat[i.category] || 0) + 1; });
    const meta = S.adapter.meta();

    root.innerHTML = `
      <div class="grid kpi">
        ${U.kpiCard({ name: "Errors", value: bySev("Error"), status: bySev("Error") ? "bad" : "good", denomText: "block reporting until reconciled", tip: "Errors: invalid dates, duplicates, failed import rows. Records with errors are excluded from measures until fixed." })}
        ${U.kpiCard({ name: "Warnings", value: bySev("Warning"), status: bySev("Warning") ? "warn" : "good", denomText: "reduce completeness", tip: "Warnings: missing fields, missing baselines, overdue PROMs, unadjudicated complications." })}
        ${U.kpiCard({ name: "Informational", value: bySev("Info"), denomText: "context flags", tip: "Info: out-of-window collections and similar context that affects interpretation but does not block reporting." })}
        ${U.kpiCard({ name: "Data source", value: "", denomText: meta.adapter + " · refreshed " + meta.asOf, tip: "Provenance of the currently loaded dataset. Production shows each feed and its last successful refresh." })}
      </div>

      <div class="card" style="margin-top:14px">
        <h3>Issues by category</h3>
        ${U.table([{ key: "cat", label: "Category" }, { key: "n", label: "Count", num: true }],
          Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([cat, n]) => ({ cat, n })))}
      </div>

      <div class="card" style="margin-top:14px">
        <h3>Issue detail <span class="muted" style="font-weight:400">· ${issues.length} open issues${issues.length > 250 ? " (first 250 shown — export for the full list)" : ""}</span></h3>
        ${U.table([
          { key: "severity", label: "Severity", render: r => U.badge(r.severity, r.severity === "Error" ? "bad" : r.severity === "Warning" ? "warn" : "neutral") },
          { key: "category", label: "Category" }, { key: "entity", label: "Entity" },
          { key: "id", label: "Record" }, { key: "detail", label: "Detail" }
        ], issues.slice(0, 250), { note: "Errors are listed first in production with routing to the owning role, a resolution workflow, and an audit trail." })}
        <div class="btn-row"><button class="btn small" id="dq-export">Export issue list (CSV)</button></div>
      </div>

      <div class="card" style="margin-top:14px">
        <h3>Import history &amp; audit log ${U.infoIcon("All imports and exports are logged with user role, timestamp, and outcome. Production keeps an immutable audit table.")}</h3>
        ${U.table([{ key: "ts", label: "Timestamp" }, { key: "user", label: "User/role" }, { key: "action", label: "Action" }, { key: "detail", label: "Detail" }],
          S.auditLog.slice(0, 30))}
      </div>`;

    document.getElementById("dq-export").onclick = () => {
      if (!S.ROLES[S.role].canExport) { alert("Your demo role does not permit exports."); return; }
      window.SQICsv.downloadCSV(issues, "data_quality_issues.csv");
      S.audit(null, "Export", "Data-quality issues");
    };
    U.bindTooltips(root);
  }

  window.SQIPages = window.SQIPages || {};
  window.SQIPages.dataquality = { title: "Data Quality", render };
})();
