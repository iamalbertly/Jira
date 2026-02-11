/**
 * Export Dashboard Component
 * Copy as Text, Markdown, Share URL, Email options
 */

import { formatDate } from './Reporting-App-Shared-Format-DateNumber-Helpers.js';
import { exportRisksInsightsAsMarkdown } from './Reporting-App-CurrentSprint-Risks-Insights.js';

export function renderExportButton(inline = false) {
  const containerClass = 'export-dashboard-container' + (inline ? ' header-export-inline' : '');
  let html = '<div class="' + containerClass + '">';
  html += '<button class="btn btn-secondary btn-compact export-dashboard-btn" type="button" aria-label="Export sprint dashboard" aria-haspopup="true" aria-expanded="false" aria-live="polite">Export ?</button>';
  html += '<div class="export-menu hidden" id="export-menu" role="menu">';
  html += '<button class="export-option" data-action="copy-text" role="menuitem">Copy as Text</button>';
  html += '<button class="export-option" data-action="export-markdown" role="menuitem">Markdown</button>';
  html += '<button class="export-option" data-action="copy-link" role="menuitem">Copy link</button>';
  html += '<button class="export-option" data-action="email" role="menuitem">Email</button>';
  html += '</div>';
  html += '</div>';
  return html;
}

function setButtonStatus(btn, text, originalText, disabled = false, resetAfterMs = 2000) {
  btn.textContent = text;
  btn.disabled = disabled;
  if (!originalText) return;
  window.setTimeout(() => {
    btn.textContent = originalText;
    btn.disabled = false;
  }, resetAfterMs);
}

async function writeTextToClipboardWithFallback(text) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    await navigator.clipboard.writeText(text);
    return;
  }

  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', 'true');
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  ta.style.top = '0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(ta);
  if (!ok) throw new Error('Clipboard copy unavailable');
}

export function wireExportHandlers(data) {
  const container = document.querySelector('.export-dashboard-container');
  if (!container) return;

  const btn = container.querySelector('.export-dashboard-btn');
  const menu = container.querySelector('#export-menu');
  if (!btn || !menu) return;

  btn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    menu.classList.toggle('hidden');
    const expanded = !menu.classList.contains('hidden');
    btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  });

  document.addEventListener('click', (event) => {
    if (!container.contains(event.target) && !menu.classList.contains('hidden')) {
      menu.classList.add('hidden');
      btn.setAttribute('aria-expanded', 'false');
    }
  });

  const options = container.querySelectorAll('.export-option');
  options.forEach((option) => {
    option.addEventListener('click', () => {
      const action = option.dataset.action;
      menu.classList.add('hidden');
      btn.setAttribute('aria-expanded', 'false');

      if (action === 'copy-text') {
        copyDashboardAsText(data, btn);
      } else if (action === 'export-markdown') {
        exportDashboardAsMarkdown(data, btn);
      } else if (action === 'copy-link') {
        copyDashboardLink(data, btn);
      } else if (action === 'email') {
        emailDashboard(data, btn);
      }
    });
  });
}

async function copyDashboardAsText(data, btn) {
  const originalText = btn.textContent;
  setButtonStatus(btn, 'Copying...', null, true);

  try {
    const sprint = data.sprint || {};
    const summary = data.summary || {};
    const stuck = data.stuckCandidates || [];

    let text = `Sprint: ${sprint.name || 'N/A'}\n`;
    text += `Dates: ${formatDate(sprint.startDate) || 'N/A'} - ${formatDate(sprint.endDate) || 'N/A'}\n\n`;
    text += `Stories: ${summary.doneStories || 0} of ${summary.totalStories || 0} done\n`;
    text += `Story Points: ${summary.doneSP || 0} of ${summary.totalSP || 0} (${summary.percentDone || 0}%)\n`;

    if (stuck.length > 0) {
      text += `\nStuck Items (${stuck.length}):\n`;
      stuck.forEach((item) => {
        text += `  - ${(item && item.key) || 'N/A'}: ${(item && item.summary) || 'N/A'} (${(item && item.hoursInStatus) ?? 'N/A'}h)\n`;
      });
    }

    await writeTextToClipboardWithFallback(text);
    setButtonStatus(btn, 'Copied!', originalText);
  } catch (error) {
    console.error('Copy text error:', error);
    setButtonStatus(btn, 'Copy failed', originalText);
  }
}

