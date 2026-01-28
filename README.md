# Jira Reporting App

A Node.js web application for generating sprint reports from Jira for MPSA and MAS projects. The app provides a preview-first workflow where users can configure filters, preview data in a tabbed interface, and export CSV files without re-fetching from Jira.

## Features

- **Preview-First Workflow**: Preview data before exporting to ensure accuracy
- **Multi-Project Support**: Generate reports for MPSA and MAS projects
- **Sprint Overlap Filtering**: Automatically filters sprints that overlap with the selected date window
- **Comprehensive Metrics**: Optional metrics including throughput, predictability, rework ratio, and Epic TTM
- **Flexible Export**: Export filtered or raw preview data as CSV
- **Runtime Discovery**: Automatically discovers boards and field IDs from your Jira instance
- **Error Handling**: Robust error handling with user-friendly messages and retry logic

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

Open your browser and navigate to:
```
http://localhost:3000/report
```

## Usage

### Generating a Report

1. **Select Projects**: Check MPSA and/or MAS (at least one required)

2. **Set Date Window**: 
   - Default is Q2 2025 (April 1 - June 30, 2025)
   - Adjust start and end dates as needed
   - Dates are in UTC

3. **Configure Options**:
   - **Story Points, Epic TTM, and Bugs/Rework**: Always included in reports (mandatory)
   - **Require Resolved by Sprint End** (optional): Only include stories resolved before sprint end
   - **Include Predictability** (optional): Calculate committed vs delivered (approx or strict mode)
   - **Include Active/Missing End Date Sprints** (optional): Include sprints with missing end dates

4. **Click Preview**: Generates preview data from Jira

5. **Review Tabs**:
   - **Project & Epic Level**: Shows discovered boards and all project/epic-level metrics in one consolidated view. Includes boards table, throughput metrics (per project and per issue type), rework ratio, predictability, and Epic TTM. Includes per-section CSV export button.
   - **Sprints**: Lists sprints overlapping the date window with completion counts. Shows "Total SP" and "Story Count" columns. Column labels: "Stories Completed (Total)" (all stories currently marked Done) and "Completed Within Sprint End Date" (stories resolved by sprint end date). Includes per-section CSV export button.
   - **Done Stories**: Drill-down view of completed stories, grouped by sprint. Shows Epic Key, Epic Title, and Epic Summary columns when Epic Link field is available. Epic Summary is truncated to 100 characters with full text in tooltip. Includes per-section CSV export button.
   - **Unusable Sprints**: Lists sprints excluded due to missing dates

6. **Export to Excel**:
   - **Export to Excel - All Data**: Main export button generates a comprehensive Excel workbook (.xlsx) with 5 tabs:
     - **Summary**: Key metrics, KPIs, agile maturity assessment, data quality scores, and manual enrichment guide
     - **Stories**: All done stories with business-friendly column names, Excel-compatible dates, calculated KPI columns (Work Days to Complete, Cycle Time, etc.), and manual enrichment columns (Epic ID/Name Manual, Is Rework/Bug Manual, Team Notes)
     - **Sprints**: Sprint-level metrics with throughput, predictability, and rework data
     - **Epics**: Epic TTM data with calculated lead times
     - **Metadata**: Export timestamp, date range, projects, filters applied, and data freshness
   - **File Naming**: Excel files use descriptive names: `{Projects}_{DateRange}_{ReportType}_{ExportDate}.xlsx` (e.g., `MPSA-MAS_Q2-2025_Sprint-Report_2025-01-27.xlsx`)
   - **Business-Friendly Columns**: All technical column names are mapped to business-friendly labels (e.g., `issueKey` → `Ticket ID`, `sprintStartDate` → `Sprint Start Date`)
   - **Excel-Compatible Dates**: All dates are formatted for Excel recognition, enabling date filtering, pivot tables, and formulas
   - **KPI Columns**: Pre-calculated columns include Work Days to Complete, Cycle Time, Sprint Duration, and Agile Maturity Level
   - **Manual Enrichment**: Blank columns provided for teams to fill in missing Epic IDs/Names, Rework/Bug flags, and notes
   
7. **Export CSV** (Secondary Option):
   - **Per-Section Exports**: Each tab has its own "Export CSV" button for quick single-section exports
   - **Export CSV (Filtered View)**: Exports only currently visible rows (after search/filter)
   - All CSV exports include Epic Key, Epic Title, and Epic Summary columns when Epic Link field is available

### Preview Behaviour & Feedback

- **In-flight feedback**:
  - When you click **Preview**, the button is temporarily disabled to prevent double-clicks while the loading overlay shows progress updates.
  - The loading panel includes a live timer and step log (e.g. “Collecting filter parameters”, “Sending request to server”, “Received data from server”).
