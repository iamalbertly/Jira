/**
 * Single source of truth for default report date window (Vodacom Q2 2025).
 * Server and GET /api/default-window use this; client and tests may fetch the API to stay in sync.
 */
export const DEFAULT_WINDOW_START = '2025-07-01T00:00:00.000Z';
export const DEFAULT_WINDOW_END = '2025-09-30T23:59:59.999Z';
