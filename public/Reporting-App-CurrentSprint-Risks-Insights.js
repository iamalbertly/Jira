/**
 * Risks & Insights Component
 * Consolidates Dependencies, Learnings, and Assumptions into single expandable card with tabs
 * Tab 1: Blockers/Dependencies (what's preventing progress)
 * Tab 2: Learnings & Discoveries (what's been learned)
 * Tab 3: Assumptions & Risks (known risks and mitigation)
 * Rationale: Customer - Narrative insights tell cohesive sprint story. Simplicity - 3 cards → 1. Trust - Transparency about challenges.
 */

import { escapeHtml } from './Reporting-App-Shared-Dom-Escape-Helpers.js';
import { formatDate } from './Reporting-App-Shared-Format-DateNumber-Helpers.js';

export function renderRisksAndInsights(data) {
  const notes = data.notes || { dependencies: [], learnings: [], updatedAt: null };
  const assumptions = data.assumptions || [];
  const stuckCandidates = data.stuckCandidates || [];
  const scopeChanges = data.scopeChanges || [];

  const dependencies = notes.dependencies || [];
  const learnings = notes.learnings || [];
  const hasDependencies = dependencies.length > 0;
  const hasLearnings = learnings.length > 0;
  const hasAssumptions = assumptions.length > 0;
  const hasStuck = stuckCandidates.length > 0;

  // Build blockers section with stuck items
  const blockersText = [];
  if (hasDependencies) {
    blockersText.push(...dependencies);
  }
  if (scopeChanges.length > 0) {
    const addedSP = scopeChanges.reduce((sum, item) => sum + (Number(item.storyPoints) || 0), 0);
    const unestimated = scopeChanges.filter((item) => item.storyPoints == null || item.storyPoints === '').length;
    blockersText.push(
      'Scope added mid-sprint: ' + scopeChanges.length + ' item' + (scopeChanges.length !== 1 ? 's' : '') +
      ', +' + addedSP.toFixed(1) + ' SP' + (unestimated ? ', ' + unestimated + ' unestimated' : '')
    );
  }

  let html = '<div class="transparency-card risks-insights-card" id="risks-insights-card">';
  html += '<h2>Risks & Insights</h2>';

  html += '<div class="insights-tabs" role="tablist" aria-label="Sprint insights">';
  html += '<button class="insights-tab active" role="tab" aria-selected="true" data-tab="blockers" aria-controls="blockers-panel">Blockers<span class="insights-tab-badge">' + blockersText.length + '</span></button>';
  html += '<button class="insights-tab" role="tab" aria-selected="false" data-tab="learnings" aria-controls="learnings-panel">Learnings<span class="insights-tab-badge">' + learnings.length + '</span></button>';
  html += '<button class="insights-tab" role="tab" aria-selected="false" data-tab="assumptions" aria-controls="assumptions-panel">Risks<span class="insights-tab-badge">' + assumptions.length + '</span></button>';
  html += '</div>';

  // Tab 1: Blockers / Dependencies
  html += '<div id="blockers-panel" class="insights-panel active" role="tabpanel" aria-labelledby="blockers-tab">';
  if (blockersText.length > 0) {
    html += '<div class="insights-content">';
    blockersText.forEach(item => {
      html += '<div class="insight-item blocker-item">';
      html += '<span class="insight-icon">🚫</span>';
      html += '<div class="insight-text">' + escapeHtml(item) + '</div>';
      html += '</div>';
    });
    html += '</div>';
    html += '<div class="insight-actions">';
    html += '<p class="insight-hint">Add recommended unblock actions:</p>';
    html += '<select id="blockers-action-type" class="insight-action-type" aria-label="Action type"><option value="">— Action type —</option><option value="Escalate">Escalate</option><option value="Reassign">Reassign</option><option value="Defer">Defer</option><option value="Custom">Custom</option></select>';
    html += '<textarea id="blockers-mitigation" rows="4" maxlength="1000" placeholder="e.g., Escalate to architecture team, Schedule review meeting" class="insight-input" aria-describedby="blockers-char-count"></textarea>';
    html += '<span id="blockers-char-count" class="insight-char-count" aria-live="polite">0 / 1000</span>';
    html += '</div>';
  } else {
    html += '<div class="insight-empty">';
    html += '<p>✅ No blockers detected. Sprint is flowing well!</p>';
    html += '</div>';
  }
  html += '</div>';

  // Tab 2: Learnings
  html += '<div id="learnings-panel" class="insights-panel" role="tabpanel" aria-labelledby="learnings-tab">';
  if (learnings.length > 0) {
    html += '<div class="insights-content">';
    learnings.forEach(item => {
      html += '<div class="insight-item learning-item">';
      html += '<span class="insight-icon">✨</span>';
      html += '<div class="insight-text">' + escapeHtml(item) + '</div>';
      html += '</div>';
    });
    html += '</div>';
    html += '<div class="insight-actions">';
    html += '<p class="insight-hint">📝 Add new learnings:</p>';
    html += '<textarea id="learnings-new" rows="4" placeholder="e.g., API integration easier than expected, Team skills improved..." class="insight-input"></textarea>';
    html += '</div>';
  } else {
    html += '<div class="insight-empty">';
    html += '<p>📚 No learnings captured yet. Document discoveries and improvements.</p>';
    html += '</div>';
  }
  html += '</div>';

  // Tab 3: Assumptions & Risks
  html += '<div id="assumptions-panel" class="insights-panel" role="tabpanel" aria-labelledby="assumptions-tab">';
  if (hasAssumptions) {
    html += '<div class="insights-content">';
    assumptions.forEach((item, idx) => {
      html += '<div class="insight-item assumption-item">';
      html += '<span class="insight-icon">👉</span>';
      html += '<div class="insight-text">' + escapeHtml(item) + '</div>';
      html += '<span class="risk-level" title="Risk level: Assumed low">Low</span>';
      html += '</div>';
    });
    html += '</div>';
  } else {
    html += '<div class="insight-empty">';
    html += '<p>✋ No assumptions documented. Consider what could go wrong.</p>';
    html += '</div>';
  }
  html += '<div class="insight-actions">';
  html += '<p class="insight-hint">🎯 Add risks and mitigation strategies:</p>';
  html += '<textarea id="assumptions-new" rows="4" placeholder="e.g., Risk: Third-party API downtime. Mitigation: Have fallback caching strategy..." class="insight-input"></textarea>';
  html += '</div>';
  html += '</div>';

  // Save button
  html += '<div class="insights-actions-bar">';
  html += '<button id="insights-save" class="btn btn-primary btn-compact" type="button">Save All Insights</button>';
  html += '<div id="insights-status" class="insights-status"></div>';
  const savedAgoText = notes.updatedAt
    ? (() => {
        const mins = Math.max(0, Math.floor((Date.now() - new Date(notes.updatedAt).getTime()) / 60000));
        return mins < 1 ? 'Just now' : (mins < 60 ? mins + 'm ago' : Math.floor(mins / 60) + 'h ago');
      })()
    : '';
  html += '<p class="insights-updated" id="insights-saved-ago"' + (savedAgoText ? '' : ' style="display: none;"') + '>Saved ' + (savedAgoText || 'just now') + '</p>';
  html += '</div>';

  html += '</div>';
  return html;
}

