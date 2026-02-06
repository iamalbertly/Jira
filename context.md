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
  - **Public API:** `GET /api/csv-columns` – returns `{ columns: CSV_COLUMNS }` (SSOT for client CSV column order). `GET /api/boards.json` – list boards for projects (for current-sprint board selector). `GET /api/current-sprint.json` – current-sprint transparency payload per board (snapshot-first; query `boardId`, optional `projects`, `live=true`). Payload includes `stuckCandidates[]` (issues in progress >24h), `previousSprint: { name, id, doneSP, doneStories } | null`. `GET /api/date-range?quarter=Q1|Q2|Q3|Q4` – latest completed Vodacom quarter range `{ start, end }` (UTC). `GET /api/quarters-list?count=8` – last N Vodacom quarters up to current `{ quarters: [{ start, end, label, period, isCurrent }, ...] }`; implemented via `getQuartersUpToCurrent` in `lib/Jira-Reporting-App-Data-VodacomQuarters-01Bounds.js`. `GET /api/format-date-range?start=...&end=...` – date range label for filenames (Qn-YYYY or start_to_end). `GET /api/default-window` – default report date window `{ start, end }` (SSOT from config).
  - **Routes:** `GET /report`, `GET /current-sprint` (squad transparency), `GET /sprint-leadership` (leadership view).
  - **Default window SSOT:** `lib/Jira-Reporting-App-Config-DefaultWindow.js` exports `DEFAULT_WINDOW_START`, `DEFAULT_WINDOW_END`; server and `GET /api/default-window` use it.
  - **Vodacom quarters SSOT:** `lib/Jira-Reporting-App-Data-VodacomQuarters-01Bounds.js` – quarter bounds, `getLatestCompletedQuarter(q)`, and `getQuartersUpToCurrent(count)`; `lib/excel.js` uses `getQuarterLabelForRange` for filename labels.
- **Frontend (`public/report.html`, `public/current-sprint.html`, `public/leadership.html`, `public/styles.css`, and modular `Reporting-App-*` scripts)**
  - Report (General Performance) is loaded via `report.html` and `Reporting-App-Report-Page-Init-Controller.js` only; no legacy report.js. Filters panel, preview header, tabs, and content are driven by `Reporting-App-Report-Page-*` modules. Date window uses a scrollable strip of Vodacom quarter pills (5+ quarters up to current) from `/api/quarters-list`.
  - Leadership uses `leadership.html` and `Reporting-App-Leadership-Page-Init-Controller.js`; same quarter strip pattern.
  - `Reporting-App-Shared-Boards-Summary-Builder.js` – SSOT for board summary aggregation (Report and Leadership); both pages use `buildBoardSummaries` only.
  - `Reporting-App-Report-Utils-Jira-Helpers.js` – buildJiraIssueUrl, getEpicStoryItems, isJiraIssueKey (used by Epic TTM linkification and ad-hoc key detection).
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
- **Project/Board SSOT**
  Selected projects are stored in `vodaAgileBoard_selectedProjects` (localStorage). Report persists on project checkbox change; Leadership reads/writes on load/save; Current Sprint reads on load and uses it for `/api/boards.json` and `/api/current-sprint.json` (fallback MPSA,MAS). Board selector on Current Sprint reflects the same projects as Report/Leadership.
- **Sprint order contract**
  Sprints displayed for filtering (Report Sprints tab, Current Sprint tabs) are ordered **left-to-right from current/latest backwards by sprint end date**. First tab/row = latest end date; each subsequent = same or earlier. Report uses `sortSprintsLatestFirst(sprints)`; Current Sprint uses `resolveRecentSprints` (lib/currentSprint.js) which sorts by `endDate` descending. Automated tests assert this order.
- **Data alignment**  
  Current-sprint and leadership summary logic must use only server-provided fields. **Board summary SSOT:** `public/Reporting-App-Shared-Boards-Summary-Builder.js` exports `buildBoardSummaries`. Report uses it in `Reporting-App-Report-Page-Render-Boards.js` and `Reporting-App-Report-Page-Filters-Pills-Manager.js`; Leadership uses it in `Reporting-App-Leadership-Page-Data-Loader.js` and passes `boardSummaries` to the render. Do not aggregate boards/sprints locally; use the shared builder only. Canonical shape must match server `sprintsIncluded[]` (sprintWorkDays, sprintCalendarDays, etc.). Do not introduce client-only computed fields that can drift from server.
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
- **Current Sprint: stuck prompt, stories table, subtask summary**
  When `stuckCandidates.length > 0`, the summary strip shows a link "X in progress >24h – Follow up" to `#stuck-card`. Stories in sprint table includes Reporter and Assignee columns; planned window line at top of Stories card. Sub-task summary in the summary card is a single line linking to `#subtask-tracking-card` (no duplicate Sub-task logged / Time tracking alerts blocks).
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

