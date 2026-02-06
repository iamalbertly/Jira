#!/usr/bin/env node

/**
 * Test Orchestration Runner for Jira Reporting App
 * Runs all tests in sequence, shows steps in foreground, terminates on first error
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import net from 'net';
import { getSteps } from './Jira-Reporting-App-Test-Orchestration-Steps.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const steps = getSteps(projectRoot);
const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
const resolvedPort = (() => {
  try {
    const parsed = new URL(baseUrl);
    if (parsed.port) return Number(parsed.port);
    return parsed.protocol === 'https:' ? 443 : 80;
  } catch (error) {
    return Number(process.env.PORT) || 3000;
  }
})();

function isPortInUse(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(false));
    socket.connect(port, '127.0.0.1');
  });
}

function runStep(step, stepIndex, envOverrides = {}) {
  return new Promise((resolve, reject) => {
    let args = step.args || [];
    if (process.env.TEST_LAST_FAILED === '1' || process.env.TEST_LAST_FAILED === 'true') {
      const isPlaywright = step.command === 'npx' && args.some(a => a === 'playwright');
      if (isPlaywright && !args.includes('--last-failed')) {
        args = [...args, '--last-failed'];
      }
    }
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Step ${stepIndex + 1}/${steps.length}: ${step.name}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Command: ${step.command} ${args.join(' ')}`);
    console.log(`Working Directory: ${step.cwd}`);
    console.log(`${'='.repeat(60)}\n`);

    const proc = spawn(step.command, args, {
      cwd: step.cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: { ...process.env, ...envOverrides },
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        console.error(`\n${'='.repeat(60)}`);
        console.error(`FAILED: Step ${stepIndex + 1} (${step.name}) exited with code ${code}`);
        console.error(`${'='.repeat(60)}\n`);
        reject(new Error(`Step ${step.name} failed with exit code ${code}`));
      } else {
        console.log(`\nOK Step ${stepIndex + 1} (${step.name}) completed successfully\n`);
        resolve();
      }
    });

    proc.on('error', (error) => {
      console.error(`\n${'='.repeat(60)}`);
      console.error(`ERROR: Failed to start step ${stepIndex + 1} (${step.name})`);
      console.error(`Error: ${error.message}`);
      console.error(`${'='.repeat(60)}\n`);
      reject(error);
    });
  });
}

async function runAllTests() {
  console.log('\n' + '='.repeat(60));
  console.log('Jira Reporting App - Test Orchestration');
  console.log('='.repeat(60));
  console.log(`Total Steps: ${steps.length}`);
  console.log('Terminating on first error\n');

  let manualServer = null;
  try {
    const portInUse = await isPortInUse(resolvedPort);
    const skipWebServer = process.env.SKIP_WEBSERVER === 'true' || portInUse;
    if (portInUse && process.env.SKIP_WEBSERVER !== 'true') {
      console.log(`[INFO] Port ${resolvedPort} already in use. Reusing existing server.`);
    }
    console.log(`[INFO] BASE_URL: ${baseUrl}`);
    console.log(`[INFO] WebServer: ${skipWebServer ? 'skip (reuse existing)' : 'managed by Playwright'}\n`);

    if (skipWebServer && !portInUse) {
      console.log(`[INFO] Starting local server on port ${resolvedPort}...`);
      manualServer = spawn('node', ['server.js'], {
        cwd: projectRoot,
        stdio: 'inherit',
        shell: process.platform === 'win32',
        env: { ...process.env, PORT: String(resolvedPort), NODE_ENV: 'test' },
      });
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Clear server caches before test steps so no test reads stale data
    const clearCacheUrl = `${baseUrl.replace(/\/$/, '')}/api/test/clear-cache`;
    let cacheCleared = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(clearCacheUrl, { method: 'POST', signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
          cacheCleared = true;
          console.log('[INFO] Server caches cleared.\n');
          break;
        }
        if (res.status === 404) {
          console.log('[WARN] Clear-cache endpoint not available (404). Continue without clearing.\n');
          break;
        }
      } catch (err) {
        if (attempt === 3) {
          console.log('[WARN] Failed to clear server cache:', err.message || err, '- Continue without clearing.\n');
        } else {
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }

    for (let i = 0; i < steps.length; i++) {
      await runStep(steps[i], i, {
        BASE_URL: baseUrl,
        PORT: process.env.PORT || String(resolvedPort),
        SKIP_WEBSERVER: skipWebServer ? 'true' : (process.env.SKIP_WEBSERVER || ''),
      });
    }

    console.log('\n' + '='.repeat(60));
    console.log('OK ALL TESTS PASSED');
    console.log('='.repeat(60) + '\n');
    if (manualServer) {
      manualServer.kill();
    }
    process.exit(0);
  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('ERROR TEST ORCHESTRATION FAILED');
    console.error('='.repeat(60));
    console.error(`Error: ${error.message}\n`);
    if (manualServer) {
      manualServer.kill();
    }
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n\nTest orchestration interrupted by user');
  process.exit(130);
});

process.on('SIGTERM', () => {
  console.log('\n\nTest orchestration terminated');
  process.exit(143);
});

runAllTests();

