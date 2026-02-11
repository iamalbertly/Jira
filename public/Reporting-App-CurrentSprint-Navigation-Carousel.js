/**
 * Sprint Navigation Carousel Component
 * Visual quick-switch tabs showing last 8 sprints with mini health indicators
 * Keyboard navigation support (arrow keys, Enter)
 * Color-coded completion: Green (100% done), Yellow (50-99%), Gray (0-49%), Muted (closed)
 * Rationale: Customer - Fast historical comparison. Simplicity - Visual vs. text links. Trust - Visible sprint health for all.
 */

import { escapeHtml } from './Reporting-App-Shared-Dom-Escape-Helpers.js';
import { formatDate } from './Reporting-App-Shared-Format-DateNumber-Helpers.js';

export function renderSprintCarousel(data) {
  const sprints = data.recentSprints || [];
  const currentSprint = data.sprint || {};

  if (sprints.length === 0) return '';

  const maxTabs = 8;
  const slice = sprints.slice(0, maxTabs);
  const currentIdx = slice.findIndex(s => s.id === currentSprint.id);
  const hasEnoughHistory = slice.length >= 3;

  let html = '<div class="sprint-carousel-container">';

  if (hasEnoughHistory) {
    const points = slice.map(s => {
      const pct = s.completionPercent ?? 0;
      return { pct: Math.min(100, Math.max(0, pct)), sprint: s };
    });
    const maxPct = Math.max(1, ...points.map(p => p.pct));
    const w = 320;
    const h = 36;
    const pad = 4;
    const n = points.length;
    const step = n > 1 ? (w - pad * 2) / (n - 1) : 0;
    const poly = points.map((p, i) => {
      const x = pad + i * step;
      const y = h - pad - (p.pct / maxPct) * (h - pad * 2);
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    html += '<div class="carousel-sparkline-wrap" role="img" aria-label="Sprint completion trend">';
    html += '<svg class="carousel-sparkline" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">';
    html += '<polyline fill="none" stroke="var(--primary)" stroke-width="2" points="' + poly + '"/>';
    points.forEach((p, i) => {
      const x = pad + i * step;
      const y = h - pad - (p.pct / maxPct) * (h - pad * 2);
      const isActive = p.sprint.id === currentSprint.id;
      const label = (p.sprint.completionPercent == null || (p.sprint.state || '').toLowerCase() === 'closed' && p.pct === 0) ? 'No data' : (p.pct + '%');
      const r = isActive ? 6 : 4;
      html += '<circle class="sparkline-dot' + (isActive ? ' sparkline-dot-current' : '') + '" cx="' + x + '" cy="' + y + '" r="' + r + '" data-sprint-id="' + p.sprint.id + '" data-index="' + i + '"/>';
    });
    html += '</svg>';
    html += '<span class="carousel-sparkline-label">Last ' + n + ' sprints</span>';
    html += '</div>';
  } else {
    html += '<p class="carousel-limited-history"><small>Limited history</small></p>';
  }

  html += '<div class="sprint-carousel" role="tablist" aria-label="Sprint navigation">';

  slice.forEach(sprint => {
    const isActive = sprint.id === currentSprint.id;
    const isOpen = (sprint.state || '').toLowerCase() === 'active';
    const isClosed = (sprint.state || '').toLowerCase() === 'closed';
    const completionPercent = sprint.completionPercent ?? 0;
    const noData = isClosed && completionPercent === 0;
    let completionColor = 'gray';
    if (completionPercent >= 100) completionColor = 'green';
    else if (completionPercent >= 50) completionColor = 'yellow';
    if (isClosed && completionPercent < 100) completionColor = 'muted';

    const sprintName = (sprint.name || ('Sprint ' + sprint.id)).slice(0, 24) + ((sprint.name || '').length > 24 ? '…' : '');
    const startDate = sprint.startDate ? formatDate(sprint.startDate) : '-';
    const endDate = sprint.endDate ? formatDate(sprint.endDate) : '-';
    const tooltip = sprintName + '\nStart: ' + startDate + '\nEnd: ' + endDate + '\n' + (noData ? 'No data' : completionPercent + '%');

    html += '<button class="carousel-tab ' + (isActive ? 'active carousel-tab-current' : '') + ' ' + completionColor + '" ';
    html += 'type="button" role="tab" aria-selected="' + (isActive ? 'true' : 'false') + '" data-sprint-id="' + sprint.id + '" title="' + escapeHtml(tooltip) + '">';
    html += '<span class="carousel-tab-name">' + escapeHtml(sprintName) + '</span>';
    html += '<span class="carousel-tab-dates">' + startDate + ' → ' + endDate + '</span>';
    html += '<div class="carousel-health-indicator" style="width: ' + (noData ? 0 : completionPercent) + '%;" role="img" aria-label="' + (noData ? 'No data' : completionPercent + '% complete') + '"></div>';
    if (isOpen) html += '<span class="carousel-status current">Current</span>';
    else if (isClosed) html += '<span class="carousel-status closed">Closed</span>';
    html += '<span class="carousel-completion">' + (noData ? 'No data' : completionPercent + '%') + '</span>';
    html += '</button>';
  });

  html += '</div>';
  html += '<div class="carousel-legend">';
  html += '<span class="legend-item"><span class="legend-dot green"></span>100%</span>';
  html += '<span class="legend-item"><span class="legend-dot yellow"></span>50-99%</span>';
  html += '<span class="legend-item"><span class="legend-dot gray"></span>0-49%</span>';
  html += '<span class="legend-item"><span class="legend-dot muted"></span>No data</span>';
  html += '</div>';
  html += '</div>';

  return html;
}

/**
 * Wire sprint carousel handlers
 */
export function wireSprintCarouselHandlers(onSprintSelect) {
  const carousel = document.querySelector('.sprint-carousel');
  if (!carousel) return;

  const tabs = carousel.querySelectorAll('.carousel-tab');

  const container = document.querySelector('.sprint-carousel-container');
  if (container) {
    container.addEventListener('click', (e) => {
      const dot = e.target.closest('.sparkline-dot');
      if (dot && dot.dataset.sprintId) {
        const tab = carousel.querySelector('.carousel-tab[data-sprint-id="' + dot.dataset.sprintId + '"]');
        if (tab) tab.click();
      }
    });
  }

  tabs.forEach((tab, idx) => {
    tab.addEventListener('click', () => {
      const sprintId = tab.dataset.sprintId;
      if (sprintId && onSprintSelect) {
        onSprintSelect(sprintId);
      }

      tabs.forEach(t => {
        t.classList.remove('active', 'carousel-tab-current');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active', 'carousel-tab-current');
      tab.setAttribute('aria-selected', 'true');

      tab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    });

    // Keyboard navigation
    tab.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        const nextTab = tabs[idx + 1];
        if (nextTab) {
          // Move focus without triggering a click/refresh
          nextTab.focus();
          nextTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const prevTab = tabs[idx - 1];
        if (prevTab) {
          prevTab.focus();
          prevTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        tab.click();
      }
    });
  });
}
