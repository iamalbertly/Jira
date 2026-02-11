import { renderSidebarContextCard } from './Reporting-App-Shared-Context-From-Storage.js';

const PAGE_REPORT = 'report';
const PAGE_SPRINT = 'current-sprint';
const PAGE_LEADERSHIP = 'leadership';
const PAGE_LOGIN = 'login';
const MOBILE_BREAKPOINT = 768;

function getCurrentPage() {
  const path = typeof window !== 'undefined' && window.location ? window.location.pathname || '' : '';
  if (path === '/report' || path.endsWith('/report')) return PAGE_REPORT;
  if (path === '/current-sprint' || path.endsWith('/current-sprint')) return PAGE_SPRINT;
  if (path === '/leadership' || path.endsWith('/leadership') || path === '/sprint-leadership' || path.endsWith('/sprint-leadership')) return PAGE_LEADERSHIP;
  if (path === '/login' || path.endsWith('/login')) return PAGE_LOGIN;
  return PAGE_REPORT;
}

function getNavItems(current) {
  return [
    {
      key: PAGE_REPORT,
      label: 'High-Level Performance',
      href: '/report',
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v3H4zm0 6h10v3H4zm0 6h16v3H4z"/></svg>',
      active: current === PAGE_REPORT,
    },
    {
      key: PAGE_SPRINT,
      label: 'Current Sprint (Squad)',
      href: '/current-sprint',
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v12H4zM7 3h2v4H7zm8 0h2v4h-2z"/></svg>',
      active: current === PAGE_SPRINT,
    },
    {
      key: PAGE_LEADERSHIP,
      label: 'Leadership HUD',
      href: '/sprint-leadership',
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18h4V8H4zm6 0h4V4h-4zm6 0h4v-6h-4z"/></svg>',
      active: current === PAGE_LEADERSHIP,
    },
  ];
}

function buildSidebarHTML() {
  const current = getCurrentPage();
  const items = getNavItems(current);
  let html = '<div class="sidebar-brand"><span class="sidebar-brand-mark" aria-hidden="true">VA</span><span class="sidebar-brand-text">VodaAgileBoard</span></div>';
  html += '<nav class="app-sidebar-nav app-nav" aria-label="Main">';
  for (const item of items) {
    const className = 'sidebar-link' + (item.active ? ' active current' : '');
    if (item.active) {
      html += '<span class="' + className + '" aria-current="page" data-nav-key="' + item.key + '">' + item.icon + '<span>' + item.label + '</span></span>';
    } else {
      html += '<a class="' + className + '" href="' + item.href + '" data-nav-key="' + item.key + '">' + item.icon + '<span>' + item.label + '</span></a>';
    }
  }
  html += '</nav>';
  html += '<div id="sidebar-context-card" class="sidebar-context-card" aria-live="polite"></div>';
  html += '<div class="sidebar-footer">v1 - Trustworthy delivery clarity</div>';
  return html;
}

function closeSidebar(sidebar, toggle, backdrop) {
  sidebar?.classList.remove('open');
  backdrop?.classList.remove('active');
  document.body.classList.remove('sidebar-open');
  document.body.classList.remove('sidebar-scroll-lock');
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
}

function openSidebar(sidebar, toggle, backdrop) {
  sidebar?.classList.add('open');
  backdrop?.classList.add('active');
  document.body.classList.add('sidebar-open');
  document.body.classList.add('sidebar-scroll-lock');
  if (toggle) toggle.setAttribute('aria-expanded', 'true');
}

function isMobileViewport() {
  return window.matchMedia && window.matchMedia('(max-width: ' + MOBILE_BREAKPOINT + 'px)').matches;
}

function initSidebarController() {
  const sidebar = document.querySelector('.app-sidebar');
  const toggle = document.querySelector('.sidebar-toggle');
  const backdrop = document.querySelector('.sidebar-backdrop');
  if (!sidebar || !toggle || !backdrop || sidebar.dataset.sidebarBound === '1') return;
  sidebar.dataset.sidebarBound = '1';

  toggle.addEventListener('click', () => {
    if (!isMobileViewport()) return;
    const open = sidebar.classList.contains('open');
    if (open) closeSidebar(sidebar, toggle, backdrop);
    else openSidebar(sidebar, toggle, backdrop);
  });
  backdrop.addEventListener('click', () => closeSidebar(sidebar, toggle, backdrop));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeSidebar(sidebar, toggle, backdrop);
  });
  sidebar.addEventListener('click', (event) => {
    if (!isMobileViewport()) return;
    const link = event.target.closest('a.sidebar-link');
    if (link) closeSidebar(sidebar, toggle, backdrop);
  });
  window.addEventListener('resize', () => {
    if (!isMobileViewport()) closeSidebar(sidebar, toggle, backdrop);
  });
}

function ensureGlobalNav() {
  try {
    const current = getCurrentPage();
    const oldInlineNav = document.querySelector('header nav.app-nav');
    if (oldInlineNav) oldInlineNav.remove();
    if (current === PAGE_LOGIN) {
      document.querySelector('.app-global-nav-wrap')?.remove();
      document.querySelector('.app-sidebar')?.remove();
      document.querySelector('.sidebar-toggle')?.remove();
      document.querySelector('.sidebar-backdrop')?.remove();
      document.body.classList.remove('sidebar-open');
      document.body.classList.remove('sidebar-scroll-lock');
      return;
    }

    let sidebar = document.querySelector('.app-sidebar');
    document.querySelector('.app-global-nav-wrap')?.remove();
    if (!sidebar) {
      sidebar = document.createElement('aside');
      sidebar.className = 'app-sidebar';
      sidebar.id = 'app-sidebar';
      sidebar.setAttribute('aria-label', 'Primary');
      document.body.insertBefore(sidebar, document.body.firstChild);
    }
    sidebar.innerHTML = buildSidebarHTML();
    renderSidebarContextCard();

    let toggle = document.querySelector('.sidebar-toggle');
    if (!toggle) {
      toggle = document.createElement('button');
      toggle.className = 'sidebar-toggle';
      toggle.type = 'button';
      toggle.setAttribute('aria-label', 'Toggle navigation');
      toggle.setAttribute('aria-controls', 'app-sidebar');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.innerHTML = '<span aria-hidden="true">☰</span>';
      document.body.appendChild(toggle);
    }

    let backdrop = document.querySelector('.sidebar-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('button');
      backdrop.className = 'sidebar-backdrop';
      backdrop.type = 'button';
      backdrop.setAttribute('aria-label', 'Close navigation');
      backdrop.tabIndex = -1;
      document.body.appendChild(backdrop);
    }

    initSidebarController();
  } catch (_) {}
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureGlobalNav);
  } else {
    ensureGlobalNav();
  }
}
