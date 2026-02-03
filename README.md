# VodaAgileBoard

VodaAgileBoard is the tool for scrum masters and leaders: a Node.js web application for generating sprint reports from Jira for MPSA and MAS projects. It provides a preview-first workflow where you configure filters, preview data in a tabbed interface, and export CSV or Excel without re-fetching from Jira.

This README is the SSOT for usage and validation. Supplemental documents (e.g. `Jira-Reporting-Gap-Analysis-Plan.md`) provide planning context only and do not supersede this guide.

## Features

- **Preview-First Workflow**: Preview data before exporting to ensure accuracy
- **Multi-Project Support**: Generate reports for MPSA and MAS projects
- **Sprint Overlap Filtering**: Automatically filters sprints that overlap with the selected date window
- **Comprehensive Metrics**: Optional metrics including throughput, predictability, rework ratio, and Epic TTM
- **Flexible Export**: Export filtered or raw preview data as CSV
- **Runtime Discovery**: Automatically discovers boards and field IDs from your Jira instance
- **Error Handling**: Robust error handling with user-friendly messages and retry logic
- **Feedback Capture**: In-app feedback form for users to submit issues and suggestions
- **Current Sprint Transparency**: Squad view at `/current-sprint` – sprint header with name/ID, summary strip (stories, SP, % done), status chips, daily completion (with SP), burndown with ideal line + axis labels, scope changes, stories list with status, dependencies/learnings, stuck tasks (in progress >24h), previous/next sprint snippet, and sprint tabs. Board pre-select via `?boardId=` or last-selected board (localStorage); optional `sprintId` for tabbed history.
- **Sprint Leadership View**: Normalized trends at `/sprint-leadership` – indexed delivery, predictability, no rankings

## Prerequisites

