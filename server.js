
import express from 'express';
import session from 'express-session';
import dotenv from 'dotenv';
import { logger } from './lib/Jira-Reporting-App-Server-Logging-Utility.js';
import { authEnabled, APP_LOGIN_USER, APP_LOGIN_PASSWORD } from './lib/middleware.js';
import { startSnapshotScheduler } from './lib/snapshot-worker.js';
import viewRoutes from './routes/views.js';
import apiRoutes from './routes/api.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET;

if (process.env.NODE_ENV === 'production' && SESSION_SECRET && (!APP_LOGIN_USER || !APP_LOGIN_PASSWORD)) {
  logger.error('Production requires APP_LOGIN_USER and APP_LOGIN_PASSWORD when SESSION_SECRET is set');
  process.exit(1);
}

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

if (authEnabled) {
  app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    name: 'vodaagileboard.sid',
    cookie: { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 60 * 60 * 1000 },
  }));
}

// Routes - Mounting
// All views and APIs are mounted at root level to maintain backward compatibility
app.use('/', viewRoutes);
app.use('/', apiRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`VodaAgileBoard running on http://localhost:${PORT}`);
  console.log(`Access: ${authEnabled ? 'login at / then /report' : `report at http://localhost:${PORT}/report`}`);

  const hasHost = !!process.env.JIRA_HOST;
  const hasEmail = !!process.env.JIRA_EMAIL;
  const hasToken = !!process.env.JIRA_API_TOKEN;

  if (hasHost && hasEmail && hasToken) {
    console.log(`✓ Jira credentials loaded: ${process.env.JIRA_HOST} (${process.env.JIRA_EMAIL.substring(0, 3)}***)`);
  } else {
    console.warn(`⚠ Missing Jira credentials`);
  }

  logger.info('Server started', { port: PORT, credentialsLoaded: hasHost && hasEmail && hasToken });

  // Start Background Workers
  startSnapshotScheduler();
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    logger.error('Port already in use. Stop the other process or set PORT=...', { port: PORT, code: err.code });
    process.exit(1);
  }
  throw err;
});
