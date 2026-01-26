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

3. **Configure Options** (all optional):
   - **Include Story Points**: Calculate throughput metrics
   - **Require Resolved by Sprint End**: Only include stories resolved before sprint end
   - **Include Bugs for Rework**: Calculate rework ratio
   - **Include Predictability**: Calculate committed vs delivered (approx or strict mode)
   - **Include Epic TTM**: Calculate Epic Time-To-Market
   - **Include Active/Missing End Date Sprints**: Include sprints with missing end dates

4. **Click Preview**: Generates preview data from Jira

5. **Review Tabs**:
   - **Boards**: Shows discovered boards for selected projects
   - **Sprints**: Lists sprints overlapping the date window with counts
   - **Done Stories**: Drill-down view of completed stories, grouped by sprint
   - **Metrics**: Shows calculated metrics (when enabled)
   - **Unusable Sprints**: Lists sprints excluded due to missing dates

6. **Export CSV**:
   - **Export CSV (Filtered View)**: Exports only currently visible rows (after search/filter)
   - **Export CSV (Raw Preview)**: Exports all preview data

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
- `includeStoryPoints` (optional): `true` or `false`
- `requireResolvedBySprintEnd` (optional): `true` or `false`
- `includeBugsForRework` (optional): `true` or `false`
- `includePredictability` (optional): `true` or `false`
- `predictabilityMode` (optional): `approx` or `strict` (default: `approx`)
- `includeEpicTTM` (optional): `true` or `false`
- `includeActiveOrMissingEndDateSprints` (optional): `true` or `false`

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
    }
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
2. Runs E2E user journey tests
3. Runs API integration tests
4. Terminates on first error
5. Shows all steps in foreground

### Run Specific Test Suites
```bash
# E2E tests only
npm run test:e2e

# API tests only
npm run test:api
```

### Test Coverage

- **E2E Tests**: User interface interactions, tab navigation, filtering, export
- **API Tests**: Endpoint validation, error handling, CSV generation

**Note**: Some tests may require valid Jira credentials. Tests that require Jira access will gracefully handle authentication failures.

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
│   └── Jira-Reporting-App-Server-Logging-Utility.js  # Structured logging
├── public/
│   ├── report.html           # Main UI
│   ├── report.js             # Frontend logic
│   └── styles.css           # Styling
├── tests/
│   ├── Jira-Reporting-App-E2E-User-Journey-Tests.spec.js
│   └── Jira-Reporting-App-API-Integration-Tests.spec.js
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
