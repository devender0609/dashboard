# Spine Quality & Outcomes System — deliverable package

All data in this package is **synthetic demonstration data** (deterministic seed 20260701). No real patient information is present anywhere.

## How to run the prototype
Open `spine-qi-dashboard/index.html` in any modern browser (double-click it). No installation, server, or build step is required. Charts and Excel export load from a CDN when online; offline, charts fall back to data tables and CSV export still works.

Things to try:
1. Switch the demo role in the sidebar (Read-only executive sees only the Executive page; Measure Builder requires Quality administrator).
2. Click any red KPI tile — it opens the list of responsible episodes; click an episode for the full patient timeline.
3. Care-Pathway Tracker → filter by category, export the worklist.
4. Registry → Import CSV (use `demo-data/prom_scores.csv` or a deliberately broken copy — rejected rows appear on the Data Quality page).
5. Measure Builder → thresholds tab → edit an MCID; note the version date change and pending-approval reset.

## Package contents
- `spine-qi-dashboard/` — working responsive prototype, organized modules (data layer, stats, measure engine, UI components, one file per page) + `schema.sql` (production PostgreSQL schema with PHI separation).
- `demo-data/` — synthetic CSVs for all eight tables; the same files serve as import templates.
- `docs/01_Product_Specification_and_Implementation_Plan.docx` — spec, architecture and stack rationale, MVP, page map, workflows, security/governance plan, phased plan, decisions requiring clinical approval, measures not to implement until validated, assumptions.
- `docs/02_Data_Dictionary_and_Validation_Rules.docx` — every table and field, allowed values, and the four-tier validation rules.
- `docs/03_Measure_Definitions_and_Calculation_Logic.docx` — M1–M6 full definitions, PROM calculation logic, statistical methods, shipped placeholder MCID/PASS table.
- `docs/wireframes.html` — printable low-fidelity wireframes for every page.

## Important caveats built into the product
- MCID/PASS thresholds are placeholders pending clinical validation; the app labels all MCID output accordingly.
- RAG colors appear only where target + warning thresholds are defined and n ≥ 10.
- Surgeon views are alphabetical with case mix and confidence intervals — never ranked.
- Operations tiles requiring scheduling/auth/OR/EHR feeds are deliberately blank, not estimated.
