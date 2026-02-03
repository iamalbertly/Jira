## VodaAgileBoard – Architecture & Context

### Modules & Dependencies

- **Server (`server.js`)**
  - Depends on `express`, `dotenv`, `jira.js`, and internal libs:
    - `lib/jiraClients.js` – Jira client creation
    - `lib/discovery.js` – boards/fields discovery (uses `lib/JiraReporting-Data-JiraAPI-Pagination-Helper.js`)
    - `lib/sprints.js` – sprint fetching, overlap filtering, `getActiveSprintForBoard`, `getRecentClosedSprintForBoard` (uses pagination helper)
    - `lib/currentSprint.js` – current-sprint transparency: `buildCurrentSprintPayload` (observed window, daily completions, scope changes, burndown context)
    - `lib/issues.js` – issue fetching, drill-down row building, `fetchSprintIssuesForTransparency` (done + in-progress for current sprint) (uses pagination helper)
    - `lib/metrics.js` – throughput, done comparison, rework, predictability (with planned carryover / unplanned spillover), epic TTM (uses `calculateWorkDays` from `lib/kpiCalculations.js`)
    - `lib/csv.js` – CSV column list and escaping (SSOT); CSV streaming for `/export`
    - `lib/cache.js` – TTL cache for preview responses
    - `lib/Jira-Reporting-App-Server-Logging-Utility.js` – structured logging
  - **Public API:** `GET /api/csv-columns` – returns `{ columns: CSV_COLUMNS }` (SSOT for client CSV column order). `GET /api/boards.json` – list boards for projects (for current-sprint board selector). `GET /api/current-sprint.json` – current-sprint transparency payload per board (snapshot-first; query `boardId`, optional `projects`, `live=true`). Payload includes `stuckCandidates[]` (issues in progress >24h), `previousSprint: { name, id, doneSP, doneStories } | null`. `GET /api/date-range?quarter=Q1|Q2|Q3|Q4` – latest completed Vodacom quarter range `{ start, end }` (UTC). `GET /api/format-date-range?start=...&end=...` – date range label for filenames (Qn-YYYY or start_to_end). `GET /api/default-window` – default report date window `{ start, end }` (SSOT from config).
  - **Routes:** `GET /report`, `GET /current-sprint` (squad transparency), `GET /sprint-leadership` (leadership view).
  - **Default window SSOT:** `lib/Jira-Reporting-App-Config-DefaultWindow.js` exports `DEFAULT_WINDOW_START`, `DEFAULT_WINDOW_END`; server and `GET /api/default-window` use it.
  - **Vodacom quarters SSOT:** `lib/Jira-Reporting-App-Data-VodacomQuarters-01Bounds.js` – quarter bounds and `getLatestCompletedQuarter(q)`; `lib/excel.js` uses `getQuarterLabelForRange` for filename labels.
- **Frontend (`public/report.js`, `public/report.html`, `public/styles.css`, `public/current-sprint.html`, `public/current-sprint.js`, `public/leadership.html`, `public/leadership.js`, `public/Jira-Reporting-App-Public-Boards-Summary.js`)**
  - `report.html` – filters panel, preview header, tabs, and content containers
  - `report.js` – preview flow, client-side validation, tab rendering, CSV exports; imports `buildBoardSummaries` from shared module
  - `leadership.js` – leadership view; imports `buildBoardSummaries` from shared module
  - `Jira-Reporting-App-Public-Boards-Summary.js` – SSOT for board summary aggregation (Report and Leadership)
