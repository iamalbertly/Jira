/**
 * Alert/Warning Banner Component
 * Dynamic alerts for: stuck items (>24h), scope growth, burndown trend, sub-task risks
 * Color-coded: Yellow (1-2 risks), Orange (3-5 risks), Red (6+ risks or critical)
 * Dismissible with localStorage caching (4-hour TTL)
 * Rationale: Customer - Blockers discovered in <2s. Simplicity - One consistent place for alerts. Trust - Proactive warning pattern.
 */

import { escapeHtml } from './Reporting-App-Shared-Dom-Escape-Helpers.js';
import { formatNumber } from './Reporting-App-Shared-Format-DateNumber-Helpers.js';

/**
 * Build alerts array from sprint data (shared for verdict bar and banner).
 */
export function buildAlerts(data) {
  const alerts = [];
  const stuckCount = (data.stuckCandidates || []).length;
  const scopeChanges = data.scopeChanges || [];
  const summary = data.summary || {};
  const tracking = data.subtaskTracking || {};
  const totalSP = summary.totalSP ?? 0;

  // Adaptive team size calculation to tune thresholds (defaults to 1 if unknown)
  const assignees = new Set();
  (data.stories || []).forEach(s => { if (s.assignee) assignees.add(s.assignee); });
  (data.stuckCandidates || []).forEach(s => { if (s.assignee) assignees.add(s.assignee); });
  const teamSize = Math.max(1, assignees.size || 1);

  // Stuck threshold scales with team size: ~1 per 5 people
  const stuckThresholdCount = Math.max(1, Math.ceil(teamSize / 5));

  // Alert 1: Stuck items (>24h in same status)
  if (stuckCount >= stuckThresholdCount) {
    const severity = stuckCount > Math.max(5, stuckThresholdCount + 3) ? 'critical' : (stuckCount > Math.max(2, stuckThresholdCount) ? 'high' : 'medium');
    alerts.push({
      id: 'stuck-items',
      type: 'stuck',
      severity,
      icon: '⚠️',
      title: stuckCount + ' issue' + (stuckCount > 1 ? 's' : '') + ' stuck > 24h',
      message: 'Potential blockers in progress. Review and unblock immediately.',
      action: 'View Blockers',
      actionHref: '#stuck-card',
      actionData: 'view-blockers',
      color: severity === 'critical' ? 'red' : (severity === 'high' ? 'orange' : 'yellow')
    });
  }

  // Alert 2: Scope change (adaptive percent threshold based on team size)
  if (scopeChanges.length > 0 && totalSP > 0) {
    const scopeSP = scopeChanges.reduce((sum, issue) => sum + (issue.storyPoints || 0), 0);
    const scopePercent = (scopeSP / totalSP) * 100;
    // Smaller teams: be more sensitive
    const scopeThresholdHigh = teamSize <= 3 ? 8 : 15;
    const scopeThresholdMedium = teamSize <= 3 ? 4 : 5;
    if (scopePercent > scopeThresholdHigh) {
      alerts.push({
        id: 'scope-growth',
        type: 'scope',
        severity: 'high',
        icon: '📈',
        title: 'Scope growth: +' + scopePercent.toFixed(0) + '%',
        message: scopeChanges.length + ' new issues added (' + scopeSP + ' SP). Sprint commitment at risk.',
        action: 'Review Risks',
        actionHref: '#stuck-card',
        actionData: 'review-risks',
        color: 'orange'
      });
    } else if (scopePercent > scopeThresholdMedium) {
      alerts.push({
        id: 'scope-growth',
        type: 'scope',
        severity: 'medium',
        icon: '📈',
        title: 'Scope growth: +' + scopePercent.toFixed(0) + '%',
        message: scopeChanges.length + ' new items. Monitor impact on delivery.',
        action: 'Review Risks',
        actionHref: '#stuck-card',
        actionData: 'review-risks',
        color: 'yellow'
      });
    }
  }

  // Alert 3: Sub-task estimation gaps
  const trackingRows = tracking.rows || [];
  const missingEstimates = trackingRows.filter(r => !r.estimateHours || r.estimateHours === 0).length;
  if (missingEstimates > 5) {
    alerts.push({
      id: 'missing-estimates',
      type: 'estimation',
      severity: 'high',
      icon: '❌',
      title: missingEstimates + ' sub-tasks missing estimates',
      message: 'Cannot accurately forecast completion. Add estimates immediately.',
      action: 'View Sub-tasks',
      actionHref: '#subtask-tracking-card',
      color: 'red'
    });
  } else if (missingEstimates > 2) {
    alerts.push({
      id: 'missing-estimates',
      type: 'estimation',
      severity: 'medium',
      icon: '❌',
      title: missingEstimates + ' sub-tasks missing estimates',
      message: 'Reduce forecast uncertainty by adding estimates.',
      action: 'View Sub-tasks',
      actionHref: '#subtask-tracking-card',
      color: 'yellow'
    });
  }

  // Alert 4: Low time logging
  const totalLogged = trackingRows.reduce((sum, r) => sum + (r.loggedHours || 0), 0);
  const totalEstimated = trackingRows.reduce((sum, r) => sum + (r.estimateHours || 0), 0);
  if (totalEstimated > 0 && totalLogged === 0) {
    alerts.push({
      id: 'low-logging',
      type: 'logging',
      severity: 'medium',
      icon: '📝',
      title: 'No time logged on sub-tasks',
      message: 'Team members need to log hours for accurate burndown visibility.',
      action: 'View Tracking',
      actionHref: '#subtask-tracking-card',
      color: 'orange'
    });
  }

  return alerts;
}