### Issue key linkification

- **Shared helper:** `public/Reporting-App-Shared-Dom-Escape-Helpers.js` exports `renderIssueKeyLink(issueKey, issueUrl)`. When `issueUrl` is present, renders `<a href="..." target="_blank" rel="noopener noreferrer">` with escaped label; otherwise escaped text. Label = `(issueKey || '').trim() || '-'`.
- **Current Sprint:** Backend `/api/current-sprint.json` sends `issueKey` and `issueUrl` for `stories[]`, `scopeChanges[]`, `stuckCandidates[]`, and `subtaskTracking.rows[]`. Frontend uses `renderIssueKeyLink(row.issueKey || row.key, row.issueUrl)` in Stories, Scope changes, Items stuck, and Sub-task tracking tables. Optional `meta.jiraHost` in the response allows client-side URL fallback when `issueUrl` is missing.
- **Report:** Done Stories and Epic TTM use `buildJiraIssueUrl(jiraHost, key)` from Report utils; Epic Key and sample story in preview header are clickable Jira links.

### View Rendering – Empty-state SSOT

- **Shared helper:** `public/Reporting-App-Shared-Empty-State-Helpers.js` exports `renderEmptyStateHtml(title, message, hint?)` returning the same DOM pattern (`.empty-state` with title, message, optional hint). Report uses it via `renderEmptyState(targetElement, title, message, hint)` in `Reporting-App-Report-Page-Render-Helpers.js` (sets `targetElement.innerHTML`). Current Sprint (no sprint, no stories) and Leadership (no boards) use `renderEmptyStateHtml` when building HTML strings.
- Consolidated empty-state usage: Report (Boards, Sprints, Done Stories, Metrics, Unusable), Current Sprint (no sprint, no stories), Leadership (no boards).

### Test & Helper Consolidation

- **Playwright test strategy:** Specs in `tests/` (`.spec.js`) are discovered by Playwright (`testDir: './tests'`). Many specs use `captureBrowserTelemetry(page)` from `JiraReporting-Tests-Shared-PreviewExport-Helpers.js` to capture console errors, page errors, and failed requests; assertions on `telemetry.consoleErrors`, `telemetry.pageErrors`, `telemetry.failedRequests` fail the step when the UI or console/network is wrong. The orchestration runner (`scripts/Jira-Reporting-App-Test-Orchestration-Runner.js`) runs these specs in sequence; add new spec paths to the `steps` array to include them in `npm run test:all`.
- **Shared test helpers (`tests/JiraReporting-Tests-Shared-PreviewExport-Helpers.js`)**
  - `runDefaultPreview(page, overrides?)` – navigates to `/report`, sets default Q2 MPSA+MAS window, applies overrides, clicks Preview, then waits for result.
  - `waitForPreview(page)` – waits for preview content or error and loading overlay to disappear.
  - `captureBrowserTelemetry(page)` – returns `{ consoleErrors, pageErrors, failedRequests }` for logcat-style assertions.
  - Imported by E2E User Journey, Excel Export, UX Critical/Reliability, Column Tooltip, Refactor SSOT, E2E Loading Meta, RED-LINE, UX Trust, Current Sprint UX/SSOT, Linkification/Empty-state validation specs.
- **API integration tests (`Jira-Reporting-App-API-Integration-Tests.spec.js`)**
  - Centralised: `DEFAULT_Q2_QUERY`, `DEFAULT_PREVIEW_URL`, contract test for `GET /api/csv-columns` vs `lib/csv.js` CSV_COLUMNS.

### SIZE-EXEMPT Notes

- `server.js`
  - Marker: `// SIZE-EXEMPT: Cohesive Express server entry and preview/export orchestration kept together for operational transparency, logging, and simpler deployment without introducing additional routing layers or indirection.`
  - Rationale: Keeping startup, routing, and preview/export orchestration in one place simplifies operational debugging and avoids scattering core HTTP entry behaviour across multiple files.
- `lib/metrics.js`
  - Marker: `// SIZE-EXEMPT: Cohesive metrics domain logic (throughput, done comparison, rework, predictability, epic TTM) is kept in a single module to avoid scattering cross-related calculations and increasing coordination bugs.`
  - Rationale: Metrics functions are tightly related and operate over the same row data; keeping them together avoids duplicated calculations and subtle drift between separate metric modules.

