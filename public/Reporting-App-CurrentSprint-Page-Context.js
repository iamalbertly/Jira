export const currentSprintDom = {
  projectsSelect: document.getElementById('current-sprint-projects'),
  boardSelect: document.getElementById('board-select'),
  loadingEl: document.getElementById('current-sprint-loading'),
  errorEl: document.getElementById('current-sprint-error'),
  contentEl: document.getElementById('current-sprint-content'),
  titleEl: document.getElementById('current-sprint-title'),
  nameEl: document.getElementById('current-sprint-name'),
  subtitleEl: document.getElementById('current-sprint-subtitle'),
};

export const currentSprintKeys = {
  projectsKey: 'vodaAgileBoard_selectedProjects',
  boardKey: 'vodaAgileBoard_lastBoardId',
  sprintKey: 'vodaAgileBoard_lastSprintId',
};