/**
 * Single-line verdict bar: one sentence, one color, one action (Flaw 3).
 */
export function renderVerdictBar(data) {
  const alerts = buildAlerts(data);
  const first = alerts[0];
  const moreCount = alerts.length - 1;
  if (!first) {
    return '<div class="verdict-bar verdict-bar-green" role="status" aria-live="polite">' +
      '<span class="verdict-text">On Track</span>' +
      '<span class="verdict-detail">No critical risks. Review Work risks for details.</span>' +
      '</div>';
  }
  const color = first.color === 'red' ? 'red' : (first.color === 'orange' ? 'orange' : 'yellow');
  let html = '<div class="verdict-bar verdict-bar-' + color + '" role="alert" aria-live="polite">';
  html += '<span class="verdict-text">' + escapeHtml(first.title) + '</span>';
  if (moreCount > 0) {
    html += '<span class="verdict-more" data-action="expand-verdict" aria-expanded="false">+' + moreCount + ' more</span>';
  }
  html += ' <a href="' + (first.actionHref || '#stuck-card') + '" class="verdict-action btn btn-primary btn-compact">' + escapeHtml(first.action || 'View') + '</a>';
  html += '</div>';
  return html;
}

/**
 * Renders the full alert banner. Scope growth is shown only in the verdict bar (single source); exclude it here to avoid duplication.
 */
