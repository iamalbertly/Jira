/**
 * Export Dashboard Component
 * Generates PNG (1920x1080, 1200x800), Markdown, Share URL, Email options
 * Watermark includes sprint name + date
 * Rationale: Customer - Explicit user request for team sharing. Simplicity - One button vs. manual screenshots. Trust - Watermark prevents tampering.
 */

import { escapeHtml } from './Reporting-App-Shared-Dom-Escape-Helpers.js';
import { formatDate } from './Reporting-App-Shared-Format-DateNumber-Helpers.js';
import { exportRisksInsightsAsMarkdown } from './Reporting-App-CurrentSprint-Risks-Insights.js';

export function renderExportButton(inline = false) {
  const containerClass = 'export-dashboard-container' + (inline ? ' header-export-inline' : '');
  let html = '<div class="' + containerClass + '">';
  html += '<button class="btn btn-secondary btn-compact export-dashboard-btn" type="button" aria-label="Export sprint dashboard" aria-haspopup="true" aria-expanded="false">Export ▼</button>';
  html += '<div class="export-menu hidden" id="export-menu" role="menu">';
  html += '<button class="export-option" data-action="export-png-1920" role="menuitem">PNG (1920×1080)</button>';
  html += '<button class="export-option" data-action="export-png-1200" role="menuitem">PNG (1200×800)</button>';
  html += '<button class="export-option" data-action="export-markdown" role="menuitem">Markdown</button>';
  html += '<button class="export-option" data-action="copy-link" role="menuitem">Copy link</button>';
  html += '<button class="export-option" data-action="email" role="menuitem">Email</button>';
  html += '</div>';
  html += '</div>';
  return html;
}

/**
 * Wire export button handlers
 */
