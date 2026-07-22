/* entry.js — manual data entry. Add a subject, add/edit a single assessment,
   without importing a file. Structured selects keep instrument and timepoint
   valid; scores are range-checked against the instrument scale. */
(function () {
  const U = window.PROMUi;
  const { INSTRUMENTS, TIMEPOINTS } = window.PROMConfig;

  function instrumentOptions(sel) { return Object.keys(INSTRUMENTS).map(k => `<option value="${k}" ${k === sel ? "selected" : ""}>${INSTRUMENTS[k].name}</option>`).join(""); }
  function timepointOptions(sel) { return TIMEPOINTS.map(t => `<option value="${t.code}" ${t.code === sel ? "selected" : ""}>${t.label}</option>`).join(""); }

  function render(root) {
    const S = window.PROMStore;
    const today = new Date().toISOString().slice(0, 10);
    const subjOptions = S.subjects.map(s => `<option value="${U.esc(s.subjectId)}">${U.esc(s.subjectId)} · ${U.esc(s.cohort || "")}</option>`).join("");

    root.innerHTML = `
      <div class="method-note">Add or correct data by hand — no file needed. Use this for phone-survey results or one-off enrollments. Everything you enter is validated the same way imports are, and appears immediately across the dashboard.</div>
      <div class="grid two">
        <div class="card"><h3>Add / edit subject ${U.infoIcon("Study ID and anchor date are required. Re-using an existing Study ID edits that subject.")}</h3>
          <div class="form-grid">
            <div><label>Study / subject ID *</label><input id="su-id" placeholder="S-0123" list="subj-list"><datalist id="subj-list">${subjOptions}</datalist></div>
            <div><label>Cohort</label><input id="su-cohort" placeholder="Lumbar / Cervical / Deformity"></div>
            <div><label>Anchor date * ${U.infoIcon("Enrollment or surgery date — the outcome clock starts here.")}</label><input id="su-anchor" type="date" value="${today}"></div>
            <div><label>Diagnosis</label><input id="su-dx"></div>
            <div><label>Provider</label><input id="su-prov"></div>
          </div>
          <div class="btn-row"><button class="btn" id="su-save">Save subject</button></div>
          <div id="su-msg"></div>
        </div>

        <div class="card"><h3>Add / edit assessment ${U.infoIcon("One PROM score. Re-using the same subject + instrument + timepoint overwrites that value.")}</h3>
          <div class="form-grid">
            <div><label>Subject *</label><input id="sc-id" placeholder="S-0123" list="subj-list2"><datalist id="subj-list2">${subjOptions}</datalist></div>
            <div><label>Instrument *</label><select id="sc-instr">${instrumentOptions("ODI")}</select></div>
            <div><label>Timepoint *</label><select id="sc-tp">${timepointOptions("baseline")}</select></div>
            <div><label>Collected date *</label><input id="sc-date" type="date" value="${today}"></div>
            <div><label>Score * <span id="sc-range" class="muted"></span></label><input id="sc-score" type="number" step="0.1"></div>
            <div><label>Source</label><select id="sc-src"><option>Clinic tablet</option><option>Portal</option><option>Phone outreach</option><option>Paper</option><option>REDCap</option></select></div>
          </div>
          <div class="btn-row"><button class="btn" id="sc-save">Save assessment</button></div>
          <div id="sc-msg"></div>
        </div>
      </div>`;

    // subject save
    document.getElementById("su-save").onclick = () => {
      const id = val("su-id").trim(); const anchor = val("su-anchor");
      if (!id) return msg("su-msg", "Study ID is required.", false);
      if (!anchor) return msg("su-msg", "Anchor date is required.", false);
      S.upsertSubject({ subjectId: id, cohort: val("su-cohort").trim(), anchorDate: anchor, diagnosis: val("su-dx").trim(), provider: val("su-prov").trim() });
      msg("su-msg", `Subject ${id} saved.`, true);
      if (window.PROMApp) window.PROMApp.refreshNav();
      render(root);
    };

    // instrument range hint
    const updateRange = () => { const inst = INSTRUMENTS[val("sc-instr")]; document.getElementById("sc-range").textContent = inst ? `(${inst.min}–${inst.max})` : ""; };
    document.getElementById("sc-instr").addEventListener("change", updateRange); updateRange();

    document.getElementById("sc-save").onclick = () => {
      const id = val("sc-id").trim(), instrument = val("sc-instr"), timepoint = val("sc-tp"), date = val("sc-date"), score = parseFloat(val("sc-score"));
      if (!id) return msg("sc-msg", "Subject ID is required.", false);
      if (!S.subjectById[id]) return msg("sc-msg", `Subject ${id} is not enrolled — add the subject first (left).`, false);
      if (!date) return msg("sc-msg", "Collected date is required.", false);
      if (isNaN(score)) return msg("sc-msg", "Score must be a number.", false);
      const inst = INSTRUMENTS[instrument];
      if (score < inst.min || score > inst.max) return msg("sc-msg", `Score ${score} is outside the ${instrument} range (${inst.min}–${inst.max}).`, false);
      S.upsertScore({ subjectId: id, instrument, timepoint, collectedDate: date, score, source: val("sc-src") });
      msg("sc-msg", `${instrument} ${timepoint} = ${score} saved for ${id}.`, true);
      if (window.PROMApp) window.PROMApp.refreshNav();
    };

    U.bindTooltips(root);
    function val(id) { return document.getElementById(id).value; }
    function msg(id, text, ok) { document.getElementById(id).innerHTML = `<div class="flag-note" style="background:${ok ? "#e6f4ec" : "#fbecea"};border-color:${ok ? "#bfe3cd" : "#f0c9c5"};color:${ok ? "#1c7a43" : "#b3261e"}">${U.esc(text)}</div>`; }
  }

  window.PROMPages = window.PROMPages || {};
  window.PROMPages.entry = { title: "Data Entry", render };
})();
