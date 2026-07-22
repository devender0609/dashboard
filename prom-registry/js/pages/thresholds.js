/* thresholds.js — administrator-controlled MCID/PASS table. Versioned; editing
   resets approval. Nothing is hard-coded elsewhere. */
(function () {
  const U = window.PROMUi;

  function render(root) {
    const S = window.PROMStore;
    root.innerHTML = `
      <div class="flag-note">All shipped MCID/PASS values are literature-derived placeholders pending clinical approval. The dashboard labels MCID output as demonstration until each row is approved here.</div>
      <div class="card"><h3>MCID / PASS thresholds ${U.infoIcon("These drive MCID, PASS, and deterioration everywhere. PASS blank = no validated value, so PASS is not computed for that instrument.")}</h3>
        ${U.table([
          { key: "instrument", label: "Instrument" }, { key: "population", label: "Population" },
          { key: "mcid", label: "MCID", num: true }, { key: "pass", label: "PASS", num: true },
          { key: "direction", label: "Improvement" }, { key: "source", label: "Source" }, { key: "versionDate", label: "Version" },
          { key: "status", label: "Status", render: r => r.status === "Approved" ? U.badge("Approved", "good") : U.badge("Pending", "warn") },
          { key: "_e", label: "", render: r => `<button class="btn small ghost" data-edit="${r.instrument}|${r.population}">Edit MCID</button> <button class="btn small ghost" data-approve="${r.instrument}|${r.population}">${r.status === "Approved" ? "Un-approve" : "Approve"}</button>` }
        ], S.thresholds, { note: "PASS = patient acceptable symptom state. Editing an MCID stamps a new version date and resets approval." })}</div>`;

    root.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => {
      const [inst, pop] = b.dataset.edit.split("|");
      const row = S.thresholds.find(t => t.instrument === inst && t.population === pop);
      const v = prompt(`New MCID for ${inst} (${pop}). Current ${row.mcid}:`, row.mcid);
      if (v === null || isNaN(parseFloat(v))) return;
      row.mcid = parseFloat(v); row.versionDate = new Date().toISOString().slice(0, 10); row.status = "Pending clinical approval";
      row.source = "Edited in admin console — " + row.source;
      S.audit("Threshold edit", inst + " MCID → " + v); S._cache = null; S.save(); render(root);
    }));
    root.querySelectorAll("[data-approve]").forEach(b => b.addEventListener("click", () => {
      const [inst, pop] = b.dataset.approve.split("|");
      const row = S.thresholds.find(t => t.instrument === inst && t.population === pop);
      row.status = row.status === "Approved" ? "Pending clinical approval" : "Approved";
      S.audit("Threshold approval", inst + " → " + row.status); S._cache = null; S.save(); render(root);
    }));
    U.bindTooltips(root);
  }

  window.PROMPages = window.PROMPages || {};
  window.PROMPages.thresholds = { title: "MCID / PASS Thresholds", render };
})();
