# Project Jira Reporting UX Reliability Customer Simplicity Trust 11-Todo Execution Plan

## Why this plan exists
The current product has strong intent but inconsistent execution in three places users feel immediately:
1. **Customer:** mobile and tablet users are blocked by clipped layouts, hidden content, and unclear state transitions.
2. **Simplicity:** duplicated CSS and split ownership of layout behavior increase regression risk and force high cognitive load for every change.
3. **Trust:** tests currently validate some happy paths, but they under-detect viewport clipping and state drift in real interaction sequences.

This plan prioritizes outcomes over output. We focus on what creates user confidence quickly without large functionality removals and under zero budget constraints (reuse existing architecture, test tooling, and deployment path).

## Decision standard used
For each item, we choose the option with the best **risk-adjusted reliability per unit of effort**:
- Prefer consolidation over rewrite.
- Prefer detection improvements before adding features.
- Prefer single-source behavior ownership to avoid circular duplication.
- Prefer fail-fast automation and observable UI state at each step.

---

## 11 prioritized to-dos with rationale and best-option decisions

### 1) Establish one owner for shell layout behavior (sidebar + container offset + responsive collapse)
- **Problem:** Layout control is distributed across multiple CSS files, causing breakpoint conflicts and left whitespace/cutoff on smaller screens.
- **Best option selected:** Keep sidebar ownership in a navigation-specific stylesheet and keep container/header ownership in layout stylesheet, with explicit breakpoint contract.
- **Rationale:** Lowest risk change that preserves existing functionality while removing cross-file override roulette.
- **Deliverable:** One authoritative breakpoint contract and no duplicate mobile collapse rules in non-sidebar files.

### 2) Normalize responsive breakpoints to product reality (mobile, tablet, desktop)
- **Problem:** Current `768px` threshold does not match actual interaction constraints; tablet widths still behave like desktop and clip.
- **Best option selected:** Treat `<=1200px` as compact navigation mode and stacked content layout for report shell.
- **Rationale:** User screenshots show clipping in non-phone widths; fixing only phone is insufficient and violates Customer value.
- **Deliverable:** Consistent behavior at `320/375/390/768/1024/1366`.

### 3) Remove hidden horizontal overflow debt in primary containers
- **Problem:** `scrollWidth <= viewport` checks pass while key elements are still shifted or partially off-screen.
- **Best option selected:** Add geometric clipping assertions (`getBoundingClientRect`) for core containers in tests.
- **Rationale:** Prevents false positives and directly measures what users can see.
- **Deliverable:** Shared helper for clipping detection reused across specs.

### 4) Tighten desktop information density without deleting content
- **Problem:** Desktop view has large dead zones; users must scan too much to find actions.
- **Best option selected:** Improve column/grid balance, card spacing, and max widths while keeping all information and export controls.
- **Rationale:** Improves discoverability and perceived speed without functional regressions.
- **Deliverable:** Reduced whitespace imbalance and stronger scan path from filters to preview to export.

### 5) Enforce CSS source-of-truth workflow (`public/css/*` -> built `styles.css`)
- **Problem:** Built artifact and source partials can diverge; accidental direct edits are high risk.
- **Best option selected:** Keep generation script as SSOT gate and add validation that build marker exists.
- **Rationale:** Zero-cost reliability control; no new infra required.
- **Deliverable:** Deterministic CSS build and CI/test failure on drift.

### 6) Reduce duplication by moving unrelated concerns out of oversized files
- **Problem:** Mixed concerns (sidebar + feedback panel + layout) increase regression blast radius.
- **Best option selected:** Move modal/feedback styles to modal-focused stylesheet; preserve selectors and behavior.
- **Rationale:** Separation of concerns without functionality loss.
- **Deliverable:** Cleaner ownership boundaries and smaller files where feasible.

