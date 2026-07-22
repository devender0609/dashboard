/* admin.js — Quality-measure builder and MCID/PASS threshold administration.
   Visible only to roles with admin rights. New measures start as governed
   drafts (documentation + version history); data mapping happens in build. */
(function () {
  const U = window.SQIComponents, St = window.SQIStats;
  let tab = "measures";

  function render(root) {
    const S = window.SQIStore, M = window.SQIMeasures;
    if (!S.ROLES[S.role].admin) {
      root.innerHTML = `<div class="card"><div class="empty-state">The measure builder is restricted to the Quality administrator role.<br>Switch the demo role in the sidebar to explore it.</div></div>`;
      return;
    }

    root.innerHTML = `
      <div class="pill-tabs">
        <button data-t="measures" class="${tab === "measures" ? "active" : ""}">Measure definitions</button>
        <button data-t="new" class="${tab === "new" ? "active" : ""}">New measure</button>
        <button data-t="thresholds" class="${tab === "thresholds" ? "active" : ""}">MCID / PASS thresholds</button>
      </div>
      <div id="admin-body"></div>`;
    const body = root.querySelector("#admin-body");

    if (tab === "measures") {
      const evals = M.evaluateAll(S);
      body.innerHTML = `<div class="card">
        <h3>Governed measure definitions ${U.infoIcon("Every change creates a new version entry. Measures marked 'Display only' or 'Draft' are excluded from external reporting.")}</h3>
        ${U.table([
          { key: "id", label: "ID" }, { key: "name", label: "Measure" },
          { key: "num", label: "Numerator" }, { key: "den", label: "Denominator" },
          { key: "target", label: "Target", num: true }, { key: "warning", label: "Warning", num: true },
          { key: "current", label: "Current", num: true },
          { key: "owner", label: "Owner" }, { key: "review", label: "Review" },
          { key: "status", label: "Status", render: r => /Active/.test(r.status) ? U.badge("Active", "good") : U.badge(r.status, "warn") },
          { key: "versions", label: "Versions", num: true }
        ], evals.map(ev => ({
          id: ev.def.id, name: ev.def.name, num: ev.def.numeratorDesc, den: ev.def.denominatorDesc,
          target: ev.def.target !== null ? ev.def.target + "%" : "—", warning: ev.def.warning !== null ? ev.def.warning + "%" : "—",
          current: ev.rate !== null ? ev.rate + "% (" + ev.numerator + "/" + ev.denominator + ")" + (ev.smallSample ? " ⚠" : "") : "—",
          owner: ev.def.owner, review: ev.def.reviewFrequency, status: ev.def.status, versions: ev.def.versions.length,
          _def: ev.def
        })), { rowClick: r => showVersions(r._def), note: "Click a row for version history, purpose, inclusion/exclusion criteria, and risk-adjustment method." })}
      </div>`;
    }

    if (tab === "new") {
      body.innerHTML = `<div class="card">
        <h3>Define a new quality measure</h3>
        <div class="sub">New measures are created as governed drafts. They require data mapping by the analyst and clinical approval before activation — this prevents unvalidated numbers from appearing on dashboards.</div>
        <div class="form-grid">
          <div><label>Measure name</label><input id="nm-name" placeholder="e.g., Time to PT initiation ≤ 21 days"></div>
          <div><label>Clinical purpose</label><input id="nm-purpose"></div>
          <div><label>Numerator</label><input id="nm-num"></div>
          <div><label>Denominator</label><input id="nm-den"></div>
          <div><label>Inclusion criteria</label><input id="nm-inc"></div>
          <div><label>Exclusion criteria</label><input id="nm-exc"></div>
          <div><label>Target (%)</label><input id="nm-target" type="number" min="0" max="100"></div>
          <div><label>Warning threshold (%)</label><input id="nm-warn" type="number" min="0" max="100"></div>
          <div><label>Measurement period</label><select id="nm-period"><option>Rolling 3 months</option><option>Rolling 6 months</option><option selected>Rolling 12 months</option><option>Rolling 24 months</option><option>Calendar year</option></select></div>
          <div><label>Data source</label><input id="nm-src" placeholder="e.g., Pathway table"></div>
          <div><label>Measure owner</label><input id="nm-owner"></div>
          <div><label>Review frequency</label><select id="nm-review"><option>Monthly</option><option>Quarterly</option><option>Annually</option></select></div>
          <div><label>Risk-adjustment method</label><input id="nm-risk" placeholder="None / stratification / model (describe)"></div>
        </div>
        <div class="btn-row"><button class="btn" id="nm-save">Create draft measure</button></div>
      </div>`;
      body.querySelector("#nm-save").onclick = () => {
        const g = id => body.querySelector("#" + id).value.trim();
        if (!g("nm-name") || !g("nm-num") || !g("nm-den")) { alert("Name, numerator, and denominator are required."); return; }
        M.addDefinition({
          id: "M" + (M.definitions.length + 1), name: g("nm-name"), purpose: g("nm-purpose"),
          numeratorDesc: g("nm-num"), denominatorDesc: g("nm-den"),
          inclusion: g("nm-inc"), exclusion: g("nm-exc"),
          target: g("nm-target") ? +g("nm-target") : null, warning: g("nm-warn") ? +g("nm-warn") : null,
          direction: "higher", unit: "%", period: g("nm-period") || body.querySelector("#nm-period").value,
          dataSource: g("nm-src"), owner: g("nm-owner") || S.role,
          reviewFrequency: body.querySelector("#nm-review").value, riskAdjustment: g("nm-risk") || "None specified"
        });
        S.audit(null, "Measure created", g("nm-name"));
        alert("Draft measure created. It appears in the definitions list with status Draft.");
        tab = "measures"; render(root);
      };
    }

    if (tab === "thresholds") {
      body.innerHTML = `<div class="card">
        <h3>MCID / PASS threshold table ${U.infoIcon("Thresholds drive MCID, PASS, and deterioration calculations everywhere in the application. They are versioned; editing creates a new version date. Nothing is hard-coded.")}</h3>
        <div class="flag-note">All shipped values are literature-derived placeholders and are marked pending clinical approval. The application labels MCID outputs as demonstration until each row is approved by the clinical committee.</div>
        ${U.table([
          { key: "instrument", label: "Instrument" }, { key: "population", label: "Population" },
          { key: "mcid", label: "MCID", num: true }, { key: "pass", label: "PASS", num: true },
          { key: "direction", label: "Improvement direction" }, { key: "source", label: "Source" },
          { key: "versionDate", label: "Version date" },
          { key: "status", label: "Status", render: r => r.status === "Approved" ? U.badge("Approved", "good") : U.badge("Pending approval", "warn") },
          { key: "_edit", label: "", render: r => `<button class="btn small ghost" data-edit="${r.instrument}">Edit</button>` }
        ], S.data.promThresholds, { note: "PASS = patient acceptable symptom state. Blank PASS means no validated threshold is available for that instrument — the application then omits PASS calculations rather than guessing." })}
      </div>`;
      body.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", e => {
        e.stopPropagation();
        const row = S.data.promThresholds.find(t => t.instrument === b.dataset.edit);
        const v = prompt(`New MCID for ${row.instrument} (${row.population}). Current: ${row.mcid}`, row.mcid);
        if (v === null || isNaN(parseFloat(v))) return;
        row.mcid = parseFloat(v);
        row.versionDate = new Date().toISOString().slice(0, 10);
        row.status = "Pending clinical approval";
        row.source = "Edited in admin console — " + row.source;
        S.audit(null, "Threshold edited", row.instrument + " MCID → " + v);
        S.invalidateCaches(); render(root);
      }));
    }

    root.querySelectorAll("[data-t]").forEach(b => b.addEventListener("click", () => { tab = b.dataset.t; render(root); }));
    U.bindTooltips(root);

    function showVersions(def) {
      U.openModal({
        title: `<h2>${U.esc(def.id)} — ${U.esc(def.name)}</h2>`,
        body: `
          <p style="font-size:13.5px"><strong>Purpose:</strong> ${U.esc(def.purpose)}</p>
          <p style="font-size:13.5px"><strong>Inclusion:</strong> ${U.esc(def.inclusion)} · <strong>Exclusion:</strong> ${U.esc(def.exclusion)}</p>
          <p style="font-size:13.5px"><strong>Period:</strong> ${U.esc(def.period)} · <strong>Source:</strong> ${U.esc(def.dataSource)} · <strong>Risk adjustment:</strong> ${U.esc(def.riskAdjustment)}</p>
          <h3 style="font-size:14px">Version history</h3>
          ${U.table([{ key: "v", label: "Version" }, { key: "date", label: "Date" }, { key: "note", label: "Change note" }], def.versions)}`
      });
    }
  }

  window.SQIPages = window.SQIPages || {};
  window.SQIPages.admin = { title: "Measure Builder & Thresholds", render };
})();
