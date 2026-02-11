# Outcome-First & First-Paint Validation Plan

This document records the **13 validation to-dos**, **3 bonus edge cases**, rationale for decisions, and how automated tests validate the behaviour. Values: **Customer**, **Speed**, **Simplicity**, **Trust**.

---

## 13 Validation To-Dos (Implemented)

1. **Report first-paint context line** – `#report-context-line` is visible on load and shows either "No report run yet", "Last: …", or "Projects: … · …" so the main area is never blank (Trust, Simplicity).
2. **Empty sessionStorage** – When there is no last-run, context line shows "No report run yet" (or equivalent placeholder). Validated by clearing sessionStorage and reloading (Trust).
3. **Preview button and context line present** – Report page shows both `#preview-btn` and `#report-context-line`; telemetry clean (Speed, Simplicity).
4. **Context line cleared after preview** – When preview runs successfully, `#report-context-line` is cleared and "Load latest" wrap is hidden so the outcome lives in the preview area (Simplicity, SSOT).
5. **Login page outcome and trust lines** – On `/login`, `.login-outcome-line` and `.login-trust-line` are visible with outcome-first copy ("Sprint risks and delivery in under 30 seconds", "Session-secured. Internal use only.") (Customer, Trust).
6. **Report sidebar context** – Sidebar or global nav is present; when `#sidebar-context-card` exists it reflects context/freshness (Trust).
7. **Last-run freshness** – When session has last-run data, context line or sidebar shows freshness (e.g. "Generated N min ago") (Trust, Speed).
8. **Current-sprint load and telemetry** – `/current-sprint` loads without critical console/request errors; `skipIfRedirectedToLogin` used so tests don’t fail when auth redirects (Speed, Simplicity).
9. **Leadership load and telemetry** – `/sprint-leadership` loads clean (Speed).
10. **Auto-preview on load** – When a valid last query and last-run exist and the Preview button is enabled, init schedules a single auto-preview after 1s so returning users see data quickly (Speed, Customer).
11. **"Load latest" CTA** – When context line is "No report run yet", a "Load latest" control is shown; clicking it triggers Preview so users get data in one click (Speed, Simplicity).
12. **Rollout of `skipIfRedirectedToLogin`** – Mobile Responsive and Current Sprint Health specs use the shared helper instead of inline login/root checks; single place to adjust behaviour (Simplicity, maintainability).
13. **Outcome-First First-Paint validation spec** – New Playwright spec `Jira-Reporting-App-Outcome-First-First-Paint-Validation-Tests.spec.js` runs UI assertions and `captureBrowserTelemetry` / `assertTelemetryClean` at every step; registered in `Jira-Reporting-App-Test-Orchestration-Steps.js` so the orchestration runner runs it (Trust, automation).

---

## 3 Bonus Edge Cases (In Scope)

1. **Stale last-run still shows freshness** – Even when data is >15 min old, the context bar shows "Generated N min ago" (or "Data may be stale") so users know recency at a glance. Implemented via `getLastMetaFreshnessInfo()` and sidebar context card; tests assert context line or sidebar content when last-run exists.
2. **Empty sessionStorage** – If the user has never run a report or cleared storage, `#report-context-line` shows "No report run yet" and the "Load latest" button is visible. Test: clear sessionStorage, reload report, assert placeholder and optional "Load latest" (or that Preview is available).
3. **Redirect-to-login skips** – When auth is enabled and the app redirects to login, tests that depend on report/current-sprint content call `skipIfRedirectedToLogin(page, test, { currentSprint: true })` and skip instead of failing; avoids false failures in CI when credentials differ (Trust in test reliability).

---

## Rationale for Key Decisions

- **Auto-preview delay 1s** – Gives the DOM and filters time to settle; avoids double-firing with filter-change debounce. Chosen over 0ms (race risk) and 3s+ (slower perceived speed).
- **"Load latest" as a button next to context line** – Keeps the main CTA (Preview in filters) as SSOT; "Load latest" is a convenience for the empty state only. Hiding it after preview keeps the UI simple.
- **Single Outcome-First First-Paint spec** – One spec file with multiple tests keeps first-paint and outcome assertions together; orchestration runs it early (after CSS Build) so failures surface before heavier suites.
- **Telemetry (logcat-style) at every step** – `captureBrowserTelemetry` + `assertTelemetryClean` ensures no unexpected console errors, page errors, or critical request failures at each step; aligns with "real-time logs" validation.

---

## How Tests Validate

- **Playwright** navigates to `/report`, `/current-sprint`, `/login`, `/sprint-leadership` and asserts visibility and text of `#report-context-line`, `.login-outcome-line`, `.login-trust-line`, `#sidebar-context-card`, and nav.
- **Browser telemetry** is captured before actions and asserted clean after each meaningful step; failures indicate console errors, uncaught exceptions, or non-ignored failed requests.
- **Orchestration** runs the new spec as a dedicated step; the runner uses `--max-failures=1` so the first failing test stops the run for fast feedback.
- **skipIfRedirectedToLogin** – Tests that would otherwise fail on login redirect call the helper and skip with a clear reason, so the same spec works in both auth-on and auth-off environments.

---

## Files Touched

- `public/report.html` – Added `#report-load-latest-wrap` and "Load latest" button.
- `public/Reporting-App-Report-Page-Init-Controller.js` – Context line, Load latest visibility/wire-up, auto-preview on load when last-run exists.
- `public/Reporting-App-Report-Page-Render-Preview.js` – Clear context line and hide Load latest wrap when preview is shown.
- `public/css/04-filters-report.css` – Styles for `.report-load-latest-wrap` and `.link-style` (Load latest button).
- `tests/Jira-Reporting-App-Outcome-First-First-Paint-Validation-Tests.spec.js` – New spec (telemetry + UI per step).
- `tests/Jira-Reporting-App-Mobile-Responsive-UX-Validation-Tests.spec.js` – Use `skipIfRedirectedToLogin`.
- `tests/Jira-Reporting-App-Current-Sprint-Health-And-SSOT-Validation-Tests.spec.js` – Use `skipIfRedirectedToLogin`.
- `scripts/Jira-Reporting-App-Test-Orchestration-Steps.js` – New step: "Run Outcome-First First-Paint Validation Tests".

Build: run `npm run build:css` so `public/styles.css` includes the new CSS (prestart does this before `npm start`).
