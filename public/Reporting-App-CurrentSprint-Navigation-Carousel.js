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

  if (sprints.length === 0) {
    return '';
  }

  let html = '<div class="sprint-carousel-container">';
  html += '<div class="sprint-carousel" role="tablist" aria-label="Sprint navigation">';

  sprints.slice(0, 8).forEach(sprint => {
    const isActive = sprint.id === currentSprint.id;
    const isOpen = (sprint.state || '').toLowerCase() === 'active';
    const isClosed = (sprint.state || '').toLowerCase() === 'closed';

    // Extract completion percentage from sprint (you'll need to calculate this)
    // For now, using a default calculation
    const completionPercent = sprint.completionPercent || 0;
    let completionColor = 'gray'; // 0-49%
    if (completionPercent >= 100) {
      completionColor = 'green';
    } else if (completionPercent >= 50) {
      completionColor = 'yellow';
    }
    if (isClosed && completionPercent < 100) {
      completionColor = 'muted';
    }

    const sprintName = sprint.name || ('Sprint ' + sprint.id);
    const startDate = sprint.startDate ? formatDate(sprint.startDate) : '-';
    const endDate = sprint.endDate ? formatDate(sprint.endDate) : '-';
    const tooltip = `${sprintName}\nStart: ${startDate}\nEnd: ${endDate}\nCompletion: ${completionPercent}%`;

    html += '<button class="carousel-tab ' + (isActive ? 'active' : '') + ' ' + completionColor + '" ';
    html += 'type="button" ';
    html += 'role="tab" ';
    html += 'aria-selected="' + (isActive ? 'true' : 'false') + '" ';
    html += 'data-sprint-id="' + sprint.id + '" ';
    html += 'title="' + escapeHtml(tooltip) + '">';

    html += '<span class="carousel-tab-name">' + escapeHtml(sprintName) + '</span>';
    html += '<span class="carousel-tab-dates">' + startDate + ' → ' + endDate + '</span>';

    // Health indicator
    html += '<div class="carousel-health-indicator" style="width: ' + completionPercent + '%;" role="img" aria-label="' + completionPercent + '% complete"></div>';

    // Status chip
    if (isOpen) {
      html += '<span class="carousel-status current">Current</span>';
    } else if (isClosed) {
      html += '<span class="carousel-status closed">Closed</span>';
    }

    // Completion percentage
    html += '<span class="carousel-completion">' + completionPercent + '%</span>';

    html += '</button>';
  });

  html += '</div>';
  html += '<div class="carousel-legend">';
  html += '<span class="legend-item"><span class="legend-dot green"></span>100% Complete</span>';
  html += '<span class="legend-item"><span class="legend-dot yellow"></span>50-99% Complete</span>';
  html += '<span class="legend-item"><span class="legend-dot gray"></span>0-49% Complete</span>';
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

  tabs.forEach((tab, idx) => {
    tab.addEventListener('click', () => {
      const sprintId = tab.dataset.sprintId;
      if (sprintId && onSprintSelect) {
        onSprintSelect(sprintId);
      }

      // Update active state
      tabs.forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');

      // Scroll tab into view
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
