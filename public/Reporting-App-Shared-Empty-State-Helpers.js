import { escapeHtml } from './Reporting-App-Shared-Dom-Escape-Helpers.js';

/**
 * Returns HTML for a consistent empty-state block (title, message, optional hint, optional CTA).
 * SSOT for empty-state structure across Report, Current Sprint, and Leadership.
 * @param {string} title - Empty state title
 * @param {string} message - Main message
 * @param {string} [hint] - Optional hint text
 * @param {string} [ctaLabel] - Optional CTA button label (e.g. "Adjust filters"); renders button with data-action="adjust-filters" or link if ctaHref provided
 * @param {{ href?: string }} [options] - Optional: href for CTA to render as link instead of button
 * @returns {string} Safe HTML fragment for the empty-state div
 */
export function renderEmptyStateHtml(title, message, hint = '', ctaLabel = '', options = {}) {
  const hintHtml = (hint && String(hint).trim()) ? `<p><small>${escapeHtml(hint)}</small></p>` : '';
  const href = options && options.href;
  const ctaHtml = (ctaLabel && String(ctaLabel).trim())
    ? href
      ? `<p><a href="${escapeHtml(href)}" class="btn btn-primary btn-compact">${escapeHtml(ctaLabel)}</a></p>`
      : `<p><button type="button" class="btn btn-primary btn-compact" data-action="adjust-filters">${escapeHtml(ctaLabel)}</button></p>`
    : '';
  return (
    '<div class="empty-state alert-info">' +
    '<p><strong>' + escapeHtml(title) + '</strong></p>' +
    '<p>' + escapeHtml(message) + '</p>' +
    hintHtml +
    ctaHtml +
    '</div>'
  );
}

/**
 * Compact, reusable data-availability summary used to explain hidden sections
 * without forcing users to inspect empty cards.
 * @param {{ title?: string, items?: Array<{label?: string, reason?: string}> }} options
 * @returns {string}
 */
export function renderDataAvailabilitySummaryHtml(options = {}) {
  const title = options.title || 'Data availability summary';
  const items = Array.isArray(options.items) ? options.items.filter(Boolean) : [];
  if (!items.length) return '';

  const chips = items
    .map((item) => {
      const label = String(item.label || '').trim();
      if (!label) return '';
      const reason = String(item.reason || '').trim();
      const source = String(item.source || '').trim();
      const sourceTag = source ? `<span class="data-availability-source">${escapeHtml(source)}</span>` : '';
      const titleAttr = reason ? ` title="${escapeHtml(reason)}"` : '';
      const reasonSuffix = reason ? `: ${escapeHtml(reason)}` : '';
      return `<li><span class="data-availability-chip"${titleAttr}>${sourceTag}${escapeHtml(label)}</span>${reasonSuffix}</li>`;
    })
    .filter(Boolean)
    .join('');
  if (!chips) return '';

  return (
    '<div class="data-availability-summary" role="status" aria-live="polite">' +
    `<strong>${escapeHtml(title)}</strong>` +
    '<ul>' + chips + '</ul>' +
    '</div>'
  );
}