- Node.js 20.0.0 or newer
- Jira Cloud account with API access
- Jira API token (create at https://id.atlassian.com/manage-profile/security/api-tokens)

## Installation

1. Clone or download this repository

2. Install dependencies:
```bash
npm install
```

3. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

4. Edit `.env` and set your Jira credentials:
```
JIRA_HOST=https://your-domain.atlassian.net
JIRA_EMAIL=your@email.com
JIRA_API_TOKEN=your_api_token
```

## Running the Application

### Development Mode
```bash
npm run dev
```

This starts the server with nodemon for auto-restart on file changes.

### Production Mode
```bash
npm start
```

The server will start on `http://localhost:3000` (or the port specified in the `PORT` environment variable).

### Access the Application

1. Open your browser and go to `http://localhost:3000` (or the port in `PORT`).
2. Log in with the credentials configured in your environment (see Environment Variables).
3. After login you can open **Report**, **Current Sprint** (squad view), or **Sprint Leadership** from the app; the default redirect is `http://localhost:3000/report`.
4. All three main pages (Report, Current Sprint, Leadership) show a consistent nav strip: **Report | Current Sprint (Squad) | Leadership** so you can move between them without using the browser back button.

### Quickstart for Scrum Masters & Leaders

1. Get the live VodaAgileBoard URL from your admin (for example, `https://voda-agile-board.onrender.com`).
2. Sign in with the credentials shared by your admin.
3. On the Sprint Report screen, keep both MPSA and MAS selected for a combined view, or choose a single project for a focused view.
4. Leave the default quarter dates or adjust them to your sprint window, then click **Preview**.
5. Use **Export to Excel – All Data** to download a workbook you can slice and share in your own tooling.

## Usage

### Generating a Report

1. **Select Projects**: Check MPSA and/or MAS (at least one required)

2. **Set Date Window**: 
   - Default is Q2 2025 (July 1 - September 30, 2025)
   - Adjust start and end dates as needed
   - Dates are in UTC

3. **Configure Options**:
   - **Story Points, Epic TTM, and Bugs/Rework**: Always included in reports (mandatory)
   - **Require Resolved by Sprint End** (optional): Only include stories resolved before sprint end
   - **Include Predictability** (optional): Calculate committed vs delivered (approx or strict mode)
   - **Include Active/Missing End Date Sprints** (optional): Include sprints with missing end dates

4. **Click Preview**: Generates preview data from Jira

5. **Review Tabs**:
   - **Project & Epic Level**: Shows discovered boards and all project/epic-level metrics in one consolidated view. Boards table merges delivery volume with time-normalized output (total sprint days, avg sprint length, stories/SP per sprint day, variance, done-by-end %, epic vs non-epic counts), plus sprint window and latest sprint end. Includes capacity proxies (Active Assignees, Stories/SP per Assignee, Assumed Capacity, Assumed Waste %) with clear assumptions. Throughput remains available by issue type, along with rework ratio, predictability, and Epic TTM. Includes per-section CSV export button.
   - **Sprints**: Lists sprints overlapping the date window with completion counts. Shows "Total SP" and "Story Count" columns. Column labels: "Stories Completed (Total)" (all stories currently marked Done) and "Completed Within Sprint End Date" (stories resolved by sprint end date). When time-tracking data exists, shows Est Hrs, Spent Hrs, Remaining Hrs, and Variance Hrs. When subtask tracking exists, adds Subtask Est/Spent/Remaining/Variance columns. Includes per-section CSV export button.
   - **Done Stories**: Drill-down view of completed stories, grouped by sprint. Shows Epic Key, Epic Title, and Epic Summary columns when Epic Link field is available. Epic Summary is truncated to 100 characters with full text in tooltip. When time tracking exists, shows Est/Spent/Remaining/Variance hours for the story and for its subtasks (when available). Dates render in local-friendly format with raw ISO on hover. Includes per-section CSV export button.
   - **Unusable Sprints**: Lists sprints excluded due to missing dates

6. **Export to Excel**:
   - **Export to Excel - All Data**: Main export button generates a comprehensive Excel workbook (.xlsx) with 6 tabs:
     - **Summary**: Key metrics, KPIs, agile maturity assessment, data quality scores, and manual enrichment guide
     - **Boards**: Board-level delivery and time-normalized metrics (sprint days, stories/SP per sprint day, variance, done-by-end %, epic vs non-epic counts, capacity proxy columns)
     - **Stories**: All done stories with business-friendly column names, Excel-compatible dates, calculated KPI columns (Work Days to Complete, Cycle Time, etc.), and manual enrichment columns (Epic ID/Name Manual, Is Rework/Bug Manual, Team Notes)
     - **Sprints**: Sprint-level metrics with throughput, predictability, rework data, and time tracking totals (when available)
     - **Epics**: Epic TTM data with calculated lead times
   - **Metadata**: Export timestamp, date range, projects, filters applied, and data freshness
   - **Field Inventory** (Metadata): Counts of available/custom Jira fields plus EBM-relevant field matches and missing candidates (no full field list in export payload)
   - **File Naming**: Excel files use descriptive names: `{Projects}_{DateRange}_{ReportType}_{ExportDate}.xlsx` (e.g., `MPSA-MAS_Q2-2025_Sprint-Report_2025-01-27.xlsx`)
   - **Business-Friendly Columns**: All technical column names are mapped to business-friendly labels (e.g., `issueKey` → `Ticket ID`, `sprintStartDate` → `Sprint Start Date`)
   - **Excel-Compatible Dates**: All dates are formatted for Excel recognition, enabling date filtering, pivot tables, and formulas
   - **KPI Columns**: Pre-calculated columns include Work Days to Complete, Cycle Time, Sprint Duration, and Agile Maturity Level
   - **Manual Enrichment**: Blank columns provided for teams to fill in missing Epic IDs/Names, Rework/Bug flags, and notes
   - **Data Validation**: Excel export validates data structure before sending to server, preventing errors and providing clear feedback
   - **Empty Tab Handling**: Empty tabs (Epics, Sprints) show placeholder messages explaining why data is missing
   - **File Size Warnings**: Large Excel files (>50MB) trigger a warning before generation, allowing users to filter data or cancel
   - **Improved Error Messages**: Specific, actionable error messages for network errors, server errors, timeouts, and invalid data
   
7. **Export CSV** (Secondary Option):
   - **Per-Section Exports**: Each tab has its own "Export CSV" button for quick single-section exports
   - **Export CSV (Filtered View)**: Exports only currently visible rows (after search/filter)
   - **File Naming**: `{Projects}_{DateRange}_{Section}_{ExportDate}.csv` (includes `_PARTIAL` when preview data is partial)
   - All CSV exports include Epic Key, Epic Title, and Epic Summary columns when Epic Link field is available
   - Stories exports include time-tracking and EBM-supporting fields when available (e.g., subtask count, story estimate/spent/remaining/variance hours, subtask estimate/spent/remaining/variance hours, status category, priority, labels, components, fix versions, and EBM fields such as team, product area, customer segments, value, impact, satisfaction, sentiment, severity, source, work category, goals, theme, roadmap, focus areas, delivery status/progress)

### Preview Behaviour & Feedback

- **In-flight feedback**:
- **User feedback capture**:
  - Click **Give Feedback** at the top of the report to submit your email and detailed feedback.
  - Submissions are stored on the server in `data/JiraReporting-Feedback-UserInput-Submission-Log.jsonl`.

  - When you click **Preview**, the button is temporarily disabled to prevent double-clicks while the loading overlay shows progress updates.
  - The loading panel includes a live timer and step log (e.g. “Collecting filter parameters”, “Sending request to server”, “Received data from server”).
  - If a previous preview is already visible, the UI keeps it on-screen while the new request runs and shows a refresh banner so users see immediate results.
  - The step log keeps only the most recent entries to avoid overwhelming the UI during long-running previews.
- **Partial previews**:
  - If the backend has to stop early (for example due to time budget or pagination limits), the response is marked as partial.
  - The UI shows a warning banner near the preview summary and a matching hint near the export buttons. CSV exports will only contain the currently loaded data in this case.
- **Require Resolved by Sprint End**:
  - When this option is enabled, the **Done Stories** tab will explain when no rows passed this filter, and suggests turning it off or reviewing resolution vs sprint end dates in Jira.
- **Exports and table state**:
  - Export buttons remain disabled until there is at least one Done story in the preview.
  - If you change filters and end up with no rows, the empty state explains whether this is due to filters, the “Require Resolved by Sprint End” option, or genuinely no Done stories.
  - Filtered CSV export is disabled when filters match zero rows, with a hint explaining why.
  - Invalid date inputs are caught client-side with a clear error before any request is sent.

### Filtering Done Stories

- **Search Box**: Filter by issue key or summary (case-insensitive)
- **Project Pills**: Click project pills to filter by project
- Filters update the visible rows in real-time

## API Endpoints

### GET /report
Serves the main report page HTML.

### GET /current-sprint
Serves the Current Sprint Transparency HTML page (squad view).

### GET /sprint-leadership
Serves the Sprint Leadership view HTML page.

### GET /api/boards.json
Returns a list of boards for the given projects (for the current-sprint board selector).

**Query Parameters:**
- `projects` (required): Comma-separated project keys (e.g., `MPSA,MAS`)

**Response:** `{ boards: Array<{ id: number, name: string, ... }> }`. Returns 400 with code `NO_PROJECTS` when `projects` is missing or empty.

### GET /api/current-sprint.json
Returns the current-sprint transparency payload for a board (snapshot-first; use `live=true` to bypass cache). Optional `sprintId` loads a specific sprint for tab navigation.

### POST /api/current-sprint-notes
Saves dependencies/learnings notes for a sprint. Body: `{ boardId, sprintId, dependencies, learnings }`.

**Query Parameters:**
- `boardId` (required): Jira board ID
- `projects` (optional): Comma-separated project keys
- `live` (optional): `true` to fetch live from Jira instead of cached snapshot

**Response:** Current-sprint payload (sprint details, daily completion, scope changes, burndown context). Returns 400 with code `MISSING_BOARD_ID` when `boardId` is missing; 404 with code `BOARD_NOT_FOUND` when the board is not in the given projects.

### GET /preview.json
Generates preview data from Jira.

**Query Parameters:**
- `projects` (required): Comma-separated project keys (e.g., `MPSA,MAS`)
- `start` (optional): Start date in ISO 8601 format (default: `2025-07-01T00:00:00.000Z`)
- `end` (optional): End date in ISO 8601 format (default: `2025-09-30T23:59:59.999Z`)
- `includeStoryPoints` (mandatory): Always `true` - Story Points are always included in reports
- `requireResolvedBySprintEnd` (optional): `true` or `false`
- `includeBugsForRework` (mandatory): Always `true` - Bugs/Rework are always included in reports
- `includePredictability` (optional): `true` or `false`
- `predictabilityMode` (optional): `approx` or `strict` (default: `approx`)
- `includeEpicTTM` (mandatory): Always `true` - Epic TTM is always included in reports
- `includeActiveOrMissingEndDateSprints` (optional): `true` or `false`

### POST /export-excel
Generates Excel workbook (.xlsx) with multiple sheets.

**Request Body:**
```json
{
  "workbookData": {
    "sheets": [
      {
        "name": "Summary",
        "columns": ["Section", "Metric", "Value"],
        "rows": [...]
      },
      {
        "name": "Stories",
        "columns": ["Ticket ID", "Ticket Summary", ...],
        "rows": [...]
      }
    ]
  },
  "meta": {
    "selectedProjects": ["MPSA", "MAS"],
    "windowStart": "2025-07-01T00:00:00.000Z",
    "windowEnd": "2025-09-30T23:59:59.999Z"
  }
}
```

**Response:** Excel file download (.xlsx) with filename: `{Projects}_{DateRange}_{ReportType}_{ExportDate}.xlsx`

**Response:**
```json
{
  "meta": {
    "selectedProjects": ["MPSA", "MAS"],
    "windowStart": "2025-07-01T00:00:00.000Z",
    "windowEnd": "2025-09-30T23:59:59.999Z",
    "discoveredFields": {
      "storyPointsFieldId": "customfield_10016",
      "epicLinkFieldId": "customfield_10014"
    },
    "fromCache": false,
    "cacheAgeMinutes": 5,
    "epicTTMFallbackCount": 2
  },
  "boards": [...],
  "sprintsIncluded": [...],
  "sprintsUnusable": [...],
  "rows": [...],
  "metrics": {...}
}
```

### POST /export
Streams CSV export for large datasets.

**Request Body:**
```json
{
  "columns": ["projectKey", "boardId", ...],
  "rows": [{...}, {...}]
}
```

**Response:** CSV file download

## Testing

### Run All Tests
```bash
npm run test:all
```

This runs the test orchestration script which:
1. Installs dependencies
2. Runs API integration tests (includes `/api/boards.json`, `/api/current-sprint.json`, `/current-sprint`, `/sprint-leadership`)
3. Runs Login Security Deploy Validation tests
4. Runs E2E user journey tests
5. Runs UX reliability tests (validates data quality indicators, error handling, UI improvements)
6. Runs UX critical fixes tests (validates Epic Title/Summary, merged throughput, renamed labels, per-section exports, TTM definition, export loading states, button visibility)
7. Runs Feedback & Date Display tests
8. Runs Column Titles & Tooltips tests
9. Runs Validation Plan tests
10. Runs Excel Export tests
11. Runs Refactor SSOT Validation tests
12. Runs Boards Summary Filters Export Validation tests
13. Runs Current Sprint and Leadership View tests
14. Runs UX Trust Validation tests (report, current-sprint, leadership with console and UI assertions)
15. Runs Current Sprint UX and SSOT Validation tests (board pre-select, burndown summary, empty states, leadership empty preview)
15. Terminates on first error
16. Shows all steps in foreground with live output from each test command

### Run Specific Test Suites
```bash
# E2E tests only
npm run test:e2e

# API tests only
npm run test:api

# Validation plan tests (UI + telemetry)
npm run test:validation

# Current Sprint and Leadership view E2E tests
npm run test:current-sprint-leadership

# UX Trust Validation (report, current-sprint, leadership + console/UI assertions)
npm run test:ux-trust

# Current Sprint UX and SSOT Validation (board pre-select, burndown, empty states, leadership empty preview)
npm run test:current-sprint-ux-ssot
```

### Test Coverage and Caching Behavior

- **E2E Tests**: User interface interactions, tab navigation, filtering, export
- **API Tests**: Endpoint validation, error handling, CSV generation
- **UX Reliability Tests**: Data quality indicators (Unknown issueType display, Epic TTM fallback warnings), cache age display, error recovery
- **UX Critical Fixes Tests**: Epic Title/Summary display, merged Sprint Throughput data, renamed column labels with tooltips, per-section CSV export buttons and filenames, TTM definition header, export button loading states, button visibility after async renders, Epic Summary truncation edge cases
- **Excel Export Tests**: Excel file generation, multi-tab structure, business-friendly column names, Excel-compatible dates, KPI calculations, manual enrichment columns, Summary and Metadata tabs

**Note**: Some tests may require valid Jira credentials. Tests that require Jira access will gracefully handle authentication failures.

### Data Quality & Reliability Features

- **Issue Type Tracking**: All rows include `issueType` field. Missing types display as "Unknown" in UI and are logged as warnings.
- **Epic Data Enrichment**: When Epic Link field is available, rows include Epic Key, Epic Title, and Epic Summary. Epic Summary is truncated to 100 characters in table view with full text in tooltip. Epic fetch failures gracefully degrade - empty strings are used if Epic issues unavailable.
- **Epic TTM Accuracy**: Epic TTM uses Epic issue dates when available. Falls back to story dates if Epic issues unavailable, with warning displayed in Metrics tab. Definition clearly explained: "Days from Epic creation to Epic resolution (or first story created to last story resolved if Epic dates unavailable)."
- **Cache Transparency**: Preview meta shows cache age when data is served from cache, enabling users to assess data freshness.
- **Error Recovery**: Epic fetch failures don't break preview generation - system gracefully degrades to story-based calculation.
- **Excel Export**: Main export generates comprehensive Excel workbook with 5 tabs (Summary, Stories, Sprints, Epics, Metadata). Files use descriptive naming: `{Projects}_{DateRange}_{ReportType}_{ExportDate}.xlsx`. All dates are Excel-compatible format, enabling filtering and formulas. Data is validated before export, empty tabs show placeholder messages, large files (>50MB) trigger warnings, and error messages are actionable.
- **Business-Friendly Columns**: Technical column names mapped to business-friendly labels (e.g., `issueKey` → `Ticket ID`, `sprintStartDate` → `Sprint Start Date`) for easier analysis by leaders and analysts.
- **KPI Columns**: Pre-calculated columns include Work Days to Complete, Cycle Time (Days), Sprint Duration (Work Days), Days Since Created, and Agile Maturity Level (1-5 scale).
- **Manual Enrichment**: Excel exports include blank columns for teams to fill in: Epic ID (Manual), Epic Name (Manual), Is Rework (Manual), Is Bug (Manual), and Team Notes.
- **CSV Validation**: Client-side validation ensures required columns (issueKey, issueType, issueStatus) are present before export. CSV exports include Epic Key, Epic Title, and Epic Summary when available.
- **Export UX**: Export buttons show loading state ("Exporting..." or "Generating Excel...") and are disabled during export to prevent duplicate exports. Buttons are visible after async rendering completes.

### Test Orchestration & Playwright

- The test orchestration script (`npm run test:all`) runs `npm install` then a sequence of Playwright specs (API integration, Login Security, E2E user journey, UX Reliability, UX Critical Fixes, Feedback, Column Tooltips, Validation Plan, Excel Export, Refactor SSOT, Boards Summary Filters Export, Current Sprint and Leadership View, UX Trust Validation, Current Sprint UX and SSOT Validation) with `--headed`, `--max-failures=1`, and `--workers=1`.
- Playwright is configured (via `playwright.config.js`) to:
  - Use `http://localhost:3000` as the default `baseURL` (configurable via `BASE_URL` for remote runs).
  - Optionally manage the application lifecycle with `webServer` (set `SKIP_WEBSERVER=true` to run against an already running server, e.g. when `BASE_URL` points to a deployed instance).

The backend maintains an in-memory TTL cache for several concerns:

- **Boards and Sprints**: Cached per project/board for 10 minutes to avoid redundant Jira calls.
- **Fields**: Story Points and Epic Link field IDs cached for 15 minutes.
- **Preview Responses**: Full `/preview.json` payloads cached for 10 minutes per unique combination of:
  - Sorted project list
  - Start/end window
  - All boolean toggles
  - `predictabilityMode`

Cached preview responses are immutable snapshots. If Jira data changes within the TTL, those changes will not be reflected until the cache entry expires or the server restarts. This keeps repeated previews (with identical filters) fast and predictable.

## Project Structure

```
.
├── server.js                 # Express server and routes
├── package.json              # Dependencies and scripts
├── .env.example              # Environment variable template
├── .gitignore                # Git ignore rules
├── lib/
│   ├── jiraClients.js        # Jira client setup
│   ├── cache.js              # TTL cache implementation
│   ├── discovery.js          # Board and field discovery
│   ├── sprints.js            # Sprint fetching and filtering
│   ├── issues.js             # Issue extraction and filtering
│   ├── metrics.js            # Metrics calculations
│   ├── csv.js               # CSV generation utilities
│   ├── excel.js              # Excel generation utilities
│   ├── columnMapping.js     # Business-friendly column name mapping
│   ├── kpiCalculations.js    # KPI calculation functions
│   └── Jira-Reporting-App-Server-Logging-Utility.js  # Structured logging
├── public/
│   ├── report.html           # Main UI
│   ├── report.js             # Frontend logic
│   └── styles.css           # Styling
├── tests/
│   ├── Jira-Reporting-App-E2E-User-Journey-Tests.spec.js
│   ├── Jira-Reporting-App-API-Integration-Tests.spec.js
│   ├── Jira-Reporting-App-UX-Reliability-Fixes-Tests.spec.js
│   ├── Jira-Reporting-App-UX-Critical-Fixes-Tests.spec.js
│   ├── Jira-Reporting-App-Excel-Export-Tests.spec.js
│   ├── Jira-Reporting-App-RED-LINE-ITEMS-KPI-Tests.spec.js
│   ├── Jira-Reporting-App-Current-Sprint-Leadership-View-Tests.spec.js
│   └── Jira-Reporting-App-UX-Trust-Validation-Tests.spec.js
└── scripts/
    └── Jira-Reporting-App-Test-Orchestration-Runner.js
```

## Metric guide and governance

Use metrics with explicit assumptions. Every view should make clear what is measured, what is assumed, and what could be wrong. Do not use metrics for performance review, ranking teams, or weaponizing numbers.

### Per-metric guardrails

- **Throughput (SP / stories per sprint)**  
  **Measures:** Volume of work completed in the window (story points and story count).  
  **Does not measure:** Quality, complexity, or team capacity.  
  **Can mislead when:** Sprint length or scope varies; SP is inconsistent across teams.  
  **Do not use for:** Comparing raw totals across teams; performance appraisal.

- **Predictability % (committed vs delivered)**  
  **Measures:** How much of the committed scope (at sprint start) was delivered by sprint end.  
  **Does not measure:** Whether scope change was justified or whether the team “failed.”  
  **Can mislead when:** Committed is approximated from creation date; late scope add is treated as failure.  
  **Do not use for:** Single-sprint “team quality” score; blaming teams for unplanned spillover.

- **Planned carryover vs unplanned spillover**  
  **Measures:** Delivered work that was in plan at sprint start vs added mid-sprint.  
  **Does not measure:** Why scope changed or whether it was appropriate.  
  **Do not use for:** Treating unplanned spillover as failure; ranking without context.

- **Rework % (bug SP vs story SP)**  
  **Measures:** Proportion of delivered effort that was bugs vs stories.  
  **Does not measure:** Root cause or whether bugs were regression vs new work.  
  **Can mislead when:** Bug definition or SP usage differs across teams.  
  **Do not use for:** Naming “worst” team; performance review.

- **Epic TTM (time to market)**  
  **Measures:** Calendar or working days from Epic start to Epic (or story) completion.  
  **Does not measure:** Value delivered or quality of the epic.  
  **Can mislead when:** Epic hygiene is poor (many stories without epic; epics spanning many sprints). Epic TTM is suppressed when hygiene is insufficient.  
  **Do not use for:** Comparing teams without normalizing for epic size or type.

- **Indexed delivery score**  
  **Measures:** Current SP per sprint day vs that team’s own rolling average (last 3–6 sprints).  
  **Does not measure:** Absolute productivity or cross-team comparison.  
  **Can mislead when:** Used to rank teams; baseline period is unrepresentative.  
  **Do not use for:** Ranking teams; performance review.

- **Burndown / remaining SP by day**  
  **Measures:** Context for how remaining scope decreased over the sprint (when completion anchor is resolution date).  
  **Does not measure:** Effort or “ideal” line accuracy.  
  **Can mislead when:** Scope changes are not shown; used as a single success criterion.  
  **Do not use for:** Grading the sprint; ignoring scope-change context.

- **Daily completion histogram**  
  **Measures:** Stories (and optionally task movement) completed per calendar day.  
  **Does not measure:** Effort or quality.  
  **Do not use for:** Inferring “slow” days without scope/blocker context.

- **Observed work window**  
  **Measures:** Earliest and latest issue activity (created/resolution) in the sprint.  
  **Does not measure:** Whether sprint dates were wrong; only that work fell inside or outside planned dates.  
  **Do not use for:** Blaming teams when work extends past sprint end; use for transparency only.

### Metrics that look good but are not trustworthy

- **Raw SP totals across teams** — Sprint length and scope differ; normalize by sprint days and use indexed delivery for trend, not rank.
- **Sprint count as productivity** — More sprints do not mean more delivery; use stories/SP per sprint day.
- **Single-sprint predictability as team quality** — One sprint is noise; use planned vs unplanned breakdown and trends.
- **Unplanned spillover as failure** — Mid-sprint adds (bugs, support) are reality; show cause (Bug/Support/Feature), not blame.

### Example: misuse vs correct interpretation

- **Misuse:** “Team A has lower predictability % than Team B, so Team A is underperforming.”  
- **Correct:** “Team A had more unplanned spillover (bugs/support). Check scope-change cause and sprint hygiene before comparing predictability.”

## Troubleshooting

### "Missing required Jira credentials" Error
- Ensure `.env` file exists and contains `JIRA_HOST`, `JIRA_EMAIL`, and `JIRA_API_TOKEN`
- Verify the API token is valid and not expired
- Check that the email matches your Jira account

### "Failed to fetch boards" Error
- Verify project keys (MPSA, MAS) are correct
- Ensure your Jira account has access to these projects
- Check that the projects have boards configured
- Verify your `.env` file is in the project root (not in a subdirectory)
- Check server startup logs for credential loading confirmation

### "Rate limited" Error
- The app automatically retries with exponential backoff
- Wait a moment and try again
- Consider reducing the date range to fetch less data

### No Data in Preview
- Verify sprints exist in the selected date range
- Check that stories are marked as "Done" in Jira
- Ensure stories belong to the selected projects
- Try enabling "Include Active/Missing End Date Sprints" if sprints are missing end dates
- Check server logs for detailed error messages
- Large date ranges or many sprints may take several minutes to process

### Date Timezone Issues
- All dates are handled in UTC
- The UI shows both UTC and local time for reference
- Ensure your date inputs are correct for your timezone

## Environment Modes

VodaAgileBoard behaves slightly differently depending on which environment variables you set:

- **Local development (no auth, default)**:
  - Set Jira variables and (optionally) `PORT`, but **do not** set `SESSION_SECRET` or any `APP_LOGIN_*` values.
  - Visit `http://localhost:3000/report` directly; `/` redirects to `/report` for a fast feedback loop.
- **Local development (auth enabled)**:
  - In addition to Jira variables, set `SESSION_SECRET`, `APP_LOGIN_USER`, and `APP_LOGIN_PASSWORD`.
  - Visit `http://localhost:3000`; you will see the login screen, and `/report` plus the APIs require a valid session.
- **CI (GitHub Actions)**:
  - CI runs `npm run test:all` with a controlled set of environment variables.
  - Recommended: keep auth disabled in CI by omitting `SESSION_SECRET`, so most tests remain simple and deterministic.
- **Production (Render)**:
  - Always set `SESSION_SECRET`, `APP_LOGIN_USER`, `APP_LOGIN_PASSWORD`, Jira variables, and `NODE_ENV=production` from the Render dashboard.
  - End users always experience the login page plus honeypot, rate limiting, and session timeout before they reach `/report`.

## Environment Variables

- `JIRA_HOST`: Your Jira instance URL (e.g., `https://your-domain.atlassian.net`)
- `JIRA_EMAIL`: Your Jira account email
- `JIRA_API_TOKEN`: Your Jira API token
- `APP_LOGIN_USER`: Username for app login (required when auth is enabled)
- `APP_LOGIN_PASSWORD`: Password for app login (required when auth is enabled)
- `SESSION_SECRET`: Secret for signing session cookies (required when auth is enabled)
- `PORT`: Server port (default: 3000)
- `LOG_LEVEL`: Logging level - `DEBUG`, `INFO`, `WARN`, `ERROR` (default: `INFO`)
- `NODE_ENV`: Environment - `development` or `production`

## Deployment

VodaAgileBoard can be deployed to [Render](https://render.com) or any Node host.

1. Connect your Git repo (e.g. GitHub) to Render and create a Web Service.
2. Set **Build command** to `npm install` (or `npm ci`) and **Start command** to `npm start`.
3. Add all environment variables in the Render dashboard: `JIRA_HOST`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `APP_LOGIN_USER`, `APP_LOGIN_PASSWORD`, `SESSION_SECRET`, `NODE_ENV=production`.
4. Optional: use a [Blueprint](https://render.com/docs/infrastructure-as-code) by adding `render.yaml` at the repo root; validate with `render blueprints validate`. Deploy via Render CLI: `render deploys create <SERVICE_ID> --confirm`.

### Live instance

After the first deploy succeeds, your app will be available at a URL like `https://voda-agile-board.onrender.com`. Update this README with your actual live URL.

### CI/CD

Tests run on push via GitHub Actions (when configured). Deploys are triggered by Render on push to `main` (Git-backed), or by running the Render CLI in CI with `RENDER_API_KEY` and `RENDER_SERVICE_ID`.

## License

MIT

## Support

For issues or questions, please check the troubleshooting section above or review the error messages in the application UI.
