import { escapeHtml } from './Reporting-App-Shared-Dom-Escape-Helpers.js';

/**
 * Returns HTML for a consistent empty-state block (title, message, optional hint).
 * SSOT for empty-state structure across Report, Current Sprint, and Leadership.
 * @param {string} title - Empty state title
 * @param {string} message - Main message
 * @param {string} [hint] - Optional hint text
 * @returns {string} Safe HTML fragment for the empty-state div
 */
export function renderEmptyStateHtml(title, message, hint = '') {
  const hintHtml = (hint && String(hint).trim()) ? `<p><small>${escapeHtml(hint)}</small></p>` : '';
  return (
    '<div class="empty-state">' +
    '<p><strong>' + escapeHtml(title) + '</strong></p>' +
    '<p>' + escapeHtml(message) + '</p>' +
    hintHtml +
    '</div>'
  );
}
