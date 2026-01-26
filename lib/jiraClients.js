import { AgileClient } from 'jira.js/agile';
import { Version3Client } from 'jira.js';
// Note: dotenv.config() is called in server.js before this module is imported

/**
 * Creates and returns an AgileClient instance for Jira Agile API
 * @returns {AgileClient}
 * @throws {Error} If required environment variables are missing
 */
export function createAgileClient() {
  const host = process.env.JIRA_HOST;
  const email = process.env.JIRA_EMAIL;
  const apiToken = process.env.JIRA_API_TOKEN;

  // Detailed error message for debugging
  if (!host || !email || !apiToken) {
    const missing = [];
    if (!host) missing.push('JIRA_HOST');
    if (!email) missing.push('JIRA_EMAIL');
    if (!apiToken) missing.push('JIRA_API_TOKEN');
    throw new Error(`Missing required Jira credentials: ${missing.join(', ')}. Please ensure .env file exists in the project root and contains all required variables.`);
  }
  
  // Log successful client creation (without sensitive data)
  console.log(`[Jira Client] Creating AgileClient for ${host} with email ${email.substring(0, 3)}***`);

  return new AgileClient({
    host,
    authentication: {
      basic: {
        email,
        apiToken,
      },
    },
  });
}

/**
 * Creates and returns a Version3Client instance for Jira Platform API
 * @returns {Version3Client}
 * @throws {Error} If required environment variables are missing
 */
export function createVersion3Client() {
  const host = process.env.JIRA_HOST;
  const email = process.env.JIRA_EMAIL;
  const apiToken = process.env.JIRA_API_TOKEN;

  // Detailed error message for debugging
  if (!host || !email || !apiToken) {
    const missing = [];
    if (!host) missing.push('JIRA_HOST');
    if (!email) missing.push('JIRA_EMAIL');
    if (!apiToken) missing.push('JIRA_API_TOKEN');
    throw new Error(`Missing required Jira credentials: ${missing.join(', ')}. Please ensure .env file exists in the project root and contains all required variables.`);
  }
  
  // Log successful client creation (without sensitive data)
  console.log(`[Jira Client] Creating Version3Client for ${host} with email ${email.substring(0, 3)}***`);

  return new Version3Client({
    host,
    authentication: {
      basic: {
        email,
        apiToken,
      },
    },
  });
}
