/**
 * Test orchestration step definitions for Jira Reporting App.
 * SSOT for the ordered list of test steps. Used by Jira-Reporting-App-Test-Orchestration-Runner.js.
 *
 * @param {string} projectRoot - Project root path (used as cwd for each step)
 * @returns {Array<{ name: string, command: string, args: string[], cwd: string }>}
 */
export function getSteps(projectRoot) {
  return [
    { name: 'Install Dependencies', command: 'npm', args: ['install'], cwd: projectRoot },
    { name: 'Run Four Projects Q4 Data Validation Test', command: 'npx', args: ['playwright', 'test', 'tests/Jira-Reporting-App-Four-Projects-Q4-Data-Validation-Tests.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'], cwd: projectRoot },
    { name: 'Run API Integration Tests', command: 'npx', args: ['playwright', 'test', 'tests/Jira-Reporting-App-API-Integration-Tests.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'], cwd: projectRoot },
    { name: 'Run Server Errors and Export Validation Tests', command: 'npx', args: ['playwright', 'test', 'tests/Jira-Reporting-App-Server-Errors-And-Export-Validation-Tests.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'], cwd: projectRoot },
    { name: 'Run UX Trust and Export Validation Tests', command: 'npx', args: ['playwright', 'test', 'tests/Jira-Reporting-App-UX-Trust-And-Export-Validation-Tests.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'], cwd: projectRoot },
    { name: 'Run Login Security Deploy Validation Tests', command: 'npx', args: ['playwright', 'test', 'tests/VodaAgileBoard-Login-Security-Deploy-Validation-Tests.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'], cwd: projectRoot },
    { name: 'Run E2E User Journey Tests', command: 'npx', args: ['playwright', 'test', 'tests/Jira-Reporting-App-E2E-User-Journey-Tests.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'], cwd: projectRoot },
    { name: 'Run UX Reliability Tests', command: 'npx', args: ['playwright', 'test', 'tests/Jira-Reporting-App-UX-Reliability-Fixes-Tests.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'], cwd: projectRoot },
    { name: 'Run UX Critical Fixes Tests', command: 'npx', args: ['playwright', 'test', 'tests/Jira-Reporting-App-UX-Critical-Fixes-Tests.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'], cwd: projectRoot },
    { name: 'Run UX Improvements Customer Simplicity Trust Validation Tests', command: 'npx', args: ['playwright', 'test', 'tests/Jira-Reporting-App-UX-Improvements-Customer-Simplicity-Trust-Validation-Tests.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'], cwd: projectRoot },
    { name: 'Run Customer Simplicity Trust Phase2 Validation Tests', command: 'npx', args: ['playwright', 'test', 'tests/Jira-Reporting-App-Customer-Simplicity-Trust-Phase2-Validation-Tests.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'], cwd: projectRoot },
    { name: 'Run UX Outcome-First Validation Tests', command: 'npx', args: ['playwright', 'test', 'tests/Jira-Reporting-App-UX-Outcome-First-Validation-Tests.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'], cwd: projectRoot },
    { name: 'Run UX Outcome-First No-Click-Hidden Validation Tests', command: 'npx', args: ['playwright', 'test', 'tests/Jira-Reporting-App-UX-Outcome-First-No-Click-Hidden-Validation-Tests.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'], cwd: projectRoot },
    { name: 'Run UX SoC Duplication Refactor Validation Tests', command: 'npx', args: ['playwright', 'test', 'tests/Jira-Reporting-App-UX-SoC-Duplication-Refactor-Validation-Tests.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'], cwd: projectRoot },
    { name: 'Run UX Customer Simplicity Trust Full Validation Tests', command: 'npx', args: ['playwright', 'test', 'tests/Jira-Reporting-App-UX-Customer-Simplicity-Trust-Full-Validation-Tests.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'], cwd: projectRoot },
    { name: 'Run Feedback & Date Display Tests', command: 'npx', args: ['playwright', 'test', 'tests/Jira-Reporting-App-Feedback-UX-Tests.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'], cwd: projectRoot },
    { name: 'Run CSV Export Fallback Test', command: 'npx', args: ['playwright', 'test', 'tests/Jira-Reporting-App-CSV-Export-Fallback.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'], cwd: projectRoot },
    { name: 'Run Date Window Ordering Test', command: 'npx', args: ['playwright', 'test', 'tests/Jira-Reporting-App-DateWindow-Ordering.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'], cwd: projectRoot },
    { name: 'Run Throughput Merge Test', command: 'npx', args: ['playwright', 'test', 'tests/Jira-Reporting-App-Throughput-Merge.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'], cwd: projectRoot },
    { name: 'Run Epic Key Link Tests', command: 'npx', args: ['playwright', 'test', 'tests/Jira-Reporting-App-EpicKeyLinks.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'], cwd: projectRoot },
    { name: 'Run Preview Retry Test', command: 'npx', args: ['playwright', 'test', 'tests/Jira-Reporting-App-Preview-Retry.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'], cwd: projectRoot },
    { name: 'Run Preview Timeout and Error UI Validation Tests', command: 'npx', args: ['playwright', 'test', 'tests/Jira-Reporting-App-Preview-Timeout-Error-UI-Validation-Tests.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'], cwd: projectRoot },
    { name: 'Run Server Feedback Endpoint Test', command: 'npx', args: ['playwright', 'test', 'tests/Server-Feedback-Endpoint.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'], cwd: projectRoot },
    { name: 'Run Column Titles & Tooltips Tests', command: 'npx', args: ['playwright', 'test', 'tests/Jira-Reporting-App-Column-Tooltip-Tests.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'], cwd: projectRoot },
    { name: 'Run Validation Plan Tests', command: 'npx', args: ['playwright', 'test', 'tests/Jira-Reporting-App-Validation-Plan-Tests.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'], cwd: projectRoot },
    { name: 'Run Excel Export Tests', command: 'npx', args: ['playwright', 'test', 'tests/Jira-Reporting-App-Excel-Export-Tests.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'], cwd: projectRoot },
    { name: 'Run Refactor SSOT Validation Tests', command: 'npx', args: ['playwright', 'test', 'tests/Jira-Reporting-App-Refactor-SSOT-Validation-Tests.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'], cwd: projectRoot },
    { name: 'Run Boards Summary Filters Export Validation Tests', command: 'npx', args: ['playwright', 'test', 'tests/Jira-Reporting-App-Boards-Summary-Filters-Export-Validation-Tests.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'], cwd: projectRoot },
    { name: 'Run Current Sprint and Leadership View Tests', command: 'npx', args: ['playwright', 'test', 'tests/Jira-Reporting-App-Current-Sprint-Leadership-View-Tests.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'], cwd: projectRoot },
    { name: 'Run Current Sprint UX and SSOT Validation Tests', command: 'npx', args: ['playwright', 'test', 'tests/Jira-Reporting-App-Current-Sprint-UX-SSOT-Validation-Tests.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'], cwd: projectRoot },
    { name: 'Run Cross-Page Persistence Validation Tests', command: 'npx', args: ['playwright', 'test', 'tests/Jira-Reporting-App-Cross-Page-Persistence-Validation-Tests.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'], cwd: projectRoot },
    { name: 'Run Linkification and Empty-state UI Validation Tests', command: 'npx', args: ['playwright', 'test', 'tests/Jira-Reporting-App-Linkification-EmptyState-UI-Validation-Tests.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'], cwd: projectRoot },
    { name: 'Run Vodacom Quarters SSOT Sprint Order Validation Tests', command: 'npx', args: ['playwright', 'test', 'tests/Jira-Reporting-App-Vodacom-Quarters-SSOT-Sprint-Order-Validation-Tests.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'], cwd: projectRoot },
    { name: 'Run Mobile Responsive UX Validation Tests', command: 'npx', args: ['playwright', 'test', 'tests/Jira-Reporting-App-Mobile-Responsive-UX-Validation-Tests.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'], cwd: projectRoot },
    { name: 'Run General Performance Quarters UI Validation Tests', command: 'npx', args: ['playwright', 'test', 'tests/Jira-Reporting-App-General-Performance-Quarters-UI-Validation-Tests.spec.js', '--reporter=list', '--headed', '--max-failures=1', '--workers=1'], cwd: projectRoot },
  ];
}
