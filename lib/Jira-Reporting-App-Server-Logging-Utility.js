/**
 * Structured logging utility for Jira Reporting App
 * Provides consistent log formatting with levels and timestamps
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

const currentLogLevel = process.env.LOG_LEVEL ? 
  LOG_LEVELS[process.env.LOG_LEVEL.toUpperCase()] || LOG_LEVELS.INFO :
  LOG_LEVELS.INFO;

/**
 * Format log message with timestamp and level
 */
function formatLog(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const levelStr = level.toUpperCase().padEnd(5);
  
  let logLine = `[${timestamp}] ${levelStr} ${message}`;
  
  if (data !== null && data !== undefined) {
    try {
      const dataStr = typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data);
      logLine += `\n${dataStr}`;
    } catch (e) {
      logLine += `\n[Unable to serialize data: ${e.message}]`;
    }
  }
  
  return logLine;
}

/**
 * Logger object with level-specific methods
 */
export const logger = {
  debug(message, data = null) {
    if (currentLogLevel <= LOG_LEVELS.DEBUG) {
      console.debug(formatLog('debug', message, data));
    }
  },

  info(message, data = null) {
    if (currentLogLevel <= LOG_LEVELS.INFO) {
      console.log(formatLog('info', message, data));
    }
  },

  warn(message, data = null) {
    if (currentLogLevel <= LOG_LEVELS.WARN) {
      console.warn(formatLog('warn', message, data));
    }
  },

  error(message, error = null) {
    if (currentLogLevel <= LOG_LEVELS.ERROR) {
      const errorData = error ? {
        message: error.message,
        stack: error.stack,
        ...(error.cause && { cause: error.cause }),
        ...(error.statusCode && { statusCode: error.statusCode }),
      } : null;
      console.error(formatLog('error', message, errorData));
    }
  },
};
