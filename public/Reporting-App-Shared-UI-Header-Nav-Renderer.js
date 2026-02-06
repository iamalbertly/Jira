/* Shared Header Renderer
 * Ensures consistent header layout and wires feedback FAB and toggle into header.
 */
import { initFeedbackPanel } from './Reporting-App-Report-UI-Feedback.js';
import { getContextDisplayString } from './Reporting-App-Shared-Context-From-Storage.js';

export function ensureSharedHeader() {
  try {
    // Ensure header has expected structure and classes
    const header = document.querySelector('header');
    if (!header) return;

    header.classList.add('app-header');

    // Context bar: one line showing current projects and date range (SSOT / last query)
    let contextBar = header.querySelector('[data-context-bar]');
    if (!contextBar) {
      contextBar = document.createElement('div');
      contextBar.setAttribute('data-context-bar', 'true');
      contextBar.className = 'subtitle';
      contextBar.style.cssText = 'margin: 0.25rem 0 0; font-size: 0.875rem; color: #6c757d;';
      const row = header.querySelector('.header-row');
      if (row) row.after(contextBar);
      else header.appendChild(contextBar);
    }
    contextBar.textContent = getContextDisplayString();

    /**
     * Call after persisting last query (e.g. after successful preview) to update the bar without reload.
     */
    window.__refreshReportingContextBar = function refreshContextBar() {
      const bar = document.querySelector('header [data-context-bar]');
      if (bar) bar.textContent = getContextDisplayString();
    };

    // Ensure feedback toggle exists and is positioned in header-row right side
    let feedbackToggle = document.getElementById('feedback-toggle');
    if (!feedbackToggle) {
      feedbackToggle = document.createElement('button');
      feedbackToggle.id = 'feedback-toggle';
      feedbackToggle.className = 'btn btn-secondary btn-compact';
      feedbackToggle.textContent = 'Give Feedback';
      feedbackToggle.title = 'Send feedback (press f)';
      // Append to header-row if present, else header
      const row = header.querySelector('.header-row');
      if (row) row.appendChild(feedbackToggle);
      else header.appendChild(feedbackToggle);
    } else {
      // Ensure button has consistent classes
      feedbackToggle.classList.add('btn', 'btn-secondary', 'btn-compact');
    }

    // Initialize feedback panel behavior (idempotent)
    initFeedbackPanel();

    // Ensure FAB exists for mobile
    let fab = document.getElementById('feedback-fab');
    if (!fab) {
      fab = document.createElement('button');
      fab.id = 'feedback-fab';
      fab.className = 'feedback-fab';
      fab.title = 'Send feedback';
      fab.type = 'button';
      fab.textContent = '✉';
      document.body.appendChild(fab);
      fab.addEventListener('click', () => {
        const panel = document.getElementById('feedback-panel');
        if (panel) panel.style.display = 'block';
      });
    }

    // Mark header as unified for styling hooks
    header.setAttribute('data-shared-header', 'true');
  } catch (e) {
    // ignore; header enhancements are progressive
  }
}

// Auto-run on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', ensureSharedHeader);
} else {
  ensureSharedHeader();
}