- **Tests (`tests/*.spec.js`)**
  - `Jira-Reporting-App-E2E-User-Journey-Tests.spec.js` – UI and UX/user-journey coverage
  - `Jira-Reporting-App-API-Integration-Tests.spec.js` – endpoint contracts and CSV semantics (includes `/api/csv-columns`, `/api/boards.json`, `/api/current-sprint.json`, `GET /current-sprint`, `GET /sprint-leadership`)
  - `Jira-Reporting-App-Current-Sprint-Leadership-View-Tests.spec.js` – E2E for current-sprint page (board selector, board selection) and sprint-leadership page (date inputs, Preview)
  - `Jira-Reporting-App-UX-Trust-Validation-Tests.spec.js` – report, current-sprint, leadership with console (logcat-style) and realtime UI assertions; run by orchestration
  - `Jira-Reporting-App-Current-Sprint-UX-SSOT-Validation-Tests.spec.js` – board pre-select, burndown summary, empty states, leadership empty preview, report boards; logcat + UI; run by orchestration
  - `Jira-Reporting-App-Refactor-SSOT-Validation-Tests.spec.js` – Boards column order, tooltips, capacity columns, CSV SSOT contract
  - `tests/JiraReporting-Tests-Shared-PreviewExport-Helpers.js` – SSOT for `runDefaultPreview(page, overrides?)` and `waitForPreview(page)`; used by E2E, Excel, UX Critical/Reliability, Column Tooltip, Refactor SSOT, E2E Loading Meta, RED-LINE specs
- **Scripts**
  - `scripts/Jira-Reporting-App-Test-Orchestration-Runner.js` – sequential runner for Playwright API + E2E suites (includes Refactor SSOT, Boards Summary Filters Export, Current Sprint and Leadership View, UX Trust Validation, Current Sprint UX and SSOT Validation steps)
- **File naming:** New lib modules should follow the 5-segment convention (e.g. `Jira-Reporting-App-Sprint-Transparency-CurrentSprint.js`). Existing short names (e.g. `lib/currentSprint.js`) are not renamed in this pass to avoid import churn.

### Public API Surface – `/preview.json`

- **Query parameters** (unchanged – see `README.md` for full list).
- **Response meta (selected fields)**:
  - `selectedProjects: string[]`
  - `windowStart: string`
  - `windowEnd: string`
  - `discoveredFields: { storyPointsFieldId?: string; epicLinkFieldId?: string }`
  - `fromCache: boolean`
  - `requestedAt: string`
  - `generatedAt: string`
  - `elapsedMs: number`
  - `partial: boolean`
  - `partialReason: string | null`
  - `requireResolvedBySprintEnd: boolean` **(surfaced so the UI can explain empty states)**
  - `epicHygiene: { ok: boolean, pctWithoutEpic: number, epicsSpanningOverN: number, message: string | null }` **(gates Epic TTM display)**
  - `phaseLog: Array<{ phase: string; at: string; ... }>`
- **Preview response:** `boards[].indexedDelivery: { currentSPPerDay, rollingAvgSPPerDay, sprintCount, index }`; `sprintsIncluded[]` include `sprintCalendarDays`, `sprintWorkDays`, `spPerSprintDay`, `storiesPerSprintDay`. Predictability `perSprint` includes `plannedCarryoverStories`, `plannedCarryoverSP`, `unplannedSpilloverStories`, `unplannedSpilloverSP`, `plannedCarryoverPct`, `unplannedSpilloverPct`.

### Typed Error Path – `/preview.json`

- Introduced a small typed error wrapper:
  - `class PreviewError extends Error { code: string; httpStatus: number }`
  - Currently used for:
    - Jira client initialisation failures → `code: "AUTH_ERROR"`, `httpStatus: 500`
  - Catch block for `/preview.json` now:
    - Detects `instanceof PreviewError`
    - Returns JSON with:
      - `error: "Failed to generate preview"`
      - `code: error.code | "PREVIEW_ERROR"`
      - `message: error.message | "An unexpected error occurred while generating the preview."`
      - `details: error.message` in `NODE_ENV=development`

### Frontend Behaviour & UX Notes

- **Error banner SSOT (per view)**  
  Each view uses a single DOM node for API/validation errors: report `#error`, current-sprint `#current-sprint-error`, leadership `#leadership-error`. Do not show duplicate or overlapping error messages; use one function per view (e.g. `showError`) that writes to that node.
- **Sprint order contract**  
  Sprints displayed for filtering (Report Sprints tab, Current Sprint tabs) are ordered **left-to-right from current/latest backwards by sprint end date**. First tab/row = latest end date; each subsequent = same or earlier. Report uses `sortSprintsLatestFirst(sprints)`; Current Sprint uses `resolveRecentSprints` (lib/currentSprint.js) which sorts by `endDate` descending. Automated tests assert this order.
