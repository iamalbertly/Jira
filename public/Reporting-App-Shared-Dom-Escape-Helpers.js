export function escapeHtml(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function safeText(value, fallback = '') {
  if (value === null || value === undefined) {
    return fallback;
  }
  const str = String(value);
  return str.trim() === '' ? fallback : str;
}

/**
 * Returns HTML for an issue key: link if issueUrl present, else escaped text.
 * @param {string} issueKey - Key to display (e.g. MPSA-123)
 * @param {string} [issueUrl] - Full Jira browse URL; when present the key is rendered as a link
 * @returns {string} Safe HTML fragment
 */
export function renderIssueKeyLink(issueKey, issueUrl) {
  const label = (issueKey || '').trim() || '-';
  const escaped = escapeHtml(label);
  const url = (issueUrl || '').trim();
  if (url) {
    return '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">' + escaped + '</a>';
  }
  return escaped;
}