export function wireExportHandlers(data) {
  const container = document.querySelector('.export-dashboard-container');
  if (!container) return;

  const btn = container.querySelector('.export-dashboard-btn');
  const menu = container.querySelector('#export-menu');

  // Toggle menu
  btn.addEventListener('click', () => {
    menu.classList.toggle('hidden');
  });

  // Close menu on click outside
  document.addEventListener('click', (e) => {
    if (!container.contains(e.target) && !menu.classList.contains('hidden')) {
      menu.classList.add('hidden');
    }
  });

  // Menu item handlers
  const options = container.querySelectorAll('.export-option');
  options.forEach(option => {
    option.addEventListener('click', () => {
      const action = option.dataset.action;
      menu.classList.add('hidden');

      if (action.startsWith('export-png')) {
        const resolution = action === 'export-png-1920' ? { width: 1920, height: 1080 } : { width: 1200, height: 800 };
        exportDashboardAsPNG(data, resolution, btn);
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

/**
 * Export dashboard as PNG
 * Note: Requires html2canvas library
 */
async function exportDashboardAsPNG(data, resolution, btn) {
  const originalText = btn.textContent;
  btn.textContent = '⏳ Generating...';
  btn.disabled = true;

  try {
    // Check if html2canvas is available
    if (typeof html2canvas === 'undefined') {
      // Fallback: show error message
      console.warn('html2canvas not available. Attempting screenshot...');
      btn.textContent = '❌ Export unavailable';
      setTimeout(() => {
        btn.textContent = originalText;
        btn.disabled = false;
      }, 2000);
      return;
    }

    const element = document.querySelector('#current-sprint-content');
    if (!element) {
      throw new Error('Dashboard element not found');
    }

    // Hide export button and other chrome
    const exportContainer = document.querySelector('.export-dashboard-container');
    const navBar = document.querySelector('.app-nav');
    const hidden = [exportContainer, navBar];
    hidden.forEach(el => el?.style.display === 'none' ? null : (el.style.display = 'none'));

    // Generate canvas
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff'
    });

    // Restore UI
    hidden.forEach(el => el?.style.display === 'none' ? (el.style.display = '') : null);

    // Add watermark
    const ctx = canvas.getContext('2d');
    const sprint = data.sprint || {};
    const watermark = `${sprint.name} | ${new Date().toLocaleDateString()}`;
    ctx.font = '12px Arial';
    ctx.fillStyle = 'rgba(200, 200, 200, 0.5)';
    ctx.textAlign = 'right';
    ctx.fillText(watermark, canvas.width - 10, canvas.height - 10);

    // Download
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `sprint-${sprint.name || 'export'}-${Date.now()}.png`;
    link.click();

    btn.textContent = '✓ Exported!';
    setTimeout(() => {
      btn.textContent = originalText;
      btn.disabled = false;
    }, 2000);
  } catch (err) {
    console.error('PNG export error:', err);
    btn.textContent = '❌ Export failed';
    setTimeout(() => {
      btn.textContent = originalText;
      btn.disabled = false;
    }, 2000);
  }
}

/**
 * Export dashboard as Markdown
 */
async function exportDashboardAsMarkdown(data, btn) {
  const originalText = btn.textContent;
  btn.textContent = '⏳ Generating...';
  btn.disabled = true;

  try {
    const sprint = data.sprint || {};
    const summary = data.summary || {};

    let markdown = `# Sprint: ${sprint.name}\n\n`;
    markdown += `**Date:** ${formatDate(sprint.startDate)} → ${formatDate(sprint.endDate)}\n`;
    markdown += `**Date Generated:** ${new Date().toLocaleString()}\n\n`;

    markdown += `## Overview\n`;
    markdown += `- **Stories:** ${summary.doneStories || 0} of ${summary.totalStories || 0} done\n`;
    markdown += `- **Story Points:** ${summary.doneSP || 0} of ${summary.totalSP || 0} done (${summary.percentDone || 0}%)\n`;
    markdown += `- **New Features:** ${summary.newFeaturesSP || 0} SP\n`;
    markdown += `- **Support & Ops:** ${summary.supportOpsSP || 0} SP\n\n`;

    // Sub-task tracking
    const tracking = data.subtaskTracking || {};
    const trackingSummary = tracking.summary || {};
    markdown += `## Sub-task Tracking\n`;
    markdown += `- **Estimated:** ${trackingSummary.totalEstimateHours || 0} hours\n`;
    markdown += `- **Logged:** ${trackingSummary.totalLoggedHours || 0} hours\n`;
    markdown += `- **Remaining:** ${trackingSummary.totalRemainingHours || 0} hours\n\n`;

    // Stuck items
    const stuck = data.stuckCandidates || [];
    if (stuck.length > 0) {
      markdown += `## ⚠️ Stuck Items (>24h)\n`;
      stuck.forEach(item => {
        markdown += `- ${item.key}: ${item.summary} (${item.hoursInStatus} hours)\n`;
      });
      markdown += '\n';
    }

    // Risks & Insights
    markdown += exportRisksInsightsAsMarkdown(data);

    // Create download
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `sprint-${sprint.name || 'export'}.md`;
    link.click();
    URL.revokeObjectURL(link.href);

    btn.textContent = '✓ Exported!';
    setTimeout(() => {
      btn.textContent = originalText;
      btn.disabled = false;
    }, 2000);
  } catch (err) {
    console.error('Markdown export error:', err);
    btn.textContent = '❌ Export failed';
    setTimeout(() => {
      btn.textContent = originalText;
      btn.disabled = false;
    }, 2000);
  }
}

/**
 * Copy shareable dashboard link to clipboard
 */
async function copyDashboardLink(data, btn) {
  try {
    const sprint = data.sprint || {};
    const baseUrl = window.location.origin;
    const currentPath = window.location.pathname;
    const boardSelect = document.querySelector('#board-select');
    const boardId = boardSelect?.value;

    let url = baseUrl + currentPath;
    if (boardId) {
      url += '?board=' + boardId + '&sprint=' + sprint.id;
    }

    await navigator.clipboard.writeText(url);

    const originalText = btn.textContent;
    btn.textContent = '✓ Link copied!';
    setTimeout(() => {
      btn.textContent = originalText;
    }, 2000);
  } catch (err) {
    console.error('Copy link error:', err);
    btn.textContent = '❌ Copy failed';
  }
}

/**
 * Email dashboard (requires backend endpoint)
 */
async function emailDashboard(data, btn) {
  const originalText = btn.textContent;
  btn.textContent = '⏳ Sending...';
  btn.disabled = true;

  try {
    const sprint = data.sprint || {};
    const response = await fetch('/api/current-sprint/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sprintId: sprint.id,
        sprintName: sprint.name
      })
    });

    if (response.ok) {
      btn.textContent = '✓ Sent!';
    } else {
      btn.textContent = '❌ Send failed';
    }
    
    setTimeout(() => {
      btn.textContent = originalText;
      btn.disabled = false;
    }, 2000);
  } catch (err) {
    console.error('Email error:', err);
    btn.textContent = '❌ Email unavailable';
    setTimeout(() => {
      btn.textContent = originalText;
      btn.disabled = false;
    }, 2000);
  }
}
