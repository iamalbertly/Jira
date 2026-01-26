#!/usr/bin/env node

/**
 * Test Orchestration Runner for Jira Reporting App
 * Runs all tests in sequence, shows steps in foreground, terminates on first error
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

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
    args: ['playwright', 'test', 'tests/Jira-Reporting-App-API-Integration-Tests.spec.js', '--reporter=list', '--headed'],
    cwd: projectRoot,
  },
  {
    name: 'Run E2E User Journey Tests',
    command: 'npx',
    args: ['playwright', 'test', 'tests/Jira-Reporting-App-E2E-User-Journey-Tests.spec.js', '--reporter=list', '--headed'],
    cwd: projectRoot,
  },
];

function runStep(step, stepIndex) {
  return new Promise((resolve, reject) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Step ${stepIndex + 1}/${steps.length}: ${step.name}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Command: ${step.command} ${step.args.join(' ')}`);
    console.log(`Working Directory: ${step.cwd}`);
    console.log(`${'='.repeat(60)}\n`);

    const proc = spawn(step.command, step.args, {
      cwd: step.cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        console.error(`\n${'='.repeat(60)}`);
        console.error(`FAILED: Step ${stepIndex + 1} (${step.name}) exited with code ${code}`);
        console.error(`${'='.repeat(60)}\n`);
        reject(new Error(`Step ${step.name} failed with exit code ${code}`));
      } else {
        console.log(`\n✓ Step ${stepIndex + 1} (${step.name}) completed successfully\n`);
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

  try {
    for (let i = 0; i < steps.length; i++) {
      await runStep(steps[i], i);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✓ ALL TESTS PASSED');
    console.log('='.repeat(60) + '\n');
    process.exit(0);
  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('✗ TEST ORCHESTRATION FAILED');
    console.error('='.repeat(60));
    console.error(`Error: ${error.message}\n`);
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
