export function initTabs(updateExportFilteredState, onTabActivate) {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const tabsContainer = document.querySelector('.tabs');

  if (tabsContainer) {
    tabsContainer.setAttribute('role', 'tablist');
  }

  function activateTab(btn) {
    const tabName = btn.dataset.tab;
    if (!tabName) return;

    tabButtons.forEach((b) => {
      const isActive = b === btn;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-selected', isActive ? 'true' : 'false');
      b.setAttribute('tabindex', isActive ? '0' : '-1');
    });

    tabPanes.forEach((p) => p.classList.remove('active'));
    const pane = document.getElementById(`tab-${tabName}`);
    if (pane) {
      pane.classList.add('active');
      const firstFocusable = pane.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (firstFocusable) firstFocusable.focus();
    }
    if (updateExportFilteredState) updateExportFilteredState();
    if (onTabActivate && typeof onTabActivate === 'function') onTabActivate(tabName);
  }

  tabButtons.forEach((btn) => {
    if (!btn.hasAttribute('role')) {
      btn.setAttribute('role', 'tab');
    }
    const isActive = btn.classList.contains('active');
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    btn.setAttribute('tabindex', isActive ? '0' : '-1');

    btn.addEventListener('click', () => {
      activateTab(btn);
    });

    btn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const buttons = Array.from(tabButtons);
        const dir = e.key === 'ArrowRight' ? 1 : -1;
        const currentIndex = buttons.indexOf(btn);
        const nextIndex = (currentIndex + dir + buttons.length) % buttons.length;
        const nextBtn = buttons[nextIndex];
        nextBtn.focus();
        activateTab(nextBtn);
      }
    });
  });
}
