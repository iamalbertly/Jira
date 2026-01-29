## VodaAgileBoard – Architecture & Context

### Modules & Dependencies

- **Server (`server.js`)**
  - Depends on `express`, `dotenv`, `jira.js`, and internal libs:
    - `lib/jiraClients.js` – Jira client creation
    - `lib/discovery.js` – boards/fields discovery
    - `lib/sprints.js` – sprint fetching and overlap filtering
    - `lib/issues.js` – issue fetching and drill-down row building
    - `lib/metrics.js` – throughput, done comparison, rework, predictability, epic TTM
    - `lib/csv.js` – CSV streaming for `/export`
    - `lib/cache.js` – TTL cache for preview responses
    - `lib/Jira-Reporting-App-Server-Logging-Utility.js` – structured logging
- **Frontend (`public/report.js`, `public/report.html`, `public/styles.css`)**
  - `report.html` – filters panel, preview header, tabs, and content containers
  - `report.js` – preview flow, client-side validation, tab rendering, CSV exports
- **Tests (`tests/*.spec.js`)**
  - `Jira-Reporting-App-E2E-User-Journey-Tests.spec.js` – UI and UX/user-journey coverage
  - `Jira-Reporting-App-API-Integration-Tests.spec.js` – endpoint contracts and CSV semantics
- **Scripts**
  - `scripts/Jira-Reporting-App-Test-Orchestration-Runner.js` – sequential runner for Playwright API + E2E suites

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
  - `requireResolvedBySprintEnd: boolean` **(NEW – surfaced so the UI can explain empty states)**
  - `phaseLog: Array<{ phase: string; at: string; ... }>`

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

- **E2E Playwright helpers (`Jira-Reporting-App-E2E-User-Journey-Tests.spec.js`)**
  - `runDefaultPreview(page, overrides?)` – navigates to `/report`, sets default Q2 MPSA+MAS window, applies overrides, then runs a full preview with loading state waits.
  - Reused across tests that previously duplicated “navigate → configure filters → preview → wait” sequences.
- **API integration tests (`Jira-Reporting-App-API-Integration-Tests.spec.js`)**
  - Centralised:
    - `DEFAULT_Q2_QUERY`
    - `DEFAULT_PREVIEW_URL = "/preview.json" + DEFAULT_Q2_QUERY`
  - Used for repeated preview calls and cache sanity checks.

### SIZE-EXEMPT Notes

- `server.js`
  - Marker: `// SIZE-EXEMPT: Cohesive Express server entry and preview/export orchestration kept together for operational transparency, logging, and simpler deployment without introducing additional routing layers or indirection.`
  - Rationale: Keeping startup, routing, and preview/export orchestration in one place simplifies operational debugging and avoids scattering core HTTP entry behaviour across multiple files.
- `public/report.js`
  - Marker: `// SIZE-EXEMPT: Legacy report UI controller kept as a single browser module to avoid introducing additional bundling or script loading complexity. Behaviour is cohesive around preview, tabs, and exports; future work can further split if a bundler is added.`
  - Rationale: The script is loaded directly in the browser without a bundler; splitting it into multiple files would complicate loading and ordering. Logic remains cohesive around the main report screen.
-- `lib/metrics.js`
  - Marker: `// SIZE-EXEMPT: Cohesive metrics domain logic (throughput, done comparison, rework, predictability, epic TTM) is kept in a single module to avoid scattering cross-related calculations and increasing coordination bugs.`
  - Rationale: Metrics functions are tightly related and operate over the same row data; keeping them together avoids duplicated calculations and subtle drift between separate metric modules.

