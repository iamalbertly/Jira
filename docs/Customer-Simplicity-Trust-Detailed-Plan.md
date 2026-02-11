# Customer, Simplicity & Trust – Detailed Plan (2 pages)

This plan defines **11 to-dos** for validating and hardening the report first-paint, error recovery, and Load-latest behaviour, plus **3 bonus edge cases**, **build and deploy**, and **rationale** for chosen options. Values: **Customer**, **Simplicity**, **Trust**. All validation is done via Playwright with browser telemetry (logcat-style) and real-time UI assertions at each step.

---

## Page 1 – To-dos, rationale, edge cases

### 11 To-Dos (validation and fixes)

1. **First-paint context line** – Ensure `#report-context-line` is visible on load and shows "No report run yet", "Last: …", or "Projects: …" so the main area is never blank. *Rationale:* A blank main area undermines trust; one line sets context immediately (Trust, Simplicity).

2. **Load latest visibility** – When context is "No report run yet", "Load latest" is visible; when Preview is disabled (no projects or invalid range), "Load latest" is hidden. *Rationale:* We never show a CTA that does nothing (Customer, Simplicity).

3. **Load latest hides when loading** – When preview fetch starts, `#report-load-latest-wrap` is hidden so the user cannot double-trigger. *Rationale:* Prevents duplicate requests and confusion (Simplicity).

4. **Error recovery message** – On preview failure with no existing preview, context line shows "Preview failed. Use Load latest to retry." and "Load latest" is visible. *Rationale:* Clear path to retry without reload (Trust, Customer).

5. **Error dismiss re-show** – When the user dismisses the error panel (error-close) and no preview is visible, context line and "Load latest" are shown again. *Rationale:* Retry path remains available after dismiss (Simplicity, Trust).

6. **aria-busy on preview area** – While loading is visible, `.preview-area` has `aria-busy="true"`; when loading hides, `aria-busy="false"`. *Rationale:* Assistive tech and screen readers get correct busy state (Trust).

7. **Context line cleared after successful preview** – When preview renders, `#report-context-line` is cleared and "Load latest" is hidden so outcome lives in the preview area. *Rationale:* Single source of truth for outcome (Simplicity).

8. **Init auto-preview cancelled on filter change** – The 1s delayed auto-preview on load is cancelled when the user changes any filter. *Rationale:* User intent is not overwritten; avoids redundant request (Trust).

9. **Focus after Load latest click** – After "Load latest" triggers Preview, the Preview button receives focus for keyboard and a11y users. *Rationale:* Keeps focus in the correct control (Trust).

10. **Telemetry clean at every step** – Each Playwright step captures browser telemetry (console errors, page errors, failed requests) before actions and asserts clean after; any step can fail on UI mismatch or logcat issue. *Rationale:* Fail-fast on real-time UI and logs (Trust).

11. **Automated spec in orchestration** – A dedicated Playwright spec validates the above behaviours and is registered in `Jira-Reporting-App-Test-Orchestration-Steps.js` so the existing test runner runs it with `--max-failures=1`. *Rationale:* One place to run and maintain validation (Simplicity, Trust).

### Best-option choices and rationale

- **Single “recovery” spec vs. scattering** – One spec file (`Jira-Reporting-App-Customer-Simplicity-Trust-Recovery-Validation-Tests.spec.js`) groups error recovery, Load latest visibility, and aria-busy checks. *Rationale:* Easier to run and reason about; orchestration already runs one step per spec; adding one step is the minimal change.
- **Assert telemetry after each meaningful step** – We use `captureBrowserTelemetry(page)` before navigation/actions and `assertTelemetryClean(telemetry)` after UI assertions in each test. *Rationale:* A failure is either a UI assertion or a telemetry violation; no need for a separate “logcat” step.
- **Hide Load latest in Loading-Steps** – Hiding `#report-load-latest-wrap` in `setLoadingVisible(true)` keeps loading UX in one module. *Rationale:* Loading visibility is already the single place that shows/hides the loading state; co-locating “hide Load latest” there avoids cross-module coupling.

