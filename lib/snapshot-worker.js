
import { logger } from './Jira-Reporting-App-Server-Logging-Utility.js';
import { cache, CACHE_TTL } from './cache.js';
import { createAgileClient, createVersion3Client } from './jiraClients.js';
import { discoverBoardsWithCache, discoverFieldsWithCache, isSystemBusy } from './server-utils.js';
import { buildCurrentSprintPayload } from './currentSprint.js';

const SNAPSHOT_DELAY_BETWEEN_BOARDS_MS = 2000;
const SNAPSHOT_REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const DEFAULT_SNAPSHOT_PROJECTS = ['MPSA', 'MAS'];

async function refreshCurrentSprintSnapshots() {
    if (!process.env.JIRA_HOST || !process.env.JIRA_EMAIL || !process.env.JIRA_API_TOKEN) {
        return;
    }
    try {
        if (isSystemBusy()) {
            logger.info('Skipping current-sprint snapshot refresh because system is busy');
            return;
        }

        const agileClient = createAgileClient();
        const version3Client = createVersion3Client();
        const boards = await discoverBoardsWithCache(DEFAULT_SNAPSHOT_PROJECTS, agileClient);
        const fields = await discoverFieldsWithCache(version3Client);
        const fieldOpts = {
            storyPointsFieldId: fields.storyPointsFieldId,
            epicLinkFieldId: fields.epicLinkFieldId,
            ebmFieldIds: fields.ebmFieldIds || {},
        };
        for (const board of boards) {
            try {
                const projectKeys = board.location?.projectKey ? [board.location.projectKey] : DEFAULT_SNAPSHOT_PROJECTS;
                const payload = await buildCurrentSprintPayload({
                    board: { id: board.id, name: board.name, location: board.location },
                    projectKeys,
                    agileClient,
                    fields: fieldOpts,
                });
                cache.set(`currentSprintSnapshot:${board.id}`, payload, CACHE_TTL.CURRENT_SPRINT_SNAPSHOT);
                logger.debug('Current-sprint snapshot refreshed', { boardId: board.id, boardName: board.name });
            } catch (err) {
                logger.warn('Current-sprint snapshot refresh failed for board', { boardId: board.id, error: err.message });
            }
            await new Promise(r => setTimeout(r, SNAPSHOT_DELAY_BETWEEN_BOARDS_MS));
        }
        logger.info('Current-sprint snapshot refresh completed', { boardCount: boards.length });
    } catch (err) {
        logger.error('Current-sprint snapshot refresh failed', { error: err.message });
    }
}

export function startSnapshotScheduler() {
    // Snapshot refresh: first run after 30s, then hourly
    setTimeout(() => refreshCurrentSprintSnapshots(), 30 * 1000);
    setInterval(() => refreshCurrentSprintSnapshots(), SNAPSHOT_REFRESH_INTERVAL_MS);
}