async function exportDashboardAsMarkdown(data, btn) {
  const originalText = btn.textContent;
  setButtonStatus(btn, 'Generating...', null, true);

  try {
    const sprint = data.sprint || {};
    const summary = data.summary || {};

    let markdown = `# Sprint: ${sprint.name || 'N/A'}\n\n`;
    markdown += `**Date:** ${formatDate(sprint.startDate) || 'N/A'} -> ${formatDate(sprint.endDate) || 'N/A'}\n`;
    markdown += `**Date Generated:** ${new Date().toLocaleString()}\n\n`;

    markdown += '## Overview\n';
    markdown += `- **Stories:** ${summary.doneStories || 0} of ${summary.totalStories || 0} done\n`;
    markdown += `- **Story Points:** ${summary.doneSP || 0} of ${summary.totalSP || 0} done (${summary.percentDone || 0}%)\n`;
    markdown += `- **New Features:** ${summary.newFeaturesSP || 0} SP\n`;
    markdown += `- **Support & Ops:** ${summary.supportOpsSP || 0} SP\n\n`;

    const tracking = data.subtaskTracking || {};
    const trackingSummary = tracking.summary || {};
    markdown += '## Sub-task Tracking\n';
    markdown += `- **Estimated:** ${trackingSummary.totalEstimateHours || 0} hours\n`;
    markdown += `- **Logged:** ${trackingSummary.totalLoggedHours || 0} hours\n`;
    markdown += `- **Remaining:** ${trackingSummary.totalRemainingHours || 0} hours\n\n`;

    const stuck = data.stuckCandidates || [];
    if (stuck.length > 0) {
      markdown += '## Stuck Items (>24h)\n';
      stuck.forEach((item) => {
        markdown += `- ${(item && item.key) || 'N/A'}: ${(item && item.summary) || 'N/A'} (${(item && item.hoursInStatus) ?? 'N/A'} hours)\n`;
      });
      markdown += '\n';
    }

    markdown += exportRisksInsightsAsMarkdown(data);

    const blob = new Blob([markdown], { type: 'text/markdown' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `sprint-${sprint.name || 'export'}.md`;
    link.click();
    URL.revokeObjectURL(link.href);

    setButtonStatus(btn, 'Exported!', originalText);
  } catch (error) {
    console.error('Markdown export error:', error);
    setButtonStatus(btn, 'Export failed', originalText);
  }
}

async function copyDashboardLink(data, btn) {
  try {
    const sprint = data.sprint || {};
    const baseUrl = window.location.origin;
    const currentPath = window.location.pathname;
    const boardSelect = document.querySelector('#board-select');
    const boardId = boardSelect?.value;

    let url = baseUrl + currentPath;
    if (boardId) {
      url += '?board=' + boardId + '&sprint=' + (sprint.id || '');
    }

    await writeTextToClipboardWithFallback(url);
    setButtonStatus(btn, 'Link copied!', btn.textContent, false);
  } catch (error) {
    console.error('Copy link error:', error);
    setButtonStatus(btn, 'Copy failed', btn.textContent, false);
  }
}

async function emailDashboard(data, btn) {
  const originalText = btn.textContent;
  setButtonStatus(btn, 'Sending...', null, true);

  try {
    const sprint = data.sprint || {};
    const response = await fetch('/api/current-sprint/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sprintId: sprint.id,
        sprintName: sprint.name,
      }),
    });

    if (response.ok) {
      setButtonStatus(btn, 'Sent!', originalText);
    } else {
      setButtonStatus(btn, 'Send failed', originalText);
    }
  } catch (error) {
    console.error('Email error:', error);
    setButtonStatus(btn, 'Email unavailable', originalText);
  }
}
