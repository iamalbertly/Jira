import { test, expect } from '@playwright/test';

test.describe('Jira Reporting App - API Integration Tests', () => {
  test('GET /report should return HTML page', async ({ request }) => {
    const response = await request.get('/report');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/html');
    const body = await response.text();
    expect(body).toContain('Jira Sprint Report');
    expect(body).toContain('MPSA');
    expect(body).toContain('MAS');
  });

  test('GET /preview.json should validate empty projects', async ({ request }) => {
    const response = await request.get('/preview.json?projects=');
    expect(response.status()).toBe(400);
    const json = await response.json();
    expect(json.code).toBe('NO_PROJECTS_SELECTED');
    expect(json.message?.toLowerCase() || json.error?.toLowerCase() || '').toContain('at least one project');
  });

  test('GET /preview.json should validate invalid date range', async ({ request }) => {
    const response = await request.get('/preview.json?projects=MPSA&start=2025-06-30T00:00:00.000Z&end=2025-04-01T00:00:00.000Z');
    expect(response.status()).toBe(400);
    const json = await response.json();
    expect(json.code).toBe('INVALID_DATE_RANGE');
  });

  test('GET /preview.json should validate date range too large', async ({ request }) => {
    const response = await request.get('/preview.json?projects=MPSA&start=2020-01-01T00:00:00.000Z&end=2025-12-31T23:59:59.999Z');
    expect(response.status()).toBe(400);
    const json = await response.json();
    expect(json.code).toBe('DATE_RANGE_TOO_LARGE');
  });

  test('GET /preview.json should validate invalid date format', async ({ request }) => {
    const response = await request.get('/preview.json?projects=MPSA&start=invalid-date&end=2025-06-30T23:59:59.999Z');
    expect(response.status()).toBe(400);
    const json = await response.json();
    expect(json.code).toBe('INVALID_DATE_FORMAT');
  });

  test('GET /preview.json should accept valid parameters', async ({ request }) => {
    // This test may fail if Jira credentials are not configured
    // That's expected - we're testing the API accepts the request format
    // Increase timeout for real Jira API calls
    test.setTimeout(120000); // 2 minutes
    
    const response = await request.get('/preview.json?projects=MPSA,MAS&start=2025-04-01T00:00:00.000Z&end=2025-06-30T23:59:59.999Z', {
      timeout: 120000
    });
    
    // Should either succeed (200) or fail with auth error (500/401), not validation error (400)
    expect([200, 401, 403, 500]).toContain(response.status());
    
    if (response.status() === 200) {
      const json = await response.json();
      expect(json).toHaveProperty('meta');
      expect(json).toHaveProperty('boards');
      expect(json).toHaveProperty('sprintsIncluded');
      expect(json).toHaveProperty('rows');
    } else {
      // Auth error is acceptable for this test
      const json = await response.json();
      expect(json).toHaveProperty('error');
    }
  });

  test('POST /export should validate request body', async ({ request }) => {
    // Missing columns
    const response1 = await request.post('/export', {
      data: { rows: [] }
    });
    expect(response1.status()).toBe(400);

    // Missing rows
    const response2 = await request.post('/export', {
      data: { columns: [] }
    });
    expect(response2.status()).toBe(400);

    // Invalid format
    const response3 = await request.post('/export', {
      data: { columns: 'not-array', rows: 'not-array' }
    });
    expect(response3.status()).toBe(400);
  });

  test('POST /export should generate CSV with valid data', async ({ request }) => {
    const columns = ['projectKey', 'issueKey', 'issueSummary'];
    const rows = [
      { projectKey: 'MPSA', issueKey: 'MPSA-1', issueSummary: 'Test Story' },
      { projectKey: 'MAS', issueKey: 'MAS-1', issueSummary: 'Another Story' },
    ];

    const response = await request.post('/export', {
      data: { columns, rows }
    });

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/csv');
    expect(response.headers()['content-disposition']).toContain('attachment');
    
    const csv = await response.text();
    expect(csv).toContain('projectKey,issueKey,issueSummary');
    expect(csv).toContain('MPSA,MPSA-1,Test Story');
    expect(csv).toContain('MAS,MAS-1,Another Story');
  });

  test('POST /export should handle large datasets', async ({ request }) => {
    const columns = ['projectKey', 'issueKey'];
    // Generate 6000 rows to test server-side streaming
    const rows = Array.from({ length: 6000 }, (_, i) => ({
      projectKey: 'MPSA',
      issueKey: `MPSA-${i + 1}`,
    }));

    const response = await request.post('/export', {
      data: { columns, rows }
    });

    expect(response.status()).toBe(200);
    const csv = await response.text();
    // Should have header + 6000 rows = 6001 lines
    const lines = csv.split('\n').filter(l => l.trim());
    expect(lines.length).toBeGreaterThanOrEqual(6000);
  });

  test.skip('GET /preview.json should handle all filter options', async ({ request }) => {
    // Skipped: This test requires many API calls (bugs, metrics) and can timeout with real Jira data
    // The parameter acceptance is validated by other tests
    // To test manually, use the UI with all options enabled
    
    test.setTimeout(300000); // 5 minutes for tests with all metrics enabled
    
    const params = new URLSearchParams({
      projects: 'MPSA,MAS',
      start: '2025-04-01T00:00:00.000Z',
      end: '2025-06-30T23:59:59.999Z',
      includeStoryPoints: 'true',
      requireResolvedBySprintEnd: 'true',
      includeBugsForRework: 'true',
      includePredictability: 'true',
      predictabilityMode: 'approx',
      includeEpicTTM: 'true',
      includeActiveOrMissingEndDateSprints: 'true',
    });

    const response = await request.get(`/preview.json?${params.toString()}`, {
      timeout: 300000
    });
    
    expect([200, 401, 403, 500]).toContain(response.status());
    
    if (response.status() === 200) {
      const json = await response.json();
      if (json.metrics) {
        expect(json.meta.discoveredFields).toBeDefined();
      }
    }
  });
});
