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

