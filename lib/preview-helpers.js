
import { cache } from './cache.js';

export function buildPreviewCacheKey({
    selectedProjects,
    windowStart,
    windowEnd,
    includeStoryPoints,
    requireResolvedBySprintEnd,
    includeBugsForRework,
    includePredictability,
    predictabilityMode,
    includeEpicTTM,
    includeActiveOrMissingEndDateSprints,
}) {
    const safeProjects = Array.isArray(selectedProjects) ? [...selectedProjects].sort() : [];
    return `preview:${JSON.stringify({
        projects: safeProjects,
        windowStart,
        windowEnd,
        includeStoryPoints,
        requireResolvedBySprintEnd,
        includeBugsForRework,
        includePredictability,
        predictabilityMode,
        includeEpicTTM,
        includeActiveOrMissingEndDateSprints,
    })}`;
}

export function findBestPreviewCacheSubset({ selectedProjects, windowStart, windowEnd, maxAgeMs }) {
    const entries = cache.entries();
    if (!entries.length) return null;

    const requestedProjects = Array.isArray(selectedProjects) ? [...selectedProjects].sort() : [];
    const requestedSet = new Set(requestedProjects);
    if (!requestedSet.size) return null;

    const requestedStartMs = new Date(windowStart).getTime();
    const requestedEndMs = new Date(windowEnd).getTime();
    if (Number.isNaN(requestedStartMs) || Number.isNaN(requestedEndMs)) return null;

    let best = null;
    const now = Date.now();

    for (const [key, entry] of entries) {
        if (!key.startsWith('preview:')) continue;
        const basePayload = entry.value || entry;
        if (!basePayload || typeof basePayload !== 'object') continue;
        const meta = basePayload.meta || {};
        const metaProjects = Array.isArray(meta.selectedProjects) ? [...meta.selectedProjects].sort() : null;
        if (!metaProjects || !metaProjects.length) continue;
        // Candidate projects must be a subset of requested projects
        if (!metaProjects.every((p) => requestedSet.has(p))) continue;

        const metaStartMs = new Date(meta.windowStart || windowStart).getTime();
        const metaEndMs = new Date(meta.windowEnd || windowEnd).getTime();
        if (Number.isNaN(metaStartMs) || Number.isNaN(metaEndMs)) continue;
        // Candidate window must be fully inside requested window
        if (metaStartMs < requestedStartMs || metaEndMs > requestedEndMs) continue;

        const ageMs = typeof entry.cachedAt === 'number' ? now - entry.cachedAt : null;
        if (typeof maxAgeMs === 'number' && maxAgeMs > 0 && ageMs != null && ageMs > maxAgeMs) continue;

        if (!best || (entry.cachedAt || 0) > (best.entry.cachedAt || 0)) {
            best = { key, entry, payload: basePayload, ageMs };
        }
    }

    return best;
}

export function computeRecentSplitConfig({
    rangeDays,
    bypassCache,
    requestedSplit,
    requestedRecentDays,
    previewMode,
    endDate,
    projectCount,
    includePredictability,
}) {
    const explicitSplit =
        previewMode === 'recent-first'
        || previewMode === 'recent-only'
        || requestedSplit;

    const recentBaseDays = Number.isNaN(requestedRecentDays) || requestedRecentDays <= 0
        ? 14
        : requestedRecentDays;
    const recentSplitDays = Math.min(60, recentBaseDays);

    const heavyByProjects = projectCount >= 5 || (projectCount >= 3 && rangeDays > 45);
    const heavyByPredictability = includePredictability && projectCount >= 3 && rangeDays > 30;
    const shouldSplitByRecent = !bypassCache && (
        explicitSplit
        || rangeDays > recentSplitDays
        || heavyByProjects
        || heavyByPredictability
    );
    let splitReason = null;
    if (shouldSplitByRecent) {
        if (explicitSplit) splitReason = 'explicit';
        else if (rangeDays > recentSplitDays) splitReason = 'range';
        else if (heavyByProjects) splitReason = 'projects';
        else if (heavyByPredictability) splitReason = 'predictability';
    }

    let recentCutoffDate = null;
    if (shouldSplitByRecent && endDate) {
        recentCutoffDate = new Date(endDate);
        recentCutoffDate.setDate(recentCutoffDate.getDate() - recentSplitDays);
    }

    return { shouldSplitByRecent, recentCutoffDate, recentSplitDays, splitReason };
}
