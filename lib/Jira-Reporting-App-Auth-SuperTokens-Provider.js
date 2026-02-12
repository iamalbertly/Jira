import supertokens from 'supertokens-node';
import Session from 'supertokens-node/recipe/session/index.js';
import EmailPassword from 'supertokens-node/recipe/emailpassword/index.js';
import UserRoles from 'supertokens-node/recipe/userroles/index.js';
import Dashboard from 'supertokens-node/recipe/dashboard/index.js';
import { middleware as supertokensMiddleware, errorHandler as supertokensErrorHandler } from 'supertokens-node/framework/express/index.js';

const SUPERTOKENS_ENABLED = process.env.SUPERTOKENS_ENABLED === 'true';
const SUPERTOKENS_HYBRID_MODE = process.env.SUPERTOKENS_HYBRID_MODE !== 'false';
let initialized = false;

function getAppInfo(port) {
  const appName = process.env.SUPERTOKENS_APP_NAME || 'VodaAgileBoard';
  const apiDomain = process.env.SUPERTOKENS_API_DOMAIN || `http://localhost:${port}`;
  const websiteDomain = process.env.SUPERTOKENS_WEBSITE_DOMAIN || `http://localhost:${port}`;
  const apiBasePath = process.env.SUPERTOKENS_API_BASE_PATH || '/auth';
  const websiteBasePath = process.env.SUPERTOKENS_WEBSITE_BASE_PATH || '/auth';
  return { appName, apiDomain, websiteDomain, apiBasePath, websiteBasePath };
}

export function initSuperTokens(port, logger) {
  if (!SUPERTOKENS_ENABLED || initialized) return false;

  const connectionURI = process.env.SUPERTOKENS_CONNECTION_URI || 'http://localhost:3567';
  const apiKey = process.env.SUPERTOKENS_API_KEY || undefined;

  supertokens.init({
    supertokens: {
      connectionURI,
      ...(apiKey ? { apiKey } : {}),
    },
    appInfo: getAppInfo(port),
    recipeList: [
      EmailPassword.init(),
      Session.init(),
      UserRoles.init(),
      Dashboard.init(),
    ],
  });

  initialized = true;
  if (logger && typeof logger.info === 'function') {
    logger.info('SuperTokens auth enabled', {
      connectionURI,
      hybridMode: SUPERTOKENS_HYBRID_MODE,
    });
  }
  return true;
}

export function isSuperTokensEnabled() {
  return SUPERTOKENS_ENABLED;
}

export function isSuperTokensHybridMode() {
  return SUPERTOKENS_HYBRID_MODE;
}

export function getSuperTokensExpressMiddleware() {
  if (!SUPERTOKENS_ENABLED) return null;
  return supertokensMiddleware();
}

export function getSuperTokensExpressErrorHandler() {
  if (!SUPERTOKENS_ENABLED) return null;
  return supertokensErrorHandler();
}

export async function getSuperTokensSessionIfPresent(req, res) {
  if (!SUPERTOKENS_ENABLED) return null;
  return Session.getSession(req, res, { sessionRequired: false });
}