/**
 * Wire Risks & Insights tab navigation and handlers
 */
export function wireRisksAndInsightsHandlers() {
  const card = document.querySelector('.risks-insights-card');
  if (!card) return;

  // Tab switching
  const tabs = card.querySelectorAll('.insights-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active from all tabs and panels
      card.querySelectorAll('.insights-tab').forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      card.querySelectorAll('.insights-panel').forEach(p => {
        p.classList.remove('active');
      });

      // Add active to clicked tab
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      const tabName = tab.dataset.tab;
      const panel = card.querySelector(`#${tabName}-panel`);
      if (panel) {
        panel.classList.add('active');
      }
    });

    // Keyboard navigation
    tab.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        const nextTab = tab.nextElementSibling;
        if (nextTab?.classList.contains('insights-tab')) {
          nextTab.click();
          nextTab.focus();
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const prevTab = tab.previousElementSibling;
        if (prevTab?.classList.contains('insights-tab')) {
          prevTab.click();
          prevTab.focus();
        }
      }
    });
  });

  const blockersTa = card.querySelector('#blockers-mitigation');
  const blockersCount = card.querySelector('#blockers-char-count');
  if (blockersTa && blockersCount) {
    function updateCount() {
      const len = (blockersTa.value || '').length;
      blockersCount.textContent = len + ' / 1000';
    }
    blockersTa.addEventListener('input', updateCount);
    updateCount();
  }

  const saveBtn = card.querySelector('#insights-save');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const actionType = card.querySelector('#blockers-action-type')?.value || '';
      let blockersMitigation = card.querySelector('#blockers-mitigation')?.value || '';
      if (actionType) blockersMitigation = '[' + actionType + '] ' + blockersMitigation;
      const learningsNew = (card.querySelector('#learnings-new')?.value || '').slice(0, 1000);
      const assumptionsNew = (card.querySelector('#assumptions-new')?.value || '').slice(0, 1000);

      const payload = {
        blockerMitigation: blockersMitigation,
        newLearning: learningsNew,
        newAssumption: assumptionsNew
      };

      try {
        const response = await fetch('/api/current-sprint/insights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          const statusEl = card.querySelector('#insights-status');
          if (statusEl) {
            statusEl.textContent = '✓ Saved';
            statusEl.style.color = 'var(--accent)';
          }
          const savedAgoEl = card.querySelector('#insights-saved-ago');
          if (savedAgoEl) {
            savedAgoEl.textContent = 'Saved just now';
            savedAgoEl.style.display = 'block';
          }
          setTimeout(() => {
            if (statusEl) statusEl.textContent = '';
          }, 3000);
        } else {
          throw new Error('Failed to save insights');
        }
      } catch (err) {
        const statusEl = card.querySelector('#insights-status');
        if (statusEl) {
          statusEl.textContent = 'Error saving';
          statusEl.style.color = 'var(--danger)';
        }
      }
    });
  }
}

/**
 * Export insights as markdown
 */
export function exportRisksInsightsAsMarkdown(data) {
  const notes = data.notes || { dependencies: [], learnings: [] };
  const assumptions = data.assumptions || [];
  
  let markdown = '# Risks & Insights\n\n';

  if (notes.dependencies && notes.dependencies.length > 0) {
    markdown += '## Blockers / Dependencies\n';
    notes.dependencies.forEach(dep => {
      markdown += `- ${dep}\n`;
    });
    markdown += '\n';
  }

  if (notes.learnings && notes.learnings.length > 0) {
    markdown += '## Learnings\n';
    notes.learnings.forEach(learning => {
      markdown += `- ${learning}\n`;
    });
    markdown += '\n';
  }

  if (assumptions.length > 0) {
    markdown += '## Assumptions & Risks\n';
    assumptions.forEach(assumption => {
      markdown += `- ${assumption}\n`;
    });
    markdown += '\n';
  }

  return markdown;
}
