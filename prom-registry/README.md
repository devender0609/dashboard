# PROM Registry & Outcome Monitor

A focused patient-reported-outcomes registry: update PROMs and monitor them, keyed by **de-identified study IDs** (no names, MRN, or DOB). This is the PROM-only companion to the full spine quality dashboard.

## Run it
Open `prom-registry/index.html` in a browser. First launch lands on the **Import & Update** page. Click **Load synthetic demo data** to explore immediately, or load your own files.

Data persists in your browser between sessions (localStorage). Use **Download JSON backup** on the Import page to safeguard or move it.

## The two files you feed it
1. **Enrollment file** — one row per subject: `subjectId` + `anchorDate` required (enrollment or surgery date; the outcome clock counts from here). Optional: `cohort`, `diagnosis`, `provider`.
2. **Scores file** — `subjectId`, `instrument`, `timepoint`, `collectedDate`, `score` required; optional `source`.

You don't reformat your export. On upload, columns are **auto-mapped** and you can correct any mapping. Instrument names (e.g. "Oswestry" → ODI, "PROMIS PF" → PROMIS-PF) and timepoints (e.g. REDCap's `3_months_arm_1` → 3m) are normalized automatically. Works with **REDCap, PROMIS/Assessment Center, and portal CSV/Excel exports**. Blank templates are downloadable on the Import page.

**Updating** = re-import the scores file whenever you have new surveys. Existing timepoints are overwritten, new ones added; nothing duplicates.

## What it monitors
- **Outcome Monitoring** — longitudinal trajectory per instrument with the denominator at every timepoint, mean/median change, MCID achievement, and follow-up completion.
- **Monitoring Worklist** — auto-generated: who is **overdue** for an assessment and who is **deteriorating** (a follow-up worse than baseline by ≥ the instrument's MCID magnitude), each with owner, due date, and recommended action.
- **Subjects** — searchable registry; click any subject for its full assessment timeline and due schedule.
- **Data Quality** — duplicates, orphan scores, out-of-range values, missing baselines/anchors, overdue, out-of-window, and every import rejection.
- **MCID / PASS Thresholds** — administrator-controlled, versioned; editing resets approval. Nothing is hard-coded.

## Important caveats
- MCID/PASS values are literature-derived **placeholders pending clinical approval**; MCID output is labeled demonstration until each threshold is approved.
- Keep it to **de-identified** data. If this is research, the source of truth should be REDCap under IRB; this tool monitors an extract.
- Browser storage is convenient but not a system of record — for a shared, audited registry, put a database + API behind the same import logic (see the phased plan in the main dashboard's spec).

## Automating updates later
Point it at your PROM source directly: a scheduled REDCap API export (or PROMIS/portal export) → the same import + validation → a fresh overdue/deterioration worklist each morning. That needs the small persistence backend rather than browser storage.