- **Partial previews**:
  - If the backend has to stop early (for example due to time budget or pagination limits), the response is marked as partial.
  - The UI shows a warning banner near the preview summary and a matching hint near the export buttons. CSV exports will only contain the currently loaded data in this case.
- **Require Resolved by Sprint End**:
  - When this option is enabled, the **Done Stories** tab will explain when no rows passed this filter, and suggests turning it off or reviewing resolution vs sprint end dates in Jira.
- **Exports and table state**:
  - Export buttons remain disabled until there is at least one Done story in the preview.
  - If you change filters and end up with no rows, the empty state explains whether this is due to filters, the “Require Resolved by Sprint End” option, or genuinely no Done stories.

### Filtering Done Stories

- **Search Box**: Filter by issue key or summary (case-insensitive)
- **Project Pills**: Click project pills to filter by project
- Filters update the visible rows in real-time

## API Endpoints

### GET /report
Serves the main report page HTML.

### GET /preview.json
Generates preview data from Jira.

**Query Parameters:**
- `projects` (required): Comma-separated project keys (e.g., `MPSA,MAS`)
- `start` (optional): Start date in ISO 8601 format (default: `2025-04-01T00:00:00.000Z`)
- `end` (optional): End date in ISO 8601 format (default: `2025-06-30T23:59:59.999Z`)
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
    "windowStart": "2025-04-01T00:00:00.000Z",
    "windowEnd": "2025-06-30T23:59:59.999Z"
  }
}
```

**Response:** Excel file download (.xlsx) with filename: `{Projects}_{DateRange}_{ReportType}_{ExportDate}.xlsx`

**Response:**
```json
{
  "meta": {
    "selectedProjects": ["MPSA", "MAS"],
    "windowStart": "2025-04-01T00:00:00.000Z",
    "windowEnd": "2025-06-30T23:59:59.999Z",
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
2. Runs API integration tests
3. Runs E2E user journey tests
4. Runs UX reliability tests (validates data quality indicators, error handling, UI improvements)
5. Runs UX critical fixes tests (validates Epic Title/Summary, merged throughput, renamed labels, per-section exports, TTM definition, export loading states, button visibility)
6. Terminates on first error
7. Shows all steps in foreground with live output from each test command

### Run Specific Test Suites
```bash
# E2E tests only
npm run test:e2e

# API tests only
npm run test:api
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
- **Excel Export**: Main export generates comprehensive Excel workbook with 5 tabs (Summary, Stories, Sprints, Epics, Metadata). Files use descriptive naming: `{Projects}_{DateRange}_{ReportType}_{ExportDate}.xlsx`. All dates are Excel-compatible format, enabling filtering and formulas.
- **Business-Friendly Columns**: Technical column names mapped to business-friendly labels (e.g., `issueKey` → `Ticket ID`, `sprintStartDate` → `Sprint Start Date`) for easier analysis by leaders and analysts.
- **KPI Columns**: Pre-calculated columns include Work Days to Complete, Cycle Time (Days), Sprint Duration (Work Days), Days Since Created, and Agile Maturity Level (1-5 scale).
- **Manual Enrichment**: Excel exports include blank columns for teams to fill in: Epic ID (Manual), Epic Name (Manual), Is Rework (Manual), Is Bug (Manual), and Team Notes.
- **CSV Validation**: Client-side validation ensures required columns (issueKey, issueType, issueStatus) are present before export. CSV exports include Epic Key, Epic Title, and Epic Summary when available.
- **Export UX**: Export buttons show loading state ("Exporting..." or "Generating Excel...") and are disabled during export to prevent duplicate exports. Buttons are visible after async rendering completes.

### Test Orchestration & Playwright

- The `Jira-Reporting-App-Test-Orchestration-Runner.js` script (`npm run test:all`) runs:
  1. `npm install`
  2. Playwright API integration tests (headed)
  3. Playwright E2E user-journey tests (headed)
- Playwright is configured (via `playwright.config.js`) to:
  - Use `http://localhost:3000` as the default `baseURL` (configurable via `BASE_URL`).
  - Optionally manage the application lifecycle with `webServer` (set `SKIP_WEBSERVER=true` to run against an already running server).

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
│   └── Jira-Reporting-App-RED-LINE-ITEMS-KPI-Tests.spec.js
└── scripts/
    └── Jira-Reporting-App-Test-Orchestration-Runner.js
```

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

## Environment Variables

- `JIRA_HOST`: Your Jira instance URL (e.g., `https://your-domain.atlassian.net`)
- `JIRA_EMAIL`: Your Jira account email
- `JIRA_API_TOKEN`: Your Jira API token
- `PORT`: Server port (default: 3000)
- `LOG_LEVEL`: Logging level - `DEBUG`, `INFO`, `WARN`, `ERROR` (default: `INFO`)
- `NODE_ENV`: Environment - `development` or `production`

## License

MIT

## Support

For issues or questions, please check the troubleshooting section above or review the error messages in the application UI.
