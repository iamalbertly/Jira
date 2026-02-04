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
  if (hasStuck) {
    blockersText.push(`⚠️ ${stuckCandidates.length} issue(s) stuck > 24h - requires unblocking`);
  }

  let html = '<div class="transparency-card risks-insights-card" id="risks-insights-card">';
  html += '<h2>Risks & Insights</h2>';

  // Tab navigation
  html += '<div class="insights-tabs" role="tablist" aria-label="Sprint insights">';
  html += '<button class="insights-tab active" role="tab" aria-selected="true" data-tab="blockers" aria-controls="blockers-panel">';
  html += '📊 Blockers (' + (blockersText.length > 0 ? blockersText.length : '0') + ')';
  html += '</button>';
  html += '<button class="insights-tab" role="tab" aria-selected="false" data-tab="learnings" aria-controls="learnings-panel">';
  html += '💡 Learnings (' + (learnings.length > 0 ? learnings.length : '0') + ')';
  html += '</button>';
  html += '<button class="insights-tab" role="tab" aria-selected="false" data-tab="assumptions" aria-controls="assumptions-panel">';
  html += '⚠️ Assumptions & Risks (' + (assumptions.length > 0 ? assumptions.length : '0') + ')';
  html += '</button>';
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
    html += '<p class="insight-hint">💡 Add recommended unblock actions below:</p>';
    html += '<textarea id="blockers-mitigation" rows="4" placeholder="e.g., Escalate to architecture team, Schedule review meeting..." class="insight-input"></textarea>';
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
  if (notes.updatedAt) {
    html += '<p class="insights-updated">Last updated: ' + escapeHtml(formatDate(notes.updatedAt)) + '</p>';
  }
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

  // Save insights
  const saveBtn = card.querySelector('#insights-save');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const blockersMitigation = card.querySelector('#blockers-mitigation')?.value || '';
      const learningsNew = card.querySelector('#learnings-new')?.value || '';
      const assumptionsNew = card.querySelector('#assumptions-new')?.value || '';

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
          statusEl.textContent = '✓ Insights saved';
          statusEl.style.color = 'var(--success, green)';
          setTimeout(() => {
            statusEl.textContent = '';
          }, 3000);
        } else {
          throw new Error('Failed to save insights');
        }
      } catch (err) {
        const statusEl = card.querySelector('#insights-status');
        statusEl.textContent = '❌ Error saving insights';
        statusEl.style.color = 'var(--danger, red)';
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
