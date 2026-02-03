import fs from 'fs/promises';
import path from 'path';

const NOTES_PATH = path.join(process.cwd(), 'data', 'current-sprint-notes.json');
const EMPTY_NOTES = { updatedAt: null, items: {} };

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeList(input) {
  if (Array.isArray(input)) {
    return input.map(item => String(item || '').trim()).filter(Boolean);
  }
  if (typeof input === 'string') {
    return input
      .split(/\r?\n/)
      .map(item => item.trim())
      .filter(Boolean);
  }
  return [];
}

export async function readCurrentSprintNotes() {
  try {
    const raw = await fs.readFile(NOTES_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !isPlainObject(parsed)) return { ...EMPTY_NOTES };
    if (!isPlainObject(parsed.items)) parsed.items = {};
    return parsed;
  } catch (error) {
    if (error?.code === 'ENOENT') return { ...EMPTY_NOTES };
    throw error;
  }
}

export function getCurrentSprintNotes(notesData, boardId, sprintId) {
  const boardKey = String(boardId || '');
  const sprintKey = String(sprintId || '');
  if (!boardKey || !sprintKey || !notesData?.items?.[boardKey]?.[sprintKey]) {
    return { dependencies: [], learnings: [], updatedAt: null };
  }
  const entry = notesData.items[boardKey][sprintKey] || {};
  return {
    dependencies: normalizeList(entry.dependencies),
    learnings: normalizeList(entry.learnings),
    updatedAt: entry.updatedAt || null,
  };
}

export async function upsertCurrentSprintNotes(boardId, sprintId, payload) {
  const boardKey = String(boardId || '');
  const sprintKey = String(sprintId || '');
  if (!boardKey || !sprintKey) {
    throw new Error('boardId and sprintId are required');
  }

  const notes = await readCurrentSprintNotes();
  if (!notes.items[boardKey]) notes.items[boardKey] = {};

  const entry = {
    dependencies: normalizeList(payload?.dependencies),
    learnings: normalizeList(payload?.learnings),
    updatedAt: new Date().toISOString(),
  };

  notes.items[boardKey][sprintKey] = entry;
  notes.updatedAt = entry.updatedAt;

  await fs.mkdir(path.dirname(NOTES_PATH), { recursive: true });
  await fs.writeFile(NOTES_PATH, JSON.stringify(notes, null, 2), 'utf8');

  return entry;
}

export function normalizeNotesPayload(payload) {
  return {
    dependencies: normalizeList(payload?.dependencies),
    learnings: normalizeList(payload?.learnings),
  };
}
