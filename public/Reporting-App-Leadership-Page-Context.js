export const leadershipDom = {
  projectsSelect: document.getElementById('leadership-projects'),
  startInput: document.getElementById('leadership-start'),
  endInput: document.getElementById('leadership-end'),
  previewBtn: document.getElementById('leadership-preview'),
  loadingEl: document.getElementById('leadership-loading'),
  errorEl: document.getElementById('leadership-error'),
  contentEl: document.getElementById('leadership-content'),
};

export const leadershipKeys = {
  storageKey: 'leadership_filters_v1',
  projectsKey: 'vodaAgileBoard_selectedProjects',
};
