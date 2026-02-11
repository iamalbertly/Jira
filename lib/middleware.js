import { logger } from './Jira-Reporting-App-Server-Logging-Utility.js';

const SESSION_SECRET = process.env.SESSION_SECRET;
const APP_LOGIN_USER = process.env.APP_LOGIN_USER;
const APP_LOGIN_PASSWORD = process.env.APP_LOGIN_PASSWORD;
const authEnabled = Boolean(SESSION_SECRET && APP_LOGIN_USER && APP_LOGIN_PASSWORD);
const SESSION_IDLE_MS = Number(process.env.SESSION_IDLE_MS) || 30 * 60 * 1000;

export function requireAuth(req, res, next) {
    if (!authEnabled) return next();
    if (req.session && req.session.user) {
        const now = Date.now();
        const last = req.session.lastActivity || now;
        if (now - last > SESSION_IDLE_MS) {
            req.session.destroy(() => { });
            const isApi = req.path.endsWith('.json') || req.get('Accept')?.includes('application/json') || req.xhr;
            if (isApi) return res.status(401).json({ error: 'Unauthorized', code: 'SESSION_EXPIRED' });
            return res.redirect(`/login?redirect=${encodeURIComponent(req.originalUrl)}&error=timeout`);
        }
        req.session.lastActivity = now;
        return next();
    }
    const isApi = req.path.endsWith('.json') || req.get('Accept')?.includes('application/json') || req.xhr;
    if (isApi) return res.status(401).json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' });
    const redirect = encodeURIComponent(req.originalUrl);
    return res.redirect(`/login?redirect=${redirect}`);
}

export { authEnabled, APP_LOGIN_USER, APP_LOGIN_PASSWORD };