### 7) Introduce stage-level realtime UI validation in Playwright tests
- **Problem:** Tests validate endpoints but not enough runtime UI state transitions.
- **Best option selected:** Validate UI geometry + key selectors after every major interaction step and track telemetry continuously.
- **Rationale:** Catches stalling, hidden action states, and rendering drifts earlier.
- **Deliverable:** New spec using stepwise assertions and telemetry checks.

### 8) Add logcat-equivalent browser diagnostics to acceptance tests
- **Problem:** Failures can hide in console/page/request errors even when DOM assertions pass.
- **Best option selected:** Treat console errors, page errors, and request failures as first-class signals in test assertions.
- **Rationale:** Browser telemetry is the closest web equivalent to logcat under current stack.
- **Deliverable:** Mandatory telemetry-clean assertions after each stage.

### 9) Upgrade orchestration to include new critical validation suite
- **Problem:** New tests are not valuable if they are not part of the automatic runner.
- **Best option selected:** Register new spec in existing fail-fast test orchestration sequence.
- **Rationale:** Uses existing engine and preserves “terminate on first failure” requirement.
- **Deliverable:** New step added to orchestration SSOT.

### 10) Formalize deletion candidates without destructive cleanup
- **Problem:** Orphan files can reintroduce confusion and accidental imports.
- **Best option selected:** Keep no-risk quarantine naming pattern (`DeleteThisFile_`) only after usage validation.
- **Rationale:** Meets safety requirement: no nuclear deletion, preserves rollback path.
- **Deliverable:** Explicitly prefixed deletion candidates (e.g., stale style artifacts) once proven unused.

### 11) Release discipline: build, validate, commit, push, and trigger deploy
- **Problem:** Reliability improvements are incomplete until they are reproducible through release flow.
- **Best option selected:** Foreground run of build + fail-fast tests + commit/push to deployment branch.
- **Rationale:** Maintains transparency and ensures operational trust.
- **Deliverable:** Passing validation evidence, commit history, and push/deploy attempt output.

---

## 3 realistic bonus edge-case solutions to include

### A) Sidebar open state race during viewport resize
- **Risk:** User rotates device or resizes browser while sidebar is open, leaving body scroll lock active and content inaccessible.
- **Solution:** On every resize crossing breakpoint, force-close sidebar, clear backdrop, and remove scroll lock class.

### B) Sticky header + notification dock interaction
- **Risk:** Secondary fixed overlays can occlude preview controls or create phantom whitespace.
- **Solution:** Add explicit z-index contract and container offset checks in responsive tests at small and large widths.

### C) Auth-redirect environment in tests causing false pass/fail
- **Risk:** In authenticated environments, tests silently skip important assertions or fail on expected redirects.
- **Solution:** Keep explicit redirect guards with reasoned skip paths and ensure non-auth layout assertions still run where possible.

---

## Validation model to defend quality decisions

### What “working” means
- No clipped primary containers at target viewports.
- No left gutter offset regression on mobile/tablet.
- No unexpected browser console/page/request failures during core journeys.
- Existing flows (preview, export controls, tab navigation) remain intact.

### Why this is the best option under zero budget
- Reuses existing Playwright stack, helpers, and orchestration.
- Avoids expensive rewrites and retains current business behavior.
- Converts invisible layout debt into measurable test failures.
- Improves maintainability through concern boundaries, not framework churn.

### What we intentionally do not do now
- No full UI redesign rewrite.
- No backend contract changes unless required by failing validations.
- No mass file deletion without validated non-usage.

---

## Build and deploy execution checklist
1. Build CSS from partials.
2. Run targeted responsive + journey validations (fail-fast).
3. Run orchestration suite step that includes new validation test.
4. Fix any failing stage and rerun until green.
5. Commit with traceable message.
6. Push to remote to trigger deployment.
7. Confirm deployment route availability.

This plan is intentionally execution-heavy: it emphasizes measurable outcomes and regression prevention so customer trust increases with each release, not just after large rewrites.