- **Data alignment**  
  Current-sprint and leadership summary logic must use only server-provided fields. Board summary SSOT: `public/Jira-Reporting-App-Public-Boards-Summary.js` exports `buildBoardSummaries`; report and leadership import it. Canonical shape must match server `sprintsIncluded[]` (sprintWorkDays, sprintCalendarDays, etc.). Do not introduce client-only computed fields that can drift from server.
- **Client-side date-range validation**
  - `collectFilterParams()` now throws when `start >= end` after normalising to UTC ISO:
    - Message: `"Start date must be before end date. Please adjust your date range."`
  - Preview handler catches this as a **validation error**:
    - Shows error banner with guidance
    - Does **not** send a network request
    - Restores the previous export button disabled state
- **Preview button and export buttons**
  - On `Preview` click:
    - `#preview-btn` is disabled immediately to prevent double-clicks
    - Both export buttons are disabled while the preview is in flight
  - After the request (success or failure):
    - `#preview-btn` is re-enabled
    - Export buttons enabled **only when there is at least one preview row**
- **Partial preview visibility**
  - Server already emits `meta.partial` and `meta.partialReason`.
  - UI now also:
    - Renders a banner in `#preview-status` when `partial === true`
    - Shows a matching export hint in `#export-hint` when partial previews have rows
- **Require Resolved by Sprint End empty state**
  - `renderDoneStoriesTab` now inspects:
    - `previewData.meta.requireResolvedBySprintEnd`
    - Total preview rows vs. visible rows
  - When the filter is on and there were preview rows, but none pass the filter:
    - Empty state messaging calls out `"Require resolved by sprint end"` explicitly with remediation hints.

### View Rendering – Single Empty-State Helper

- Introduced `renderEmptyState(targetElement, title, message, hint?)` in `public/report.js`.
- Consolidated empty-state HTML in:
  - `renderBoardsTab`
  - `renderSprintsTab`
  - `renderDoneStoriesTab`
  - `renderMetricsTab`
  - `renderUnusableSprintsTab`
- Benefit:
  - Consistent copy and styling for “no data” conditions.
  - Future tweaks to empty-state layout are centralised.

### Test & Helper Consolidation

- **Shared test helpers (`tests/JiraReporting-Tests-Shared-PreviewExport-Helpers.js`)**
  - `runDefaultPreview(page, overrides?)` – navigates to `/report`, sets default Q2 MPSA+MAS window, applies overrides, clicks Preview, then waits for result.
  - `waitForPreview(page)` – waits for preview content or error and loading overlay to disappear.
  - Imported by E2E User Journey, Excel Export, UX Critical/Reliability, Column Tooltip, Refactor SSOT, E2E Loading Meta, RED-LINE specs.
- **API integration tests (`Jira-Reporting-App-API-Integration-Tests.spec.js`)**
  - Centralised: `DEFAULT_Q2_QUERY`, `DEFAULT_PREVIEW_URL`, contract test for `GET /api/csv-columns` vs `lib/csv.js` CSV_COLUMNS.

### SIZE-EXEMPT Notes

- `server.js`
  - Marker: `// SIZE-EXEMPT: Cohesive Express server entry and preview/export orchestration kept together for operational transparency, logging, and simpler deployment without introducing additional routing layers or indirection.`
  - Rationale: Keeping startup, routing, and preview/export orchestration in one place simplifies operational debugging and avoids scattering core HTTP entry behaviour across multiple files.
- `public/report.js`
  - Marker: `// SIZE-EXEMPT: Legacy report UI controller kept as a single browser module to avoid introducing additional bundling or script loading complexity. Behaviour is cohesive around preview, tabs, and exports; future work can further split if a bundler is added.`
  - Rationale: The script is loaded directly in the browser without a bundler; splitting it into multiple files would complicate loading and ordering. Logic remains cohesive around the main report screen.
- `lib/metrics.js`
  - Marker: `// SIZE-EXEMPT: Cohesive metrics domain logic (throughput, done comparison, rework, predictability, epic TTM) is kept in a single module to avoid scattering cross-related calculations and increasing coordination bugs.`
  - Rationale: Metrics functions are tightly related and operate over the same row data; keeping them together avoids duplicated calculations and subtle drift between separate metric modules.

