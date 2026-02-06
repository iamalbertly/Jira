import { reportDom } from './Reporting-App-Report-Page-Context.js';
import { PROJECTS_SSOT_KEY } from './Reporting-App-Shared-Storage-Keys.js';

export function getSelectedProjects() {
  return Array.from(document.querySelectorAll('.project-checkbox[data-project]:checked'))
    .map(input => input.dataset.project)
    .filter(Boolean);
}

export function persistSelectedProjects() {
  try {
    const value = getSelectedProjects().join(',');
    if (value) localStorage.setItem(PROJECTS_SSOT_KEY, value);
  } catch (_) {}
}

export function updatePreviewButtonState() {
  const { previewBtn } = reportDom;
  if (!previewBtn) return;
  const hasProject = getSelectedProjects().length > 0;
  previewBtn.disabled = !hasProject;
  previewBtn.title = hasProject ? '' : 'Please select at least one project.';
  persistSelectedProjects();
}

export function initProjectSelection() {
  try {
    const stored = localStorage.getItem(PROJECTS_SSOT_KEY);
    if (stored && typeof stored === 'string') {
      const list = stored.split(',').map(p => (p || '').trim()).filter(Boolean);
      document.querySelectorAll('.project-checkbox[data-project]').forEach(input => {
        const project = input.dataset?.project || '';
        input.checked = list.includes(project);
      });
    }
  } catch (_) {}
  document.querySelectorAll('.project-checkbox[data-project]').forEach(input => {
    input.addEventListener('change', updatePreviewButtonState);
  });
  updatePreviewButtonState();

  const predictabilityCheckbox = document.getElementById('include-predictability');
  const predictabilityModeGroup = document.getElementById('predictability-mode-group');
  if (predictabilityCheckbox && predictabilityModeGroup) {
    const applyVisibility = () => {
      predictabilityModeGroup.style.display = predictabilityCheckbox.checked ? 'block' : 'none';
    };
    predictabilityCheckbox.addEventListener('change', applyVisibility);
    applyVisibility();
  }
}