export function renderAlertBanner(data) {
  const alerts = buildAlerts(data).filter((a) => a.id !== 'scope-growth');
  if (alerts.length === 0) return '';

  // Determine overall banner severity (worst of all alerts)
  const maxSeverity = alerts.reduce((max, a) => {
    const severities = { critical: 3, high: 2, medium: 1 };
    return Math.max(max, severities[a.severity] || 0);
  }, 0);
  const severityMap = { 3: 'critical', 2: 'high', 1: 'medium' };
  const bannerSeverity = severityMap[maxSeverity] || 'medium';
  const bannerColor = bannerSeverity === 'critical' ? 'red' : (bannerSeverity === 'high' ? 'orange' : 'yellow');

  // Check if banner is dismissed (localStorage)
  const dismissKey = `alert_banner_dismissed_${data.sprint?.id || 'unknown'}`;
  const dismissedTime = localStorage.getItem(dismissKey);
  const now = Date.now();
  const fourHoursMs = 4 * 60 * 60 * 1000;
  const isDismissed = dismissedTime && (now - parseInt(dismissedTime)) < fourHoursMs;

  if (isDismissed) return '';

  let html = '<div class="alert-banner ' + bannerColor + '" role="alert" aria-live="polite">';
  html += '<div class="alert-banner-content">';

  // Alert list
  alerts.forEach((alert, idx) => {
    if (idx > 0) html += '<div class="alert-separator"></div>';
    html += '<div class="alert-item">';
    html += '<span class="alert-icon">' + alert.icon + '</span>';
    html += '<div class="alert-text">';
    html += '<strong>' + escapeHtml(alert.title) + '</strong>';
    html += '<p>' + escapeHtml(alert.message) + '</p>';
    html += '</div>';
    // Add data-action-data attribute for action handlers (backwards-compatible)
    const actionDataAttr = alert.actionData ? (' data-action="' + alert.actionData + '"') : '';
    html += '<a href="' + alert.actionHref + '" class="alert-action"' + actionDataAttr + '>' + alert.action + '</a>';
    html += '</div>';
  });

  html += '</div>';

  // Dismiss button
  html += '<button class="alert-dismiss" type="button" aria-label="Dismiss alert" title="Dismiss for 4 hours">✕</button>';
  html += '</div>';

  return html;
}

/**
 * Wire alert banner handlers
 */
export function wireAlertBannerHandlers() {
  const banner = document.querySelector('.alert-banner');
  if (!banner) return;

  const dismissBtn = banner.querySelector('.alert-dismiss');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => {
      // Get sprint ID from header data attribute if available
      const headerBar = document.querySelector('.current-sprint-header-bar');
      const sprintId = headerBar?.getAttribute('data-sprint-id') || 'unknown';

      // Store dismissal in localStorage with timestamp (store both sprint-specific and generic key for compatibility)
      const dismissKey = `alert_banner_dismissed_${sprintId}`;
      const genericKey = `alert_banner_dismissed_unknown`;
      const ts = String(Date.now());
      localStorage.setItem(dismissKey, ts);
      localStorage.setItem(genericKey, ts);

      // Hide banner with fade animation
      banner.style.animation = 'fadeOut 0.3s ease-out';
      setTimeout(() => {
        banner.style.display = 'none';
      }, 300);
    });
  }

  // Make action links scroll smoothly and wire actionData handlers
  const actionLinks = banner.querySelectorAll('.alert-action');
  actionLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const href = link.getAttribute('href');
      const actionData = link.getAttribute('data-action') || link.getAttribute('data-action-data') || link.getAttribute('data-action');
      if (actionData === 'view-blockers') {
        const target = document.querySelector('#stuck-card');
        if (target) {
          target.scrollIntoView({ behavior: 'smooth' });
          target.classList.add('highlight-flash');
          setTimeout(() => target.classList.remove('highlight-flash'), 2000);
        }
        return;
      }
      if (actionData === 'review-risks') {
        const target = document.querySelector('#stuck-card');
        if (target) {
          target.scrollIntoView({ behavior: 'smooth' });
          target.classList.add('highlight-flash');
          setTimeout(() => target.classList.remove('highlight-flash'), 2000);
        }
        return;
      }

      const target = document.querySelector(href);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });
}

/**
 * Check if alert should be shown (not dismissed)
 */
export function shouldShowAlertBanner(sprintId) {
  const dismissKey = `alert_banner_dismissed_${sprintId}`;
  const genericKey = `alert_banner_dismissed_unknown`;
  const dismissedTime = localStorage.getItem(dismissKey) || localStorage.getItem(genericKey);
  if (!dismissedTime) return true;

  const now = Date.now();
  const fourHoursMs = 4 * 60 * 60 * 1000;
  return (now - parseInt(dismissedTime)) >= fourHoursMs;
}
