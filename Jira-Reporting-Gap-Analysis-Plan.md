# Jira Reporting App - Duplication Map, Refactor Strategy, Orchestration Design, and EBM-Aligned Gap Plan

Date: 2026-01-28

Sources reviewed: README.md, context.md, server.js, lib/*.js, public/report.*, tests/*.spec.js.

This document is the complete gap-analysis + 11-feature improvement plan you can drop into the repo. It also includes the requested duplication/SoC mapping, a realistic refactor strategy that preserves SSOT, and guidance on test orchestration and extensions.

---

## 1. Current architecture and duplication/SoC assessment

Backend
- server.js: Express entrypoint, /report, /preview.json, /export, /export-excel, caching and retries. SIZE-EXEMPT.
- lib/
  - jiraClients.js: Jira client creation.
  - discovery.js: board + field discovery.
  - sprints.js: board sprint fetching + overlap filtering.
  - issues.js: sprint issues + drilldown rows.
  - metrics.js: throughput, done comparison, rework, predictability, Epic TTM (also has its own calculateWorkingDays).
  - csv.js, excel.js, columnMapping.js, kpiCalculations.js: export and KPI enrichment.
  - cache.js, Jira-Reporting-App-Server-Logging-Utility.js.

Frontend
- public/report.js: large UI controller handling preview lifecycle, tabs, filters, CSV client generation, loading overlay, etc. SIZE-EXEMPT.

Tests
- Playwright suites for API integration, user journeys, Excel export, UX reliability/critical fixes, KPI tests, validation tests.
- Orchestration runner Jira-Reporting-App-Test-Orchestration-Runner.js wired to npm run test:all.

Main duplication hotspots (SoC and SSOT risks)

1) Jira pagination logic (copy/paste)
- lib/discovery.js: boards pagination
- lib/sprints.js: sprints pagination
- lib/issues.js: sprint issues pagination
All three implement startAt/maxResults/isLast/total/values or issues logic with similar error handling. This is a parallel implementation risk.

2) Working-days / KPI math duplication
- lib/metrics.js defines calculateWorkingDays
- lib/kpiCalculations.js defines calculateWorkDays, calculateCycleTime, calculateLeadTime
This creates parallel responsibility for business-days calculations and drift risk between metrics and export KPIs.

3) Agile maturity scoring duplicated
- kpiCalculations.js: calculateMaturityLevel, calculateVelocityConsistency
- lib/excel.js: createSummarySheetData re-implements maturity scoring inline
This can create misaligned maturity outputs between metrics and exports.

4) CSV and column rules duplicated (client vs server)
- lib/csv.js defines CSV_COLUMNS and generateCSVClient + escapeCSVField
- public/report.js defines CSV_COLUMNS and its own generateCSVClient with slightly different escaping rules
This is a high-risk contract drift (columns and escaping should be SSOT).

5) Test helpers duplicated
- tests/Jira-Reporting-App-E2E-User-Journey-Tests.spec.js defines runDefaultPreview
- tests/Jira-Reporting-App-Excel-Export-Tests.spec.js defines its own runDefaultPreview and waitForPreview
Other suites re-implement preview flows. This is a test-level SSOT issue.

Large cohesive controllers
- server.js, metrics.js, public/report.js are SIZE-EXEMPT. They are cohesive by domain, but should remain SSOT for their domain to avoid duplication.

---

## 2. Refactor and consolidation strategy (realistic, SSOT-first)

2.1 Shared Jira pagination helper (backend)
Goal: One pagination implementation reused by boards, sprints, and issues.

Plan
- Create a shared helper in lib (single SSOT) to handle startAt, maxResults, isLast, total, and array extraction (values/issues).
- Update discovery.js, sprints.js, and issues.js to use this helper.

Result
- Single source of truth for pagination behavior and error handling.
- Reduced drift between Jira collection fetches.

2.2 Unify working-day and KPI math into kpiCalculations.js
Goal: One SSOT for business-day and KPI formulas.

Plan
- Remove calculateWorkingDays from metrics.js and use calculateWorkDays from kpiCalculations.js.
- Ensure Epic TTM uses the shared business-day calculation.

Result
- Metrics and exports are aligned on KPI formulas.

2.3 Make agile-maturity calculation SSOT
Goal: Avoid re-implementation in excel.js.

Plan
- Update lib/excel.js createSummarySheetData to call calculateVelocityConsistency and calculateMaturityLevel from kpiCalculations.js.
- Only compute the inputs (predictability, velocity array, rework ratio) in excel.js.

Result
- Single formula for maturity scoring across exports and tests.

2.4 CSV and column SSOT between lib/csv.js and public/report.js
Goal: Single source of truth for CSV columns and escaping.

Options
- Preferred: expose server CSV utilities to the frontend (module import or small shared bundle) and remove duplicate generateCSVClient.
- If bundling is not desired, add a contract test to assert public/report.js CSV_COLUMNS matches lib/csv.js CSV_COLUMNS.

Result
- Eliminate drift between server and client CSV outputs.

2.5 Consolidate UI CSV logic around server export
Goal: simplify and standardize CSV export behavior.

Plan
- Use POST /export for all CSV exports, or keep client-side CSV only for very small datasets.
- Ensure both paths use identical columns and escaping.

2.6 Shared test helpers for preview and export flows
Goal: tests should not re-implement the preview lifecycle.

Plan
- Introduce a shared helper module in tests/ that provides:
  - runDefaultPreview
  - waitForPreview
  - export assertions
- Update all test suites to import the helper.

Result
- Test logic becomes SSOT and easier to maintain.

---

## 3. Naming convention migration (examples)

Naming rule: [Scope1]-[Scope2]-[Module]-[FeatureOrFlow]-[Qualifier]-Responsibility
- Minimum 5 segments.
- 3 segments allowed for small utilities.
- Avoid repeating folder names.

Examples
- server.js -> JiraReporting-Backend-ReportingAPI-PreviewAndExport-CoreServerEntry.js
- lib/metrics.js -> JiraReporting-Domain-Metrics-ThroughputPredictability-Calculator-Core.js
- lib/issues.js -> JiraReporting-Data-JiraIssues-SprintDrilldown-EnrichmentCore.js
- lib/excel.js -> JiraReporting-Exports-ExcelWorkbook-SprintInsights-GeneratorCore.js
- public/report.js -> JiraReporting-Frontend-ReportPage-PreviewTabs-ControllerCore.js

Small utilities (3 segments)
- cache.js -> JiraReporting-Shared-TtlCache.js
- columnMapping.js -> JiraReporting-Shared-ColumnMapping.js

Duplication prevention process
- Search for existing similarly scoped files before introducing a new name.
- Avoid repeating folder scope (do not add Lib/Test in name because folder already implies it).
- Update context.md for SIZE-EXEMPT files if renamed.

---

## 4. Test orchestration design and extensions

Full orchestration (existing)
- npm run test:all runs Jira-Reporting-App-Test-Orchestration-Runner.js
- The runner is foreground, step-by-step, and stops on first error.
- It wires Playwright tests with --max-failures=1 and --workers=1 for fail-fast behavior.

Extending tests
- Add new suites to the orchestration runner in scripts/Jira-Reporting-App-Test-Orchestration-Runner.js
- Keep tests in tests/ and follow existing naming patterns.
- Prefer shared helpers for preview and export flows to avoid duplication.

Targeted runs
- npm run test:e2e
- npm run test:api
- npm run test:validation

Remote run
- Set BASE_URL to your deployed host and run npm run test:all to validate production or staging.

---

## 5. EBM-aligned gap analysis (current vs required)

Current strengths
- Time-to-Market: throughput, predictability (approx), Epic TTM.
- Ability to Innovate: rework ratio, some data-quality indicators.
- Operational robustness: partial previews, cache transparency, error handling.
- Reporting UX: tabbed views and Excel exports with KPIs.

Gaps
- Current Value (CV): no explicit customer-value proxies in UI or exports.
- Unrealized Value (UV): no highlight of strategic epics with low completion.
- Ability to Innovate (A2I): minimal defect trend, no incident or technical debt view.
- Time-to-Learn: no experiment-to-outcome metrics.

Leadership gap summary
- Leaders need a balanced view across CV, UV, A2I, T2M, not just delivery metrics.
- They need clear outcome alignment and actionable improvement signals.

---

## 6. Eleven feature improvements and validation strategy

Feature 1 - CV proxy metrics in Summary
- Intent: show current value signals.
- Data: custom fields/labels for customer impact, business value.
- Delivery: Summary section in Excel + optional UI banner.
- Validation: KPI tests + JQL cross-check.

Feature 2 - UV backlog opportunity view
- Intent: highlight high-potential epics with low completion.
- Data: epic strategic tags, age, completion ratio.
- Delivery: UV section or dedicated sheet.
- Validation: export tests + Jira dashboard comparison.

Feature 3 - Defect trend and incident indicators
- Intent: reflect A2I pressure from defects/incidents.
- Data: Bug and incident labels/types.
- Delivery: Summary counts and trends; Stories flags.
- Validation: API tests + RED-LINE KPI checks.

Feature 4 - Technical debt and aged bug metrics
- Intent: quantify tech debt load.
- Data: TechDebt labels, bug age.
- Delivery: Summary metrics and story columns.
- Validation: KPI tests for age calculations.

Feature 5 - Time-to-Learn for experiment epics
- Intent: measure experiment cycles.
- Data: experiment labels or fields.
- Delivery: Epics sheet columns for time-to-first-value and time-to-learn.
- Validation: Excel tests with synthetic epics.

Feature 6 - Outcome hypothesis columns
- Intent: link work to outcomes.
- Data: custom fields like OutcomeHypothesis, KeyOutcomeMeasure.
- Delivery: new columns in Epics/Stories; summary completeness counts.
- Validation: UX tests for missing fields and export columns.

Feature 7 - KVA coverage dashboard
- Intent: provide CV/UV/T2M/A2I balanced view.
- Data: existing + new metrics.
- Delivery: Summary sheet section and optional UI summary.
- Validation: export tests for KVA rows.

Feature 8 - Team/board KVA breakdowns
- Intent: identify team-level variance.
- Data: board/team mapping.
- Delivery: Sprints or Teams sheet with per-team metrics.
- Validation: RED-LINE KPI tests for rollups.

Feature 9 - EBM improvement suggestions
- Intent: actionable insights from metrics.
- Data: derived from existing metrics.
- Delivery: Summary section with suggestions.
- Validation: unit tests for suggestion rules.

Feature 10 - KVA flags and filters in UI
- Intent: allow filtering by experiment, incident, tech debt, customer impact.
- Data: labels/custom fields.
- Delivery: Done Stories flags and filters.
- Validation: E2E tests using filters.

Feature 11 - Validation and governance checklist
- Intent: auditability and SSOT clarity.
- Data: metadata only.
- Delivery: Metadata sheet entries for definitions and last review.
- Validation: Excel tests for Metadata rows.

---

## 7. Deletion safety process (DeleteThisFile_)

- Identify candidates with rg searching for filename usage.
- If no references exist outside the file, rename to DeleteThisFile_<OriginalName>.
- Log the reason in context.md.
- Remove only after full green test runs locally and on deployment.

---

## 8. Operational validation

Local
- npm install
- npm run start
- npm run test:all

Remote
- Set BASE_URL to the deployed host.
- Run npm run test:all and confirm fail-fast behavior.

---

## 9. Notes

- This plan is SSOT for duplication mapping and refactor strategy.
- README.md remains SSOT for usage and validation steps.
- Any renaming should be tracked in context.md for SIZE-EXEMPT files.

## Customer/Simplicity/Trust UX Implementation Notes (Applied)

### What we simplified
- Normalized delivery metrics now use short labels (e.g., **SP / Day**, **On-Time %**) and tooltips explain calculations.
- Date displays now render in local-friendly format with raw ISO preserved on hover.
- Boards view merges overlapping throughput metrics into a single decision-grade table to reduce duplication.

### Why this improves trust
- Rates and percentages now show **N/A** instead of misleading zero when sprint dates are missing.
- Tooltips document the exact calculation so leaders can audit the meaning quickly.

### Bonus edge cases considered
1. **Missing sprint dates**: show N/A for rate metrics instead of 0 to avoid false precision.
2. **Zero done stories**: avoid divide-by-zero and show N/A for SP/Story and On-Time %.
3. **Feedback submission failure**: UI shows a clear error without blocking report usage.

---

## 10. Customer / Simplicity / Trust — Detailed Plan (Execution To‑Dos)

This plan converts the KPI truth statement and the recent UX/perf fixes into a concrete execution checklist. It focuses on clear, decision‑grade reporting for leaders, and keeps behavior auditable and explainable.

Guiding values
- Customer: Every KPI answers a real leadership question and can be verified in the export.
- Simplicity: One place to find the answer; tooltips explain “what / why / how.”
- Trust: Metrics explicitly state assumptions, data quality, and gaps.

### 10.1 KPI truth‑mapping and auditability

Objective
- Guarantee that every red‑line KPI is backed by data already in the Stories/Sprints/Epics exports.

To‑dos
- Build a “KPI truth table” mapping each KPI to:
  - Source tab(s) in the report (Stories / Sprints / Epics / Summary).
  - Field dependencies (Issue Type, Story Points, Sprint dates, Resolution Date).
  - Constraints (e.g., “SP requires Story Points configured”).
- Add a UI “KPI Notes” section in Summary / Metadata export:
  - “This KPI is not available if …”
  - “This KPI uses fallback if …”
- Add a “Metric integrity” column in Metadata:
  - “SP present?” “Sprint dates present?” “Epic links present?”

Rationale
- Leaders can validate KPIs without hunting through Jira.
- Ensures the team isn’t making claims that aren’t supported.

Validation
- Playwright test: Summary/Metadata tabs include KPI notes and integrity rows.
- Export test: CSV/Excel contain the integrity section.

### 10.2 Throughput and predictability consistency

Objective
- Ensure that throughput, predictability, and averages all use the same logic and are consistent across UI/exports.

To‑dos
- Make a single “Predictability definition” block in UI tooltips:
  - Committed = in sprint at sprint start
  - Delivered = resolved within sprint window
  - Predictability = Delivered / Committed
- Add a checkbox or note if predictability is off, explaining why the columns are hidden.
- Make the Sprints tab show “N/A” instead of 0 if story points are unavailable.

Rationale
- Avoids a “numbers don’t match across tabs” trust gap.

Validation
- Playwright test: When SP is unavailable, SP columns show N/A, not 0.
- API test: Predictability per sprint matches aggregate in Summary.

### 10.3 Epic / PI TTM clarity (and fallback)

Objective
- Make Epic TTM trustworthy and explicit when Epic dates are missing.

To‑dos
- Add tooltip copy: “If Epic dates are missing, start/end uses first/last story date.”
- Add a “Fallback count” row in Summary (already present in meta), make visible.
- Include Epic TTM in exports with clear “Start Date Source” column.

Rationale
- Keeps leaders aware of the difference between Epic‑tracked and story‑derived TTM.

Validation
- Playwright test: Epic TTM table includes tooltip and fallback note.
- Export test: Epic TTM sheet has “Start Date Source.”

### 10.4 Team comparison by capacity proxy (assignees)

Objective
- Provide a fair way to compare teams when headcount data is not in Jira.

To‑dos
- Use “Active Assignees” and per‑assignee rates as default capacity proxy.
- Add “Assumed Capacity (Person‑Days)” and “Assumed Waste %” with explicit assumptions:
  - “18 days/month per person.”
  - “Does not account for PTO, part‑time, or non‑sprint work.”
- Include these in Boards export with the same labels.

Rationale
- Gives leaders a consistent cross‑team lens while clearly flagging assumptions.

Validation
- Playwright test: Boards table shows capacity proxy columns and tooltips.
- Export test: Boards CSV/Excel include these columns.

### 10.5 Data speed and cache trust

Objective
- Make response time explainable and ensure cache hits are fast and obvious.

To‑dos
- Surface cache‑served duration (Elapsed) vs original generation time (CachedElapsed).
- Add “Cache source” and “Cache age” in preview meta (already visible).
- Shrink metadata payload by removing large field inventories from preview response.

Rationale
- Users should see cache is working and not misinterpret old timings.

Validation
- API test: second `/preview.json` is `fromCache = true`.
- UI test: Details section shows “Original generation” when cached.

---

## 11. Build + Deploy Validation (No timeline, execution steps only)

Local build and validation
- `npm install`
- `npm start` and confirm `/report` loads
- `npm run test:all` (foreground, fail‑fast)

Remote validation
- Set `BASE_URL` to deployment host
- `npm run test:all` (ensures production parity)

Expected results
- No blocking errors; warnings around epic/TTM fallback and subtask time tracking are acceptable if Jira APIs are limited.

---

## 12. Test Plan Addendum (Playwright‑first)

Important note about ADB/logcat
- This is a web application; there is no Android APK or ADB flow in this repo.
- Therefore, **logcat and adb‑driven validation are not applicable**.
- We will use Playwright MCP / browser‑based tests instead, which is consistent with the existing test stack.

Required tests to add (in tests/):
1) Customer‑Simplicity‑Trust validation:
   - Ensure Boards table contains capacity proxy columns.
   - Ensure tooltips include assumptions.
2) Cache transparency:
   - First /preview.json cache miss, second call cache hit.
3) KPI availability:
   - When Story Points missing, SP columns show N/A (not 0).

Orchestration update
- Add new spec to `scripts/Jira-Reporting-App-Test-Orchestration-Runner.js` so it runs with `npm run test:all`.

---

## 13. Bonus Edge‑Case Solutions (Realistic scope)

1) Sprint window overlap ambiguity  
If a sprint overlaps the window by 1 day, counts can be misleading.  
Solution: show an “Overlap Days” column in Sprints export and a tooltip explaining partial inclusion.

2) Story Points missing on some issues  
If a team partially uses Story Points, SP‑based KPIs under‑report.  
Solution: show a “% with SP” metric and warn when below 80%.

3) Epic types renamed by Jira config  
If “Epic” issue type is renamed (e.g., “Epic (Feature)”), Epic TTM can misclassify.  
Solution: add a configuration note in Metadata listing detected Epic issue types.

