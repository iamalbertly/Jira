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
