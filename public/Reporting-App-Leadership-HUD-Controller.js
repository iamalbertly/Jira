/**
 * Reporting-App-Leadership-HUD-Controller.js
 * "Morning Coffee" Dashboard Controller
 * 
 * Philosophy: 
 * - Zero Config: Loads immediately.
 * - Auto-Healing: Refreshes on focus if stale.
 * - Resilient: Handles API failures gracefully.
 */

const REFRESH_INTERVAL_MS = 60 * 1000; // 1 minute
const STALE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes
let lastFetchTime = 0;

function formatNumber(num, decimals = 0) {
  if (num === null || num === undefined) return '--';
  return num.toFixed(decimals);
}

function getTrendHtml(trend) {
  if (!trend) return '<span class="trend-neutral">No trend data</span>';
  const direction = trend > 0 ? 'up' : trend < 0 ? 'down' : 'neutral';
  // Context aware: Up is good for Velocity, bad for Risk
  const arrow = trend > 0 ? '↑' : trend < 0 ? '↓' : '→';
  return `<span class="trend-${direction}">${arrow} ${Math.abs(trend)}% vs last 3</span>`;
}

function renderCard(label, value, unit, trendHtml, colorClass = '') {
  return `
    <div class="hud-card">
      <div>
        <div class="metric-label">${label}</div>
        <div class="metric-value ${colorClass}">${value}<span class="metric-unit">${unit}</span></div>
        <div class="metric-trend">${trendHtml}</div>
      </div>
    </div>
  `;
}

function renderError(msg) {
  const grid = document.getElementById('hud-grid');
  if (grid) {
    grid.innerHTML = `
      <div class="hud-card" style="grid-column: 1/-1; border-left: 4px solid var(--hud-danger);">
        <div class="metric-label" style="color: var(--hud-danger)">System Alert</div>
        <div class="metric-value" style="font-size: 1.5rem">${msg}</div>
        <div class="metric-trend">Retrying automatically...</div>
      </div>
    `;
  }
}

async function fetchHudData() {
  const statusEl = document.getElementById('connection-status');
  if (statusEl) statusEl.textContent = 'Syncing...';

  try {
    const res = await fetch('/api/leadership-summary.json');
    if (res.status === 401) {
      window.location.href = '/login?redirect=/leadership';
      return;
    }
    if (!res.ok) throw new Error(`API Error ${res.status}`);

    const data = await res.json();
    renderHud(data);
    lastFetchTime = Date.now();

    if (statusEl) {
      statusEl.textContent = 'Live';
      statusEl.className = 'live';
    }
    updateTimeAgo();
  } catch (err) {
    console.error('HUD Fetch Error:', err);
    if (statusEl) statusEl.textContent = 'Offline';
    if (!lastFetchTime && document.getElementById('hud-grid')) {
      document.getElementById('hud-grid').innerHTML = '<div class="error-card">Unable to connect. Retrying...</div>';
    }
  }
}

function renderHud(data) {
  const grid = document.getElementById('hud-grid');
  if (!grid) return;

  const { velocity, risk, quality, predictability, projectContext } = data;

  // Update Context
  const contextEl = document.getElementById('project-context');
  if (contextEl && projectContext) contextEl.textContent = projectContext;

  grid.innerHTML = [
    renderCard('Velocity (Last 3)', formatNumber(velocity.avg, 0), 'SP', getTrendHtml(velocity.trend)),
    renderCard('Risk Index', formatNumber(risk.score, 0), '%', '<span class="trend-neutral">Current active risk</span>', risk.score > 20 ? 'trend-down' : ''),
    renderCard('Rework Ratio', formatNumber(quality.reworkPct, 1), '%', getTrendHtml(quality.trend)), // Lower is better logic needed?
    renderCard('Predictability', formatNumber(predictability.avg, 0), '%', getTrendHtml(predictability.trend))
  ].join('');
}

function updateTimeAgo() {
  const el = document.getElementById('last-updated');
  if (!el || !lastFetchTime) return;
  const seconds = Math.floor((Date.now() - lastFetchTime) / 1000);
  if (seconds < 60) el.textContent = 'Just now';
  else el.textContent = `${Math.floor(seconds / 60)}m ago`;
}

function init() {
  fetchHudData();

  // Auto-refresh
  setInterval(() => {
    fetchHudData();
  }, REFRESH_INTERVAL_MS);

  // Stale Tab / Auto-Healing Edge Case
  window.addEventListener('focus', () => {
    const now = Date.now();
    if (now - lastFetchTime > STALE_THRESHOLD_MS) {
      console.log('Tab focused after stale period. Refreshing...');
      fetchHudData();
    }
  });

  // Time ago ticker
  setInterval(updateTimeAgo, 5000); // 5s accuracy
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
