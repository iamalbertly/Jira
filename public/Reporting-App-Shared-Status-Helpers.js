export function setErrorOnEl(el, msg) {
  if (!el) return;
  el.style.display = 'block';
  el.textContent = msg || 'An error occurred.';
  // Accessibility: announce errors to assistive tech
  el.setAttribute('role', 'alert');
  el.setAttribute('aria-live', 'assertive');
}

export function setLoadingOnEl(el, msg) {
  if (!el) return;
  el.style.display = 'block';
  el.textContent = msg || 'Loading...';
  // ensure loading is not announced as an error
  el.removeAttribute('role');
  el.setAttribute('aria-live', 'polite');
}

export function clearEl(el) {
  if (!el) return;
  el.style.display = 'none';
  el.textContent = '';
  el.removeAttribute('role');
  el.removeAttribute('aria-live');
}