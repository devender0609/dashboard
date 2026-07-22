/* import.js — the update workflow. Upload an enrollment file and a scores file
   (CSV or Excel), map columns (auto-detected, correctable), validate, and load.
   Re-importing a scores file updates existing timepoints. Works with REDCap,
   PROMIS/Assessment Center, and portal exports. Includes JSON backup/restore
   and a synthetic demo loader. */
(function () {
  const U = window.PROMUi;
  let staged = { enrollment: null, scores: null }; // {records, headers, mapping}

  function render(root) {
    const S = window.PROMStore;
    root.innerHTML = `
      <div class="method-note">Two files feed this registry: an <b>enrollment</b> file (one row per subject: study ID + anchor/enrollment date, optional cohort/provider) and a <b>scores</b> file (subject ID, instrument, timepoint, date, score). Columns are auto-mapped and you can correct them. Re-import the scores file any time to update — existing timepoints are overwritten, new ones added. No patient identifiers are required or stored.</div>

      <div class="grid two">
        ${uploadCard("enrollment", "1 · Enrollment / subject file", "Study ID and anchor date required. Cohort, diagnosis, provider optional.")}
        ${uploadCard("scores", "2 · PROM scores file", "Subject ID, instrument, timepoint, date, and score required. Instrument and timepoint labels are normalized automatically.")}
      </div>

      <div id="map-area"></div>

      <div class="card" style="margin-top:14px"><h3>Data management</h3>
        <div class="btn-row">
          <button class="btn" id="im-demo">Load synthetic demo data</button>
          <button class="btn ghost" id="im-backup">Download JSON backup</button>
          <button class="btn ghost" id="im-restore">Restore from JSON…</button>
          <input type="file" id="im-restore-file" accept=".json" hidden>
          <button class="btn ghost" id="im-templates">Download blank templates</button>
          <button class="btn ghost" id="im-clear" style="color:#b3261e;border-color:#b3261e">Clear all data</button>
        </div>
        <div class="sub">Currently loaded: ${S.subjects.length} subjects, ${S.scores.length} scores. Data persists in this browser between sessions; use JSON backup to move it or safeguard it.</div>
      </div>`;

    ["enrollment", "scores"].forEach(kind => {
      root.querySelector(`#file-${kind}`).addEventListener("change", ev => onFile(kind, ev.target.files[0], root));
    });
    document.getElementById("im-demo").onclick = () => loadDemo(root);
    document.getElementById("im-backup").onclick = () => { window.SQICsv.downloadCSV; downloadText(S.exportJSON(), "prom_registry_backup.json"); };
    document.getElementById("im-restore").onclick = () => document.getElementById("im-restore-file").click();
    document.getElementById("im-restore-file").addEventListener("change", ev => { const f = ev.target.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = e => { try { S.importJSON(e.target.result); alert("Restored."); window.PROMApp.go("dataquality"); } catch (x) { alert("Invalid JSON backup."); } }; rd.readAsText(f); });
    document.getElementById("im-templates").onclick = downloadTemplates;
    document.getElementById("im-clear").onclick = () => { if (confirm("Delete all loaded subjects and scores from this browser? Export a backup first if unsure.")) { S.clearAll(); render(root); } };
    U.bindTooltips(root);
  }

  function uploadCard(kind, title, hint) {
    return `<div class="card"><h3>${title}</h3><div class="sub">${hint}</div>
      <input type="file" id="file-${kind}" accept=".csv,.xlsx,.xls">
      <div id="status-${kind}" class="sub" style="margin-top:8px"></div></div>`;
  }

  function onFile(kind, file, root) {
    if (!file) return;
    window.SQICsv.readFile(file, parsed => {
      if (!parsed.records.length) { document.getElementById("status-" + kind).textContent = "No rows found in file."; return; }
      const prop = window.PROMImporter.proposeMapping(kind, parsed.header);
      staged[kind] = { records: parsed.records, headers: parsed.header, mapping: prop.map, fields: prop.fields, required: prop.required, file: file.name };
      document.getElementById("status-" + kind).innerHTML = `Loaded <b>${parsed.records.length}</b> rows from ${U.esc(file.name)}. Review the column mapping below.`;
      renderMapping(root);
    });
  }

  function renderMapping(root) {
    const area = document.getElementById("map-area");
    let html = "";
    ["enrollment", "scores"].forEach(kind => {
      const st = staged[kind]; if (!st) return;
      html += `<div class="card" style="margin-top:14px"><h3>Column mapping — ${kind} file <span class="muted" style="font-weight:400">(${U.esc(st.file)})</span></h3>
        <div class="sub">We matched your headers to the registry fields. Correct any that are wrong, then apply. Required fields are marked *.</div>
        <div class="form-grid">
          ${st.fields.map(f => `<div><label>${f}${st.required.includes(f) ? " *" : ""}</label>
            <select data-map="${kind}" data-field="${f}">
              <option value="">— not present —</option>
              ${st.headers.map(h => `<option value="${U.esc(h)}" ${st.mapping[f] === h ? "selected" : ""}>${U.esc(h)}</option>`).join("")}
            </select></div>`).join("")}
        </div>
        <div class="btn-row"><button class="btn" data-apply="${kind}">Validate &amp; load ${kind}</button></div>
        <div id="result-${kind}"></div></div>`;
    });
    area.innerHTML = html;
    area.querySelectorAll("[data-map]").forEach(sel => sel.addEventListener("change", () => { staged[sel.dataset.map].mapping[sel.dataset.field] = sel.value; }));
    area.querySelectorAll("[data-apply]").forEach(b => b.addEventListener("click", () => applyImport(b.dataset.apply, root)));
    U.bindTooltips(area);
  }

  function applyImport(kind, root) {
    const st = staged[kind];
    const missing = st.required.filter(f => !st.mapping[f]);
    if (missing.length) { alert("Map the required field(s) first: " + missing.join(", ")); return; }
    const res = kind === "enrollment"
      ? window.PROMImporter.applyEnrollment(st.records, st.mapping)
      : window.PROMImporter.applyScores(st.records, st.mapping);
    const box = document.getElementById("result-" + kind);
    box.innerHTML = `<div class="flag-note" style="background:${res.rejected ? "#fdf3dd" : "#e6f4ec"};border-color:${res.rejected ? "#ecd9a8" : "#bfe3cd"}">
      Loaded <b>${res.accepted}</b> rows${res.rejected ? `, rejected <b>${res.rejected}</b>` : ""}.
      ${res.rejected ? "First rejects: " + U.esc(res.errors.slice(0, 5).map(e => e.row + " " + e.message).join("; ")) + ". See Data Quality for all." : "All rows valid."}</div>`;
    // refresh nav counts
    if (window.PROMApp) window.PROMApp.refreshNav();
  }

  function loadDemo(root) {
    const S = window.PROMStore, d = window.PROMDemo.generate();
    S.subjects = d.subjects; S.scores = d.scores; S.asOf = window.PROMDemo.AS_OF;
    S.index(); S.save(); S.audit("Demo data loaded", d.subjects.length + " subjects, " + d.scores.length + " scores");
    alert(`Loaded synthetic demo: ${d.subjects.length} subjects, ${d.scores.length} scores. Explore the Outcome Monitoring and Worklist pages.`);
    if (window.PROMApp) { window.PROMApp.refreshNav(); window.PROMApp.go("outcomes"); }
  }

  function downloadText(text, name) {
    const blob = new Blob([text], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 300);
  }

  function downloadTemplates() {
    window.SQICsv.downloadCSV([{ subjectId: "S-0001", cohort: "Lumbar", anchorDate: "2025-01-15", diagnosis: "Lumbar stenosis", provider: "Dr. A. Rivera" }], "template_enrollment.csv");
    setTimeout(() => window.SQICsv.downloadCSV([
      { subjectId: "S-0001", instrument: "ODI", timepoint: "baseline", collectedDate: "2025-01-15", score: "48", source: "Portal" },
      { subjectId: "S-0001", instrument: "ODI", timepoint: "3m", collectedDate: "2025-04-16", score: "28", source: "Portal" }
    ], "template_scores.csv"), 350);
  }

  window.PROMPages = window.PROMPages || {};
  window.PROMPages.import = { title: "Import & Update", render };
})();
