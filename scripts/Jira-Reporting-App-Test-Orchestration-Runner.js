#!/usr/bin/env node

/**
 * Test Orchestration Runner for Jira Reporting App
 * Runs all tests in sequence, shows steps in foreground, terminates on first error
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import net from 'net';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
const resolvedPort = (() => {
  let manualServer = null;
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

const steps = [
  {
    name: 'Install Dependencies',
    command: 'npm',
    args: ['install'],
    cwd: projectRoot,
  },
  {
    name: 'Run API Integration Tests',
    command: 'npx',
    args: ['playwright', 'test', 'tests/Jira-Reporting-App-API-Integration-Tests.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'],
    cwd: projectRoot,
  },
  {
    name: 'Run Login Security Deploy Validation Tests',
    command: 'npx',
    args: ['playwright', 'test', 'tests/VodaAgileBoard-Login-Security-Deploy-Validation-Tests.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'],
    cwd: projectRoot,
  },
  {
    name: 'Run E2E User Journey Tests',
    command: 'npx',
    args: ['playwright', 'test', 'tests/Jira-Reporting-App-E2E-User-Journey-Tests.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'],
    cwd: projectRoot,
  },
  {
    name: 'Run UX Reliability Tests',
    command: 'npx',
    args: ['playwright', 'test', 'tests/Jira-Reporting-App-UX-Reliability-Fixes-Tests.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'],
    cwd: projectRoot,
  },
  {
    name: 'Run UX Critical Fixes Tests',
    command: 'npx',
    args: ['playwright', 'test', 'tests/Jira-Reporting-App-UX-Critical-Fixes-Tests.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'],
    cwd: projectRoot,
  },
  {
    name: 'Run Feedback & Date Display Tests',
    command: 'npx',
    args: ['playwright', 'test', 'tests/Jira-Reporting-App-Feedback-UX-Tests.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'],
    cwd: projectRoot,
  },
  {
    name: 'Run CSV Export Fallback Test',
    command: 'npx',
    args: ['playwright', 'test', 'tests/Jira-Reporting-App-CSV-Export-Fallback.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'],
    cwd: projectRoot,
  },
  {
    name: 'Run Date Window Ordering Test',
    command: 'npx',
    args: ['playwright', 'test', 'tests/Jira-Reporting-App-DateWindow-Ordering.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'],
    cwd: projectRoot,
  },
  {
    name: 'Run Throughput Merge Test',
    command: 'npx',
    args: ['playwright', 'test', 'tests/Jira-Reporting-App-Throughput-Merge.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'],
    cwd: projectRoot,
  },
  {
    name: 'Run Epic Key Link Tests',
    command: 'npx',
    args: ['playwright', 'test', 'tests/Jira-Reporting-App-EpicKeyLinks.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'],
    cwd: projectRoot,
  },
  {
    name: 'Run Preview Retry Test',
    command: 'npx',
    args: ['playwright', 'test', 'tests/Jira-Reporting-App-Preview-Retry.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'],
    cwd: projectRoot,
  },
  {
    name: 'Run Server Feedback Endpoint Test',
    command: 'npx',
    args: ['playwright', 'test', 'tests/Server-Feedback-Endpoint.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'],
    cwd: projectRoot,
  },
  {
    name: 'Run Column Titles & Tooltips Tests',
    command: 'npx',
    args: ['playwright', 'test', 'tests/Jira-Reporting-App-Column-Tooltip-Tests.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'],
    cwd: projectRoot,
  },
  {
    name: 'Run Validation Plan Tests',
    command: 'npx',
    args: ['playwright', 'test', 'tests/Jira-Reporting-App-Validation-Plan-Tests.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'],
    cwd: projectRoot,
  },
  {
    name: 'Run Excel Export Tests',
    command: 'npx',
    args: ['playwright', 'test', 'tests/Jira-Reporting-App-Excel-Export-Tests.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'],
    cwd: projectRoot,
  },
  {
    name: 'Run Refactor SSOT Validation Tests',
    command: 'npx',
    args: ['playwright', 'test', 'tests/Jira-Reporting-App-Refactor-SSOT-Validation-Tests.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'],
    cwd: projectRoot,
  },
  {
    name: 'Run Boards Summary Filters Export Validation Tests',
    command: 'npx',
    args: ['playwright', 'test', 'tests/Jira-Reporting-App-Boards-Summary-Filters-Export-Validation-Tests.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'],
    cwd: projectRoot,
  },
  {
    name: 'Run Current Sprint and Leadership View Tests',
    command: 'npx',
    args: ['playwright', 'test', 'tests/Jira-Reporting-App-Current-Sprint-Leadership-View-Tests.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'],
    cwd: projectRoot,
  },
  {
    name: 'Run UX Trust Validation Tests',
    command: 'npx',
    args: ['playwright', 'test', 'tests/Jira-Reporting-App-UX-Trust-Validation-Tests.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'],
    cwd: projectRoot,
  },
  {
    name: 'Run Current Sprint UX and SSOT Validation Tests',
    command: 'npx',
    args: ['playwright', 'test', 'tests/Jira-Reporting-App-Current-Sprint-UX-SSOT-Validation-Tests.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'],
    cwd: projectRoot,
  },
  {
    name: 'Run Linkification and Empty-state UI Validation Tests',
    command: 'npx',
    args: ['playwright', 'test', 'tests/Jira-Reporting-App-Linkification-EmptyState-UI-Validation-Tests.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'],
    cwd: projectRoot,
  },
  {
    name: 'Run Vodacom Quarters SSOT Sprint Order Validation Tests',
    command: 'npx',
    args: ['playwright', 'test', 'tests/Jira-Reporting-App-Vodacom-Quarters-SSOT-Sprint-Order-Validation-Tests.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'],
    cwd: projectRoot,
  },
  {
    name: 'Run Mobile Responsive UX Validation Tests',
    command: 'npx',
    args: ['playwright', 'test', 'tests/Jira-Reporting-App-Mobile-Responsive-UX-Validation-Tests.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'],
    cwd: projectRoot,
  },
  {
    name: 'Run General Performance Quarters UI Validation Tests',
    command: 'npx',
    args: ['playwright', 'test', 'tests/Jira-Reporting-App-General-Performance-Quarters-UI-Validation-Tests.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'],
    cwd: projectRoot,
  },
];

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
        env: { ...process.env, PORT: String(resolvedPort) },
      });
      await new Promise(resolve => setTimeout(resolve, 2000));
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

