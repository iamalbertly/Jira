import { logger } from './Jira-Reporting-App-Server-Logging-Utility.js';
import {
    isSuperTokensEnabled,
    isSuperTokensHybridMode,
    getSuperTokensSessionIfPresent,
} from './Jira-Reporting-App-Auth-SuperTokens-Provider.js';

const SESSION_SECRET = process.env.SESSION_SECRET;
const APP_LOGIN_USER = process.env.APP_LOGIN_USER;
const APP_LOGIN_PASSWORD = process.env.APP_LOGIN_PASSWORD;
const legacyAuthEnabled = Boolean(SESSION_SECRET && APP_LOGIN_USER && APP_LOGIN_PASSWORD);
const superTokensEnabled = isSuperTokensEnabled();
const authEnabled = legacyAuthEnabled || superTokensEnabled;
const SESSION_IDLE_MS = Number(process.env.SESSION_IDLE_MS) || 30 * 60 * 1000;

async function requireLegacySession(req, res, next, isApi) {
    if (!legacyAuthEnabled) return false;

    if (req.session && req.session.user) {
        const now = Date.now();
        const last = req.session.lastActivity || now;
        if (now - last > SESSION_IDLE_MS) {
            req.session.destroy(() => { });
            if (isApi) return res.status(401).json({ error: 'Unauthorized', code: 'SESSION_EXPIRED' });
            return res.redirect(`/login?redirect=${encodeURIComponent(req.originalUrl)}&error=timeout`);
        }
        req.session.lastActivity = now;
        return true;
    }
    return false;
}

async function requireSuperTokensSession(req, res, isApi) {
    try {
        const session = await getSuperTokensSessionIfPresent(req, res);
        if (session) {
            req.authUser = { id: session.getUserId(), via: 'supertokens' };
            return true;
        }
    } catch (error) {
        logger.warn('SuperTokens session read failed', { error: error.message });
        if (isApi) {
            res.status(401).json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' });
            return false;
        }
        res.redirect(`/auth?redirectToPath=${encodeURIComponent(req.originalUrl)}`);
        return false;
    }
    return false;
}

export async function requireAuth(req, res, next) {
    if (!authEnabled) return next();

    const isApi = req.path.endsWith('.json') || req.get('Accept')?.includes('application/json') || req.xhr;

    if (superTokensEnabled) {
        const hasSuperTokensSession = await requireSuperTokensSession(req, res, isApi);
        if (hasSuperTokensSession) return next();

        if (isSuperTokensHybridMode()) {
            const hasLegacySession = await requireLegacySession(req, res, next, isApi);
            if (hasLegacySession) return next();
        }

        if (isApi) return res.status(401).json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' });
        return res.redirect(`/auth?redirectToPath=${encodeURIComponent(req.originalUrl)}`);
    }

    const hasLegacySession = await requireLegacySession(req, res, next, isApi);
    if (hasLegacySession) return next();
    if (isApi) return res.status(401).json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' });
    return res.redirect(`/login?redirect=${encodeURIComponent(req.originalUrl)}`);
}

export { authEnabled, legacyAuthEnabled, superTokensEnabled, APP_LOGIN_USER, APP_LOGIN_PASSWORD };