### 3 Bonus edge cases (realistic to scope)

1. **Stale last-run** – When data is >15 min old, the context/sidebar still shows "Generated N min ago" or "Data may be stale". Tests accept either "Last:" or "Generated" or "min ago" in context line when last-run exists. *Not remote:* Returning users often see slightly stale data; we must show recency.

2. **No projects selected** – When all project checkboxes are unchecked, Preview is disabled and "Load latest" must be hidden. Test: uncheck all projects, assert Load latest wrap is hidden and Preview is disabled. *Not remote:* Common mistake; we must not offer a dead CTA.

3. **Error shown then dismissed** – When preview fails (e.g. invalid range), error panel is shown; when user clicks Dismiss, context line and "Load latest" reappear. Test: trigger error (e.g. start > end), assert error visible; click error-close, assert context line contains "Preview failed" or "Load latest" visible. *Not remote:* Core recovery flow.

---

## Page 2 – Build, deploy, testing, orchestration

### Build and deploy (for you to validate)

- **Build:** Run `npm run build:css` so `public/styles.css` includes report context line and Load latest styles. `npm start` runs `prestart` (build:css) automatically.
- **Deploy:** Start the app with `npm start` (or your usual deploy). Base URL for Playwright is `process.env.BASE_URL || 'http://localhost:3000'`; the Playwright config starts the web server if `SKIP_WEBSERVER !== 'true'`.
- **Validation:** Run the new recovery spec:  
  `npx playwright test tests/Jira-Reporting-App-Customer-Simplicity-Trust-Recovery-Validation-Tests.spec.js --reporter=list --headed --max-failures=1 --workers=1`  
  Then run the full orchestration if desired: `npm run test:all`.

### How tests detect failures (UI + logcat)

- **UI:** Every test uses Playwright assertions (`expect(...).toBeVisible()`, `.toContainText()`, etc.) after each meaningful action. If the UI does not match (e.g. Load latest visible when it should be hidden), the assertion fails and the step fails.
- **Logcat (browser telemetry):** `captureBrowserTelemetry(page)` collects console errors, page errors, and failed requests. `assertTelemetryClean(telemetry)` throws if there are unexpected console errors, page errors, or non-ignored failed requests. So a step fails if either the UI is wrong or telemetry is dirty.
- **Order:** In each test we (1) capture telemetry, (2) perform actions (goto, click, etc.), (3) assert UI state, (4) assert telemetry clean. That way both UI and logs are validated per step.

### Automatic testing engine and filename

- The existing engine is the **orchestration runner** that executes steps from `scripts/Jira-Reporting-App-Test-Orchestration-Steps.js`. It does not auto-discover specs; each step runs a **fixed spec path**.
- To have the new validation run automatically, a **new step** is added that runs  
  `tests/Jira-Reporting-App-Customer-Simplicity-Trust-Recovery-Validation-Tests.spec.js`.  
  The filename follows the existing pattern (`Jira-Reporting-App-*-Validation-Tests.spec.js`) so it is clearly a validation spec; the runner picks it up because it is listed in `getSteps(projectRoot)`.

### Files created/updated

- **New:** `docs/Customer-Simplicity-Trust-Detailed-Plan.md` (this 2-page plan).
- **New:** `tests/Jira-Reporting-App-Customer-Simplicity-Trust-Recovery-Validation-Tests.spec.js` – Playwright spec with telemetry + UI at every step for context line, Load latest, error recovery, aria-busy, no-projects.
- **Updated:** `scripts/Jira-Reporting-App-Test-Orchestration-Steps.js` – One new step: "Run Customer Simplicity Trust Recovery Validation Tests" (after Outcome-First First-Paint).

### Summary

The 11 to-dos are implemented in the app and verified by the new spec; the 3 bonus edge cases are covered by the same spec or existing Outcome-First spec. Build and deploy steps are standard (`npm run build:css`, `npm start`). All tests use Playwright (browser) and fail on UI or telemetry violations at each step. After all tests pass, a single git commit and push seals the changes.
