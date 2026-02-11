/**
 * Injects or updates global nav on all core surfaces (Login, High-Level Performance, Current Sprint).
 * Single source of truth: VodaAgileBoard brand + High-Level Performance | Current Sprint.
 * On login, links use /login?redirect=...; on other pages current page is marked, others link to the page.
 */
function getCurrentPage() {
  const path = typeof window !== 'undefined' && window.location ? window.location.pathname || '' : '';
  if (path === '/report' || path.endsWith('/report')) return 'report';
  if (path === '/current-sprint' || path.endsWith('/current-sprint')) return 'current-sprint';
  if (path === '/login' || path.endsWith('/login')) return 'login';
  return 'report';
}

function buildNavHTML() {
  const current = getCurrentPage();
  const isLogin = current === 'login';
  const base = isLogin ? '/login?redirect=' : '';
  const reportHref = isLogin ? base + '/report' : '/report';
  const sprintHref = isLogin ? base + '/current-sprint' : '/current-sprint';

  let html = '<span class="app-nav-brand" aria-label="VodaAgileBoard">VodaAgileBoard</span>';
  html += '<span class="app-nav-sep" aria-hidden="true">|</span>';
  if (current === 'report') {
    html += '<span class="current" aria-current="page">High-Level Performance</span>';
  } else {
    html += '<a href="' + reportHref + '">High-Level Performance</a>';
  }
  html += '<span class="app-nav-sep" aria-hidden="true">|</span>';
  if (current === 'current-sprint') {
    html += '<span class="current" aria-current="page">Current Sprint (Squad)</span>';
  } else {
    html += '<a href="' + sprintHref + '">Current Sprint (Squad)</a>';
  }
  return html;
}

function ensureGlobalNav() {
  try {
    const existing = document.querySelector('.app-nav');
    if (existing) {
      existing.innerHTML = buildNavHTML();
      existing.setAttribute('aria-label', 'Main');
      return;
    }
    const wrap = document.createElement('div');
    wrap.id = 'app-global-nav';
    wrap.className = 'app-global-nav-wrap';
    wrap.setAttribute('role', 'navigation');
    const nav = document.createElement('nav');
    nav.className = 'app-nav';
    nav.setAttribute('aria-label', 'Main');
    nav.innerHTML = buildNavHTML();
    wrap.appendChild(nav);
    document.body.insertBefore(wrap, document.body.firstChild);
  } catch (_) {}
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureGlobalNav);
  } else {
    ensureGlobalNav();
  }
}
