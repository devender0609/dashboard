/* seed.js — deterministic synthetic demonstration data generator.
   ALL DATA PRODUCED HERE IS SYNTHETIC. No real patient information exists in
   this file or in anything it generates. The generator is seeded so every run
   produces identical data, which lets the clinic validate calculations by hand. */
(function () {
  // ---- seeded RNG (mulberry32) -------------------------------------------
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const R = rng(20260701);
  const pick = arr => arr[Math.floor(R() * arr.length)];
  const chance = p => R() < p;
  const between = (lo, hi) => lo + R() * (hi - lo);
  const intBetween = (lo, hi) => Math.floor(between(lo, hi + 1));
  const norm = (mean, sd) => {
    const u = Math.max(R(), 1e-9), v = Math.max(R(), 1e-9);
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  // ---- reference values ---------------------------------------------------
  const AS_OF = "2026-07-01"; // demonstration data refresh date
  const asOf = new Date(AS_OF + "T00:00:00");
  const DAY = 86400000;
  const iso = d => new Date(d).toISOString().slice(0, 10);
  const addDays = (dateStr, n) => iso(new Date(dateStr + "T00:00:00").getTime() + n * DAY);
  const daysBetween = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / DAY);

  const PROVIDERS = [
    { id: "PR-01", name: "Dr. A. Rivera", role: "Spine surgeon" },
    { id: "PR-02", name: "Dr. B. Chen", role: "Spine surgeon" },
    { id: "PR-03", name: "Dr. C. Osei", role: "Spine surgeon" },
    { id: "PR-04", name: "Dr. D. Malhotra", role: "Physiatrist" },
    { id: "PR-05", name: "Dr. E. Novak", role: "Physiatrist" },
    { id: "PR-06", name: "K. Brooks, PA-C", role: "Advanced practice clinician" }
  ];
  const SURGEONS = PROVIDERS.slice(0, 3);
  const NONSURG = PROVIDERS.slice(3);
  const LOCATIONS = ["Main Campus", "North Clinic"];
  const REGIONS = ["Cervical", "Thoracic", "Lumbar", "Deformity"];
  const REGION_WEIGHTS = [0.28, 0.06, 0.56, 0.10];
  const DIAGNOSES = {
    Cervical: ["Cervical radiculopathy", "Cervical myelopathy", "Cervical stenosis", "Cervical disc herniation"],
    Thoracic: ["Thoracic disc herniation", "Thoracic compression fracture", "Thoracic stenosis"],
    Lumbar: ["Lumbar stenosis", "Lumbar disc herniation", "Lumbar spondylolisthesis", "Lumbar radiculopathy", "Degenerative disc disease"],
    Deformity: ["Adult degenerative scoliosis", "Adult idiopathic scoliosis", "Sagittal imbalance"]
  };
  const COMORBIDITIES = ["Diabetes", "Hypertension", "Depression", "Anxiety", "COPD", "Coronary artery disease", "Osteoporosis", "Chronic kidney disease", "Obesity"];
  const INSURANCE = ["Commercial", "Medicare", "Medicaid", "Workers' compensation", "Self-pay"];
  const INS_W = [0.42, 0.34, 0.12, 0.08, 0.04];
  const LANGUAGES = ["English", "English", "English", "English", "Spanish", "Punjabi", "Mandarin", "Vietnamese"];
  const REFERRALS = ["Primary care", "Urgent care", "Emergency department", "Self-referral", "Other specialist", "Physical therapist"];
  const TRAVEL = ["<10 miles", "10-25 miles", "25-50 miles", ">50 miles"];
  const PROC_TYPES = {
    Cervical: [["ACDF", 0.55], ["Cervical disc arthroplasty", 0.2], ["Posterior cervical laminectomy and fusion", 0.15], ["Cervical foraminotomy", 0.1]],
    Thoracic: [["Thoracic decompression", 0.6], ["Thoracic fusion", 0.4]],
    Lumbar: [["Lumbar microdiscectomy", 0.3], ["Lumbar laminectomy", 0.28], ["TLIF", 0.22], ["ALIF", 0.08], ["XLIF/LLIF", 0.07], ["Posterolateral fusion", 0.05]],
    Deformity: [["Long-segment posterior fusion", 0.7], ["Anterior-posterior reconstruction", 0.3]]
  };
  const weightedPick = pairs => {
    let r = R();
    for (const [v, w] of pairs) { if ((r -= w) <= 0) return v; }
    return pairs[pairs.length - 1][0];
  };
  const regionPick = () => {
    let r = R();
    for (let i = 0; i < REGIONS.length; i++) { if ((r -= REGION_WEIGHTS[i]) <= 0) return REGIONS[i]; }
    return "Lumbar";
  };

  // PROM instruments: direction -1 means lower = better.
  const INSTRUMENTS = {
    "PROMIS-PF": { name: "PROMIS Physical Function", dir: +1, base: [30, 6], gain: [6, 4] },
    "PROMIS-PI": { name: "PROMIS Pain Interference", dir: -1, base: [64, 5], gain: [7, 4] },
    "PROMIS-SR": { name: "PROMIS Ability to Participate in Social Roles", dir: +1, base: [42, 6], gain: [5, 4] },
    "PROMIS-FA": { name: "PROMIS Fatigue", dir: -1, base: [58, 6], gain: [4, 4] },
    "PROMIS-AX": { name: "PROMIS Anxiety", dir: -1, base: [57, 7], gain: [3, 4] },
    "PROMIS-DE": { name: "PROMIS Depression", dir: -1, base: [55, 7], gain: [3, 4] },
    "ODI": { name: "Oswestry Disability Index", dir: -1, base: [46, 12], gain: [16, 10] },
    "NDI": { name: "Neck Disability Index", dir: -1, base: [42, 11], gain: [14, 9] },
    "SRS-22r": { name: "SRS-22r total", dir: +1, base: [2.9, 0.5], gain: [0.6, 0.4] },
    "NRS-Pain": { name: "Numeric pain rating (0-10)", dir: -1, base: [6.8, 1.4], gain: [2.8, 1.8] }
  };
  const TIMEPOINTS = [
    { code: "baseline", label: "Baseline", days: 0, window: null },
    { code: "6w", label: "6 weeks", days: 42, window: 14 },
    { code: "3m", label: "3 months", days: 91, window: 21 },
    { code: "6m", label: "6 months", days: 182, window: 42 },
    { code: "12m", label: "12 months", days: 365, window: 56 },
    { code: "24m", label: "24 months", days: 730, window: 84 }
  ];

  /* Administrator-controlled threshold table. These are literature-derived
     DEFAULTS shipped for demonstration; each requires local clinical
     validation before use in reporting (see governance documents). */
  const PROM_THRESHOLDS = [
    { instrument: "ODI", population: "Lumbar surgery", mcid: 12.8, pass: 22, direction: "decrease", source: "Placeholder default — pending local validation (lit. range 10-15)", versionDate: "2026-06-01", status: "Pending clinical approval" },
    { instrument: "NDI", population: "Cervical surgery", mcid: 7.5, pass: 17, direction: "decrease", source: "Placeholder default — pending local validation (lit. range 5.5-10)", versionDate: "2026-06-01", status: "Pending clinical approval" },
    { instrument: "PROMIS-PF", population: "Spine (all)", mcid: 4.5, pass: null, direction: "increase", source: "Placeholder default — pending local validation (lit. range 3.5-5.5)", versionDate: "2026-06-01", status: "Pending clinical approval" },
    { instrument: "PROMIS-PI", population: "Spine (all)", mcid: 4.0, pass: null, direction: "decrease", source: "Placeholder default — pending local validation (lit. range 3.5-5.5)", versionDate: "2026-06-01", status: "Pending clinical approval" },
    { instrument: "PROMIS-SR", population: "Spine (all)", mcid: 4.0, pass: null, direction: "increase", source: "Placeholder default — pending local validation", versionDate: "2026-06-01", status: "Pending clinical approval" },
    { instrument: "PROMIS-FA", population: "Spine (all)", mcid: 4.0, pass: null, direction: "decrease", source: "Placeholder default — pending local validation", versionDate: "2026-06-01", status: "Pending clinical approval" },
    { instrument: "PROMIS-AX", population: "Spine (all)", mcid: 4.0, pass: null, direction: "decrease", source: "Placeholder default — pending local validation", versionDate: "2026-06-01", status: "Pending clinical approval" },
    { instrument: "PROMIS-DE", population: "Spine (all)", mcid: 4.0, pass: null, direction: "decrease", source: "Placeholder default — pending local validation", versionDate: "2026-06-01", status: "Pending clinical approval" },
    { instrument: "SRS-22r", population: "Adult deformity", mcid: 0.4, pass: null, direction: "increase", source: "Placeholder default — pending local validation", versionDate: "2026-06-01", status: "Pending clinical approval" },
    { instrument: "NRS-Pain", population: "Spine (all)", mcid: 2.0, pass: 3, direction: "decrease", source: "Placeholder default — pending local validation (lit. range 1.5-2.5)", versionDate: "2026-06-01", status: "Pending clinical approval" }
  ];

  // ---- generate patients ---------------------------------------------------
  function generate() {
    const patients = [], episodes = [], pathways = [], procedures = [],
      complications = [], proms = [], experience = [];
    let epN = 0, procN = 0, compN = 0, promN = 0, expN = 0;

    const N_PATIENTS = 160;
    for (let i = 1; i <= N_PATIENTS; i++) {
      const age = Math.min(92, Math.max(19, Math.round(norm(58, 14))));
      const dobYear = 2026 - age;
      const nComorb = Math.min(4, Math.max(0, Math.round(norm(1.2, 1.1))));
      const comorb = [];
      while (comorb.length < nComorb) { const c = pick(COMORBIDITIES); if (!comorb.includes(c)) comorb.push(c); }
      let insR = R(), insurance = INSURANCE[0];
      for (let k = 0; k < INSURANCE.length; k++) { if ((insR -= INS_W[k]) <= 0) { insurance = INSURANCE[k]; break; } }
      patients.push({
        patientId: "PT-" + String(i).padStart(4, "0"),
        mrn: "MRN-DEMO-" + String(100000 + i),
        dob: `${dobYear}-${String(intBetween(1, 12)).padStart(2, "0")}-${String(intBetween(1, 28)).padStart(2, "0")}`,
        age,
        sex: chance(0.52) ? "Female" : "Male",
        bmi: Math.round(Math.min(52, Math.max(17, norm(29.5, 5.5))) * 10) / 10,
        smoking: weightedPick([["Never", 0.55], ["Former", 0.3], ["Current", 0.15]]),
        comorbidities: comorb.join("; "),
        insurance,
        language: pick(LANGUAGES),
        travelDistance: pick(TRAVEL),
        clinicLocation: chance(0.65) ? LOCATIONS[0] : LOCATIONS[1]
      });
    }

    // ---- episodes ----------------------------------------------------------
    patients.forEach(pt => {
      const nEp = chance(0.82) ? 1 : 2;
      for (let e = 0; e < nEp; e++) {
        epN++;
        const region = regionPick();
        const diagnosis = pick(DIAGNOSES[region]);
        // referral between 2024-01 and 2026-05
        const refDate = iso(new Date(2023, 6, 1).getTime() + R() * (new Date(2026, 4, 20) - new Date(2023, 6, 1)));
        const waitDays = Math.max(1, Math.round(norm(13, 8)));
        const firstAppt = addDays(refDate, waitDays);
        const surgicalCandidate = chance(region === "Deformity" ? 0.75 : 0.52);
        const provider = surgicalCandidate ? pick(SURGEONS) : pick(NONSURG.concat([pick(SURGEONS)]));
        const planDate = chance(0.93) ? addDays(firstAppt, intBetween(0, 14)) : null;
        const epId = "EP-" + String(epN).padStart(4, "0");
        const daysSince = daysBetween(firstAppt, AS_OF);
        const lost = chance(0.07);
        const closed = !lost && daysSince > 400 && chance(0.7);
        episodes.push({
          episodeId: epId,
          patientId: pt.patientId,
          spineRegion: region,
          primaryDiagnosis: diagnosis,
          episodeType: surgicalCandidate ? "Surgical evaluation" : "Nonsurgical",
          treatingProvider: provider.name,
          providerId: provider.id,
          referralSource: pick(REFERRALS),
          referralDate: refDate,
          firstApptDate: daysBetween(refDate, AS_OF) < 0 ? null : firstAppt,
          treatmentPlanDate: planDate,
          status: lost ? "Lost to follow-up" : closed ? "Closed" : "Active",
          closureDate: closed ? addDays(firstAppt, intBetween(380, 700)) : null,
          clinicLocation: pt.clinicLocation
        });

        // ---- pathway --------------------------------------------------------
        const ptRec = chance(0.75);
        const ptInit = ptRec && chance(0.8);
        const ptComp = ptInit && chance(0.7);
        const injRec = chance(surgicalCandidate ? 0.35 : 0.55);
        const injDone = injRec && chance(0.78);
        const imgOrd = chance(0.85);
        const imgDone = imgOrd && chance(0.9);
        const surgRec = surgicalCandidate && chance(0.75);
        const surgSched = surgRec && chance(0.85);
        const surgDone = surgSched && chance(0.9) && daysBetween(firstAppt, AS_OF) > 60;
        const delayReasons = ["Prior authorization pending", "Patient deciding", "Medical optimization required", "Scheduling capacity", "Insurance denial under appeal", "Patient unreachable"];
        pathways.push({
          episodeId: epId,
          ptRecommended: ptRec ? "Yes" : "No",
          ptInitiated: ptInit ? "Yes" : ptRec ? "No" : "",
          ptCompleted: ptComp ? "Yes" : ptInit ? "No" : "",
          medicationTreatment: weightedPick([["NSAID", 0.35], ["NSAID + neuropathic agent", 0.25], ["Short-course opioid", 0.15], ["Neuropathic agent", 0.15], ["None", 0.1]]),
          opioidDays: chance(0.25) ? intBetween(5, 90) : 0,
          injectionRecommended: injRec ? "Yes" : "No",
          injectionCompleted: injDone ? "Yes" : injRec ? "No" : "",
          imagingOrdered: imgOrd ? "Yes" : "No",
          imagingCompleted: imgDone ? "Yes" : imgOrd ? "No" : "",
          imagingDays: imgDone ? Math.max(1, Math.round(norm(9, 6))) : null,
          surgeryRecommended: surgRec ? "Yes" : "No",
          surgeryScheduled: surgSched ? "Yes" : surgRec ? "No" : "",
          surgeryCompleted: surgDone ? "Yes" : surgSched ? "No" : "",
          delayReason: (surgRec && !surgDone) || (injRec && !injDone) || (ptRec && !ptInit) ? pick(delayReasons) : "",
          missedAppointments: chance(0.22) ? intBetween(1, 3) : 0,
          followUpStatus: lost ? "Lost to follow-up" : closed ? "Complete" : chance(0.8) ? "On schedule" : "Overdue",
          nextAction: "", nextActionOwner: "", nextActionDue: ""
        });

        // ---- procedure ------------------------------------------------------
        const procDateCandidate = surgDone ? addDays(firstAppt, intBetween(30, 150)) : null;
        const procHappened = surgDone && daysBetween(procDateCandidate, AS_OF) >= 0;
        if (surgDone && !procHappened) pathways[pathways.length - 1].surgeryCompleted = "No";
        if (procHappened) {
          procN++;
          const procDate = procDateCandidate;
          const type = weightedPick(PROC_TYPES[region]);
          const revision = chance(0.12);
          const levels = region === "Deformity" ? intBetween(5, 12) : weightedPick([[1, 0.55], [2, 0.3], [3, 0.12], [4, 0.03]]);
          const mis = region !== "Deformity" && chance(0.4);
          const orMin = Math.max(45, Math.round(norm(region === "Deformity" ? 360 : 120 + levels * 40, 45)));
          const ebl = Math.max(10, Math.round(norm(region === "Deformity" ? 900 : 80 + levels * 90, region === "Deformity" ? 350 : 90) / 10) * 10);
          const los = Math.max(0, Math.round(norm(region === "Deformity" ? 5.5 : mis ? 1.2 : 2.4, 1.4)));
          const surgeonObj = SURGEONS.find(s => s.name === provider.name) || pick(SURGEONS);
          procedures.push({
            procedureId: "PX-" + String(procN).padStart(4, "0"),
            episodeId: epId, patientId: pt.patientId,
            procedureDate: procDate, procedureType: type,
            primaryOrRevision: revision ? "Revision" : "Primary",
            spineRegion: region, levels,
            approach: type.includes("ALIF") || type.includes("arthroplasty") || type.includes("ACDF") ? "Anterior" : type.includes("XLIF") ? "Lateral" : type.includes("Anterior-posterior") ? "Combined" : "Posterior",
            misOrOpen: mis ? "MIS" : "Open",
            operativeMinutes: orMin, ebl,
            lengthOfStay: los,
            dischargeDestination: weightedPick([["Home", 0.78], ["Home with home health", 0.12], ["Skilled nursing facility", 0.07], ["Inpatient rehabilitation", 0.03]]),
            surgeon: surgeonObj.name, surgeonId: surgeonObj.id,
            facility: pt.clinicLocation === "Main Campus" ? "University Hospital" : "North Surgical Center"
          });

          // ---- complications -------------------------------------------------
          const compRisk = 0.16 + (region === "Deformity" ? 0.18 : 0) + (revision ? 0.10 : 0) + (pt.smoking === "Current" ? 0.05 : 0);
          if (chance(compRisk)) {
            compN++;
            const compTypes = [
              ["Surgical site infection", 0.2], ["Dural tear", 0.16], ["New neurologic deficit", 0.1],
              ["Venous thromboembolism", 0.1], ["Implant complication", 0.12], ["Nonunion / pseudarthrosis", 0.1],
              ["Medical complication", 0.14], ["Postoperative hematoma", 0.08]
            ];
            const ctype = weightedPick(compTypes);
            const lag = ctype === "Dural tear" ? 0 : ctype === "Nonunion / pseudarthrosis" ? intBetween(180, 400) : intBetween(1, 45);
            const cDate = addDays(procDate, lag);
            if (daysBetween(cDate, AS_OF) >= 0) {
              const timing = lag === 0 ? "Inpatient" : lag <= 30 ? "30-day" : lag <= 90 ? "90-day" : "Later";
              const readmit = ["Surgical site infection", "Venous thromboembolism", "Medical complication", "Postoperative hematoma"].includes(ctype) && chance(0.6);
              const reop = ["Surgical site infection", "Implant complication", "Nonunion / pseudarthrosis", "Postoperative hematoma"].includes(ctype) && chance(0.55);
              complications.push({
                complicationId: "CX-" + String(compN).padStart(4, "0"),
                procedureId: procedures[procedures.length - 1].procedureId,
                episodeId: epId, patientId: pt.patientId,
                complicationType: ctype, date: cDate, timing,
                severity: weightedPick([["Minor (no intervention)", 0.35], ["Moderate (medical intervention)", 0.4], ["Major (invasive intervention)", 0.2], ["Life-threatening", 0.05]]),
                relatedToProcedure: weightedPick([["Yes", 0.7], ["Uncertain", 0.2], ["No", 0.1]]),
                preventability: weightedPick([["Not preventable", 0.45], ["Possibly preventable", 0.35], ["Preventable", 0.1], ["Not yet classified", 0.1]]),
                edVisit: readmit || chance(0.25) ? "Yes" : "No",
                readmission: readmit ? "Yes" : "No",
                reoperation: reop ? "Yes" : "No",
                mortality: chance(0.015) ? "Yes" : "No",
                reviewStatus: chance(0.75) ? "Adjudicated" : "Pending review"
              });
            }
          }
        }

        // ---- PROMs ----------------------------------------------------------
        const isLumbar = region === "Lumbar" || region === "Thoracic";
        const set = ["PROMIS-PF", "PROMIS-PI", "NRS-Pain", isLumbar ? "ODI" : region === "Cervical" ? "NDI" : "ODI"];
        if (region === "Deformity") set.push("SRS-22r");
        if (chance(0.4)) set.push("PROMIS-SR");
        if (chance(0.25)) set.push(pick(["PROMIS-FA", "PROMIS-AX", "PROMIS-DE"]));
        const proc = procedures.find(p => p.episodeId === epId);
        const anchor = proc ? proc.procedureDate : firstAppt; // PROM clock anchors to surgery when present
        const hasBaseline = chance(0.88);
        const responderShift = norm(0, 0.8); // patient-level outcome propensity
        set.forEach(instr => {
          const cfg = INSTRUMENTS[instr];
          const baseVal = norm(cfg.base[0], cfg.base[1]);
          TIMEPOINTS.forEach(tp => {
            if (tp.code === "baseline" && !hasBaseline) return;
            const due = addDays(anchor, tp.days);
            if (daysBetween(due, AS_OF) < -tp.window) return; // not yet due
            const completionP = tp.code === "baseline" ? 1 : [0.78, 0.72, 0.66, 0.58, 0.45][TIMEPOINTS.indexOf(tp) - 1];
            if (tp.code !== "baseline" && !chance(completionP)) return; // missing follow-up
            const frac = Math.min(1, tp.days / 365);
            const gain = (norm(cfg.gain[0], cfg.gain[1]) + responderShift * cfg.gain[1] * 0.6) * (proc ? 1 : 0.55) * Math.sqrt(frac || 0);
            let val = tp.code === "baseline" ? baseVal : baseVal + cfg.dir * Math.max(-cfg.gain[0] * 0.5, gain);
            if (instr === "NRS-Pain") val = Math.min(10, Math.max(0, val));
            if (instr === "ODI" || instr === "NDI") val = Math.min(100, Math.max(0, val));
            if (instr === "SRS-22r") val = Math.min(5, Math.max(1, val));
            const offset = tp.code === "baseline" ? intBetween(-30, 0) : Math.round(norm(0, tp.window * 0.6));
            promN++;
            proms.push({
              promId: "PR-" + String(promN).padStart(5, "0"),
              episodeId: epId, patientId: pt.patientId,
              instrument: instr, timepoint: tp.code,
              dueDate: due,
              collectedDate: addDays(due, offset),
              score: Math.round(val * 10) / 10,
              source: pick(["Portal", "Portal", "Clinic tablet", "Phone outreach"])
            });
          });
        });

        // ---- experience -----------------------------------------------------
        if (chance(0.45)) {
          expN++;
          const sat = Math.min(5, Math.max(1, Math.round(norm(4.3, 0.8))));
          experience.push({
            surveyId: "EX-" + String(expN).padStart(4, "0"),
            episodeId: epId, patientId: pt.patientId,
            date: addDays(firstAppt, intBetween(7, 200)),
            overallSatisfaction: sat,
            communication: Math.min(5, Math.max(1, sat + intBetween(-1, 1))),
            planUnderstanding: Math.min(5, Math.max(1, sat + intBetween(-1, 1))),
            schedulingEase: Math.min(5, Math.max(1, Math.round(norm(3.9, 0.9)))),
            waitTime: Math.min(5, Math.max(1, Math.round(norm(3.6, 1.0)))),
            responsiveness: Math.min(5, Math.max(1, Math.round(norm(4.0, 0.9)))),
            recommendLikelihood: Math.min(10, Math.max(0, Math.round(norm(8.4, 1.6)))),
            comment: sat <= 2 ? pick(["Waited too long for callback about authorization.", "Hard to reach the clinic by phone.", "Felt rushed during the visit."]) : "",
            complaintType: sat <= 2 ? pick(["Access/scheduling", "Communication", "Wait time"]) : "",
            resolutionStatus: sat <= 2 ? pick(["Open", "Resolved"]) : "",
            resolutionDays: sat <= 2 && chance(0.6) ? intBetween(2, 21) : null
          });
        }
      }
    });

    // curated events so early-readmission measures have demonstrable numerators
    const curated = procedures.filter(p => daysBetween(p.procedureDate, AS_OF) >= 60 &&
      !complications.some(c => c.procedureId === p.procedureId)).slice(0, 2);
    curated.forEach((p, i) => {
      compN++;
      complications.push({
        complicationId: "CX-" + String(compN).padStart(4, "0"),
        procedureId: p.procedureId, episodeId: p.episodeId, patientId: p.patientId,
        complicationType: i === 0 ? "Surgical site infection" : "Medical complication",
        date: addDays(p.procedureDate, i === 0 ? 18 : 9),
        timing: "30-day",
        severity: i === 0 ? "Major (invasive intervention)" : "Moderate (medical intervention)",
        relatedToProcedure: "Yes",
        preventability: i === 0 ? "Possibly preventable" : "Not preventable",
        edVisit: "Yes", readmission: "Yes",
        reoperation: i === 0 ? "Yes" : "No",
        mortality: "No", reviewStatus: "Adjudicated"
      });
    });

    // intentionally inject a few data-quality problems for the Data Quality page
    patients[3] = { ...patients[3], bmi: null };
    patients[17] = { ...patients[17], dob: "" };
    patients[41] = { ...patients[41], smoking: "" };
    // duplicate patient (same DOB/sex, different ID) — demo duplicate detection
    patients.push({ ...patients[10], patientId: "PT-9001", mrn: "MRN-DEMO-990011" });
    if (episodes[5]) episodes[5].firstApptDate = null;
    if (episodes[9]) { episodes[9].treatmentPlanDate = addDays(episodes[9].referralDate, -10); } // invalid: plan before referral

    return {
      meta: { asOf: AS_OF, generated: "Deterministic synthetic demonstration data (seed 20260701)", source: "Synthetic generator v1.0" },
      providers: PROVIDERS, locations: LOCATIONS, regions: REGIONS,
      instruments: INSTRUMENTS, timepoints: TIMEPOINTS,
      promThresholds: PROM_THRESHOLDS,
      patients, episodes, pathways, procedures, complications, proms, experience
    };
  }

  const api = { generate, helpers: { addDays, daysBetween, iso, AS_OF } };
  if (typeof window !== "undefined") window.SQISeed = api;
  if (typeof module !== "undefined") module.exports = api;
})();
