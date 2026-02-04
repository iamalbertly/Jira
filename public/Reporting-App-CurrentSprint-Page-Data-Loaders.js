import { getProjectsParam } from './Reporting-App-CurrentSprint-Page-Storage.js';

export function getErrorMessage(response, body, fallback) {
  if (response.status === 401) return 'Session expired. Please log in again.';
  if (response.status === 429) return 'Data may be incomplete due to rate limits; try again later.';
  return (body && (body.message || body.error)) || response.statusText || fallback;
}

export async function loadBoards() {
  const projects = encodeURIComponent(getProjectsParam());
  const response = await fetch(`/api/boards.json?projects=${projects}`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(getErrorMessage(response, body, 'Failed to load boards'));
  }
  return body;
}

export async function loadCurrentSprint(boardId, sprintId) {
  const params = new URLSearchParams();
  params.set('boardId', boardId);
  params.set('projects', getProjectsParam());
  if (sprintId) params.set('sprintId', sprintId);
  const response = await fetch(`/api/current-sprint.json?${params.toString()}`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(getErrorMessage(response, body, 'Failed to load current sprint'));
  }
  return body;
}
