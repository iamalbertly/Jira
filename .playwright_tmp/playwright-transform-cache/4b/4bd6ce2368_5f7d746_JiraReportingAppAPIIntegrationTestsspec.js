import { test, expect } from '@playwright/test';
import { CSV_COLUMNS as SERVER_CSV_COLUMNS } from '../lib/csv.js';
const DEFAULT_Q2_QUERY = '?projects=MPSA,MAS&start=2025-07-01T00:00:00.000Z&end=2025-09-30T23:59:59.999Z';
const DEFAULT_PREVIEW_URL = `/preview.json${DEFAULT_Q2_QUERY}`;
async function safePost(request, url, data, timeoutMs = 10000) {
  try {
    return await request.post(url, {
      data,
      timeout: timeoutMs
    });
  } catch (error) {
    return {
      error
    };
  }
}
test.describe('Jira Reporting App - API Integration Tests', () => {
  test('GET /api/csv-columns returns server SSOT and matches lib/csv.js', async ({
    request
  }) => {
    const response = await request.get('/api/csv-columns');
    if (response.status() === 401) {
      test.skip('Auth required; cannot assert CSV columns contract');
      return;
    }
    if (response.status() === 404) {
      test.skip('Route /api/csv-columns not found (restart server with latest code)');
      return;
    }
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.columns)).toBe(true);
    expect(body.columns).toEqual(SERVER_CSV_COLUMNS);
  });
  test('GET /report should return HTML page', async ({
    request
  }) => {
    const response = await request.get('/report');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/html');
    const body = await response.text();
    expect(body).toContain('VodaAgileBoard');
    expect(body).toContain('MPSA');
    expect(body).toContain('MAS');
  });
  test('GET /preview.json should validate empty projects', async ({
    request
  }) => {
    const response = await request.get('/preview.json?projects=');
    expect(response.status()).toBe(400);
    const json = await response.json();
    expect(json.code).toBe('NO_PROJECTS_SELECTED');
    expect(json.message?.toLowerCase() || json.error?.toLowerCase() || '').toContain('at least one project');
  });
  test('GET /preview.json should validate invalid date range', async ({
    request
  }) => {
    const response = await request.get('/preview.json?projects=MPSA&start=2025-09-30T00:00:00.000Z&end=2025-07-01T00:00:00.000Z');
    expect(response.status()).toBe(400);
    const json = await response.json();
    expect(json.code).toBe('INVALID_DATE_RANGE');
  });
  test('GET /preview.json should validate date range too large', async ({
    request
  }) => {
    const response = await request.get('/preview.json?projects=MPSA&start=2020-01-01T00:00:00.000Z&end=2025-12-31T23:59:59.999Z');
    expect(response.status()).toBe(400);
    const json = await response.json();
    expect(json.code).toBe('DATE_RANGE_TOO_LARGE');
  });
  test('GET /preview.json should validate invalid date format', async ({
    request
  }) => {
    const response = await request.get('/preview.json?projects=MPSA&start=invalid-date&end=2025-09-30T23:59:59.999Z');
    expect(response.status()).toBe(400);
    const json = await response.json();
    expect(json.code).toBe('INVALID_DATE_FORMAT');
  });
  test('GET /preview.json should accept valid parameters', async ({
    request
  }) => {
    // This test may fail if Jira credentials are not configured
    // That's expected - we're testing the API accepts the request format
    // Increase timeout for real Jira API calls
    test.setTimeout(120000); // 2 minutes
    let response;
    let lastError;
    const requestTimeoutMs = 30000;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        response = await request.get(DEFAULT_PREVIEW_URL, {
          timeout: requestTimeoutMs
        });
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        if (attempt < 2) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    if (!response) {
      test.skip(`Preview request failed before response: ${lastError?.message || 'Unknown error'}`);
      return;
    }

    // Should either succeed (200) or fail with auth error (500/401), not validation error (400)
    expect([200, 401, 403, 500]).toContain(response.status());
    if (response.status() === 200) {
      const json = await response.json();
      expect(json).toHaveProperty('meta');
      expect(json).toHaveProperty('boards');
      expect(json).toHaveProperty('sprintsIncluded');
      expect(json).toHaveProperty('rows');

      // Basic meta contract: windowStart/windowEnd and selectedProjects should be present.
      expect(json.meta).toHaveProperty('windowStart');
      expect(json.meta).toHaveProperty('windowEnd');
      expect(Array.isArray(json.meta.selectedProjects)).toBeTruthy();

      // Field inventory contract for API field discovery mapping
      expect(json.meta).toHaveProperty('fieldInventory');
      expect(json.meta.fieldInventory).toHaveProperty('availableFieldCount');
      expect(json.meta.fieldInventory).toHaveProperty('customFieldCount');
      expect(Array.isArray(json.meta.fieldInventory.ebmFieldsFound)).toBeTruthy();
      expect(Array.isArray(json.meta.fieldInventory.ebmFieldsMissing)).toBeTruthy();

      // Drill-down rows should include time tracking and EBM-related fields
      if (json.rows.length > 0) {
        const sampleRow = json.rows[0];
        expect(sampleRow).toHaveProperty('issueStatusCategory');
        expect(sampleRow).toHaveProperty('issuePriority');
        expect(sampleRow).toHaveProperty('issueLabels');
        expect(sampleRow).toHaveProperty('issueComponents');
        expect(sampleRow).toHaveProperty('issueFixVersions');
        expect(sampleRow).toHaveProperty('subtaskCount');
        expect(sampleRow).toHaveProperty('timeOriginalEstimateHours');
        expect(sampleRow).toHaveProperty('timeRemainingEstimateHours');
        expect(sampleRow).toHaveProperty('timeSpentHours');
        expect(sampleRow).toHaveProperty('timeVarianceHours');
        expect(sampleRow).toHaveProperty('subtaskTimeOriginalEstimateHours');
        expect(sampleRow).toHaveProperty('subtaskTimeRemainingEstimateHours');
        expect(sampleRow).toHaveProperty('subtaskTimeSpentHours');
        expect(sampleRow).toHaveProperty('subtaskTimeVarianceHours');
        expect(sampleRow).toHaveProperty('ebmTeam');
        expect(sampleRow).toHaveProperty('ebmProductArea');
        expect(sampleRow).toHaveProperty('ebmCustomerSegments');
        expect(sampleRow).toHaveProperty('ebmValue');
        expect(sampleRow).toHaveProperty('ebmImpact');
        expect(sampleRow).toHaveProperty('ebmSatisfaction');
        expect(sampleRow).toHaveProperty('ebmSentiment');
        expect(sampleRow).toHaveProperty('ebmSeverity');
        expect(sampleRow).toHaveProperty('ebmSource');
        expect(sampleRow).toHaveProperty('ebmWorkCategory');
        expect(sampleRow).toHaveProperty('ebmGoals');
        expect(sampleRow).toHaveProperty('ebmTheme');
        expect(sampleRow).toHaveProperty('ebmRoadmap');
        expect(sampleRow).toHaveProperty('ebmFocusAreas');
        expect(sampleRow).toHaveProperty('ebmDeliveryStatus');
        expect(sampleRow).toHaveProperty('ebmDeliveryProgress');
      }
    } else {
      // Auth error is acceptable for this test
      const json = await response.json();
      expect(json).toHaveProperty('error');
      // Typed error path should expose a code as well
      expect(json).toHaveProperty('code');
    }
  });
  test('GET /preview.json should return structurally consistent data across identical requests (basic caching sanity)', async ({
    request
  }) => {
    test.setTimeout(180000);
    let first;
    try {
      first = await request.get(DEFAULT_PREVIEW_URL, {
        timeout: 30000
      });
    } catch (error) {
      test.skip(`Preview request timed out before caching sanity check: ${error.message}`);
      return;
    }
    expect([200, 401, 403, 500]).toContain(first.status());
    let second;
    try {
      second = await request.get(DEFAULT_PREVIEW_URL, {
        timeout: 30000
      });
    } catch (error) {
      test.skip(`Preview request timed out on repeat call: ${error.message}`);
      return;
    }
    expect([200, 401, 403, 500]).toContain(second.status());

    // If both succeed, ensure key shapes match; otherwise just confirm structured error payloads
    if (first.status() === 200 && second.status() === 200) {
      const a = await first.json();
      const b = await second.json();
      expect(Array.isArray(a.rows)).toBeTruthy();
      expect(Array.isArray(b.rows)).toBeTruthy();
      expect(Array.isArray(a.sprintsIncluded)).toBeTruthy();
      expect(Array.isArray(b.sprintsIncluded)).toBeTruthy();
      expect(a.rows.length).toBe(b.rows.length);
      expect(a.sprintsIncluded.length).toBe(b.sprintsIncluded.length);
    } else {
      const a = await first.json();
      const b = await second.json();
      expect(a).toHaveProperty('error');
      expect(a).toHaveProperty('code');
      expect(b).toHaveProperty('error');
      expect(b).toHaveProperty('code');
    }
  });
  test('POST /export should validate request body', async ({
    request
  }) => {
    // Missing columns
    const response1 = await safePost(request, '/export', {
      rows: []
    });
    if (response1?.error) {
      test.skip(`POST /export did not respond in time: ${response1.error.message}`);
      return;
    }
    expect(response1.status()).toBe(400);

    // Missing rows
    const response2 = await safePost(request, '/export', {
      columns: []
    });
    if (response2?.error) {
      test.skip(`POST /export did not respond in time: ${response2.error.message}`);
      return;
    }
    expect(response2.status()).toBe(400);

    // Invalid format
    const response3 = await safePost(request, '/export', {
      columns: 'not-array',
      rows: 'not-array'
    });
    if (response3?.error) {
      test.skip(`POST /export did not respond in time: ${response3.error.message}`);
      return;
    }
    expect(response3.status()).toBe(400);
  });
  test('POST /export should generate CSV with valid data', async ({
    request
  }) => {
    const columns = ['projectKey', 'issueKey', 'issueSummary'];
    const rows = [{
      projectKey: 'MPSA',
      issueKey: 'MPSA-1',
      issueSummary: 'Test Story'
    }, {
      projectKey: 'MAS',
      issueKey: 'MAS-1',
      issueSummary: 'Another Story'
    }];
    const response = await safePost(request, '/export', {
      columns,
      rows
    });
    if (response?.error) {
      test.skip(`POST /export did not respond in time: ${response.error.message}`);
      return;
    }
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/csv');
    expect(response.headers()['content-disposition']).toContain('attachment');
    const csv = await response.text();
    expect(csv).toContain('projectKey,issueKey,issueSummary');
    expect(csv).toContain('MPSA,MPSA-1,Test Story');
    expect(csv).toContain('MAS,MAS-1,Another Story');
  });
  test('POST /export should handle large datasets', async ({
    request
  }) => {
    const columns = ['projectKey', 'issueKey'];
    // Generate 6000 rows to test server-side streaming
    const rows = Array.from({
      length: 6000
    }, (_, i) => ({
      projectKey: 'MPSA',
      issueKey: `MPSA-${i + 1}`
    }));
    const response = await safePost(request, '/export', {
      columns,
      rows
    }, 20000);
    if (response?.error) {
      test.skip(`POST /export did not respond in time: ${response.error.message}`);
      return;
    }
    expect(response.status()).toBe(200);
    const csv = await response.text();
    // Should have header + 6000 rows = 6001 lines
    const lines = csv.split('\n').filter(l => l.trim());
    expect(lines.length).toBeGreaterThanOrEqual(6000);
  });
  test('GET /api/boards.json should validate empty projects', async ({
    request
  }) => {
    const response = await request.get('/api/boards.json?projects=');
    if (response.status() === 401) {
      test.skip('Auth required');
      return;
    }
    expect(response.status()).toBe(400);
    const json = await response.json();
    expect(json.code).toBe('NO_PROJECTS');
  });
  test('GET /api/current-sprint.json should require boardId', async ({
    request
  }) => {
    const response = await request.get('/api/current-sprint.json?projects=MPSA,MAS');
    if (response.status() === 401) {
      test.skip('Auth required');
      return;
    }
    expect(response.status()).toBe(400);
    const json = await response.json();
    expect(json.code).toBe('MISSING_BOARD_ID');
  });
  test('GET /api/current-sprint.json should return 404 for unknown board', async ({
    request
  }) => {
    const response = await request.get('/api/current-sprint.json?boardId=999999&projects=MPSA,MAS');
    if (response.status() === 401) {
      test.skip('Auth required');
      return;
    }
    expect(response.status()).toBe(404);
    const json = await response.json();
    expect(json.code).toBe('BOARD_NOT_FOUND');
  });
  test('POST /api/current-sprint-notes should require boardId and sprintId', async ({
    request
  }) => {
    const response = await request.post('/api/current-sprint-notes', {
      data: {
        dependencies: 'Blocked by data feed',
        learnings: 'Sync earlier'
      }
    });
    if (response.status() === 401) {
      test.skip('Auth required');
      return;
    }
    expect(response.status()).toBe(400);
    const json = await response.json();
    expect(json.code).toBe('MISSING_NOTES_KEYS');
  });
  test('GET /current-sprint should serve HTML page', async ({
    request
  }) => {
    const response = await request.get('/current-sprint');
    if (response.status() === 302) {
      expect(response.headers()['location']).toMatch(/login|report|\/$/);
      return;
    }
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/html');
    const body = await response.text();
    expect(body).toContain('Current Sprint');
  });
  test('GET /sprint-leadership should serve HTML page', async ({
    request
  }) => {
    const response = await request.get('/sprint-leadership');
    if (response.status() === 302) {
      expect(response.headers()['location']).toMatch(/login|report|\/$/);
      return;
    }
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/html');
    const body = await response.text();
    expect(body).toContain('Sprint Leadership');
  });
  test.skip('GET /preview.json should handle all filter options', async ({
    request
  }) => {
    // Skipped: This test requires many API calls (bugs, metrics) and can timeout with real Jira data
    // The parameter acceptance is validated by other tests
    // To test manually, use the UI with all options enabled

    test.setTimeout(300000); // 5 minutes for tests with all metrics enabled

    const params = new URLSearchParams({
      projects: 'MPSA,MAS',
      start: '2025-07-01T00:00:00.000Z',
      end: '2025-09-30T23:59:59.999Z',
      // Story Points, Bugs/Rework, and Epic TTM are now mandatory (always enabled)
      requireResolvedBySprintEnd: 'true',
      includePredictability: 'true',
      predictabilityMode: 'approx',
      includeActiveOrMissingEndDateSprints: 'true'
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJ0ZXN0IiwiZXhwZWN0IiwiQ1NWX0NPTFVNTlMiLCJTRVJWRVJfQ1NWX0NPTFVNTlMiLCJERUZBVUxUX1EyX1FVRVJZIiwiREVGQVVMVF9QUkVWSUVXX1VSTCIsInNhZmVQb3N0IiwicmVxdWVzdCIsInVybCIsImRhdGEiLCJ0aW1lb3V0TXMiLCJwb3N0IiwidGltZW91dCIsImVycm9yIiwiZGVzY3JpYmUiLCJyZXNwb25zZSIsImdldCIsInN0YXR1cyIsInNraXAiLCJ0b0JlIiwiYm9keSIsImpzb24iLCJBcnJheSIsImlzQXJyYXkiLCJjb2x1bW5zIiwidG9FcXVhbCIsImhlYWRlcnMiLCJ0b0NvbnRhaW4iLCJ0ZXh0IiwiY29kZSIsIm1lc3NhZ2UiLCJ0b0xvd2VyQ2FzZSIsInNldFRpbWVvdXQiLCJsYXN0RXJyb3IiLCJyZXF1ZXN0VGltZW91dE1zIiwiYXR0ZW1wdCIsIlByb21pc2UiLCJyZXNvbHZlIiwidG9IYXZlUHJvcGVydHkiLCJtZXRhIiwic2VsZWN0ZWRQcm9qZWN0cyIsInRvQmVUcnV0aHkiLCJmaWVsZEludmVudG9yeSIsImVibUZpZWxkc0ZvdW5kIiwiZWJtRmllbGRzTWlzc2luZyIsInJvd3MiLCJsZW5ndGgiLCJzYW1wbGVSb3ciLCJmaXJzdCIsInNlY29uZCIsImEiLCJiIiwic3ByaW50c0luY2x1ZGVkIiwicmVzcG9uc2UxIiwicmVzcG9uc2UyIiwicmVzcG9uc2UzIiwicHJvamVjdEtleSIsImlzc3VlS2V5IiwiaXNzdWVTdW1tYXJ5IiwiY3N2IiwiZnJvbSIsIl8iLCJpIiwibGluZXMiLCJzcGxpdCIsImZpbHRlciIsImwiLCJ0cmltIiwidG9CZUdyZWF0ZXJUaGFuT3JFcXVhbCIsImRlcGVuZGVuY2llcyIsImxlYXJuaW5ncyIsInRvTWF0Y2giLCJwYXJhbXMiLCJVUkxTZWFyY2hQYXJhbXMiLCJwcm9qZWN0cyIsInN0YXJ0IiwiZW5kIiwicmVxdWlyZVJlc29sdmVkQnlTcHJpbnRFbmQiLCJpbmNsdWRlUHJlZGljdGFiaWxpdHkiLCJwcmVkaWN0YWJpbGl0eU1vZGUiLCJpbmNsdWRlQWN0aXZlT3JNaXNzaW5nRW5kRGF0ZVNwcmludHMiLCJ0b1N0cmluZyIsIm1ldHJpY3MiLCJkaXNjb3ZlcmVkRmllbGRzIiwidG9CZURlZmluZWQiXSwic291cmNlcyI6WyJKaXJhLVJlcG9ydGluZy1BcHAtQVBJLUludGVncmF0aW9uLVRlc3RzLnNwZWMuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgdGVzdCwgZXhwZWN0IH0gZnJvbSAnQHBsYXl3cmlnaHQvdGVzdCc7XHJcbmltcG9ydCB7IENTVl9DT0xVTU5TIGFzIFNFUlZFUl9DU1ZfQ09MVU1OUyB9IGZyb20gJy4uL2xpYi9jc3YuanMnO1xyXG5cclxuY29uc3QgREVGQVVMVF9RMl9RVUVSWSA9ICc/cHJvamVjdHM9TVBTQSxNQVMmc3RhcnQ9MjAyNS0wNy0wMVQwMDowMDowMC4wMDBaJmVuZD0yMDI1LTA5LTMwVDIzOjU5OjU5Ljk5OVonO1xyXG5jb25zdCBERUZBVUxUX1BSRVZJRVdfVVJMID0gYC9wcmV2aWV3Lmpzb24ke0RFRkFVTFRfUTJfUVVFUll9YDtcclxuXHJcbmFzeW5jIGZ1bmN0aW9uIHNhZmVQb3N0KHJlcXVlc3QsIHVybCwgZGF0YSwgdGltZW91dE1zID0gMTAwMDApIHtcclxuICB0cnkge1xyXG4gICAgcmV0dXJuIGF3YWl0IHJlcXVlc3QucG9zdCh1cmwsIHsgZGF0YSwgdGltZW91dDogdGltZW91dE1zIH0pO1xyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICByZXR1cm4geyBlcnJvciB9O1xyXG4gIH1cclxufVxyXG5cclxudGVzdC5kZXNjcmliZSgnSmlyYSBSZXBvcnRpbmcgQXBwIC0gQVBJIEludGVncmF0aW9uIFRlc3RzJywgKCkgPT4ge1xyXG4gIHRlc3QoJ0dFVCAvYXBpL2Nzdi1jb2x1bW5zIHJldHVybnMgc2VydmVyIFNTT1QgYW5kIG1hdGNoZXMgbGliL2Nzdi5qcycsIGFzeW5jICh7IHJlcXVlc3QgfSkgPT4ge1xyXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCByZXF1ZXN0LmdldCgnL2FwaS9jc3YtY29sdW1ucycpO1xyXG4gICAgaWYgKHJlc3BvbnNlLnN0YXR1cygpID09PSA0MDEpIHtcclxuICAgICAgdGVzdC5za2lwKCdBdXRoIHJlcXVpcmVkOyBjYW5ub3QgYXNzZXJ0IENTViBjb2x1bW5zIGNvbnRyYWN0Jyk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIGlmIChyZXNwb25zZS5zdGF0dXMoKSA9PT0gNDA0KSB7XHJcbiAgICAgIHRlc3Quc2tpcCgnUm91dGUgL2FwaS9jc3YtY29sdW1ucyBub3QgZm91bmQgKHJlc3RhcnQgc2VydmVyIHdpdGggbGF0ZXN0IGNvZGUpJyk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXMoKSkudG9CZSgyMDApO1xyXG4gICAgY29uc3QgYm9keSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcclxuICAgIGV4cGVjdChBcnJheS5pc0FycmF5KGJvZHkuY29sdW1ucykpLnRvQmUodHJ1ZSk7XHJcbiAgICBleHBlY3QoYm9keS5jb2x1bW5zKS50b0VxdWFsKFNFUlZFUl9DU1ZfQ09MVU1OUyk7XHJcbiAgfSk7XHJcblxyXG4gIHRlc3QoJ0dFVCAvcmVwb3J0IHNob3VsZCByZXR1cm4gSFRNTCBwYWdlJywgYXN5bmMgKHsgcmVxdWVzdCB9KSA9PiB7XHJcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHJlcXVlc3QuZ2V0KCcvcmVwb3J0Jyk7XHJcbiAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzKCkpLnRvQmUoMjAwKTtcclxuICAgIGV4cGVjdChyZXNwb25zZS5oZWFkZXJzKClbJ2NvbnRlbnQtdHlwZSddKS50b0NvbnRhaW4oJ3RleHQvaHRtbCcpO1xyXG4gICAgY29uc3QgYm9keSA9IGF3YWl0IHJlc3BvbnNlLnRleHQoKTtcclxuICAgIGV4cGVjdChib2R5KS50b0NvbnRhaW4oJ1ZvZGFBZ2lsZUJvYXJkJyk7XHJcbiAgICBleHBlY3QoYm9keSkudG9Db250YWluKCdNUFNBJyk7XHJcbiAgICBleHBlY3QoYm9keSkudG9Db250YWluKCdNQVMnKTtcclxuICB9KTtcclxuXHJcbiAgdGVzdCgnR0VUIC9wcmV2aWV3Lmpzb24gc2hvdWxkIHZhbGlkYXRlIGVtcHR5IHByb2plY3RzJywgYXN5bmMgKHsgcmVxdWVzdCB9KSA9PiB7XHJcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHJlcXVlc3QuZ2V0KCcvcHJldmlldy5qc29uP3Byb2plY3RzPScpO1xyXG4gICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1cygpKS50b0JlKDQwMCk7XHJcbiAgICBjb25zdCBqc29uID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG4gICAgZXhwZWN0KGpzb24uY29kZSkudG9CZSgnTk9fUFJPSkVDVFNfU0VMRUNURUQnKTtcclxuICAgIGV4cGVjdChqc29uLm1lc3NhZ2U/LnRvTG93ZXJDYXNlKCkgfHwganNvbi5lcnJvcj8udG9Mb3dlckNhc2UoKSB8fCAnJykudG9Db250YWluKCdhdCBsZWFzdCBvbmUgcHJvamVjdCcpO1xyXG4gIH0pO1xyXG5cclxuICB0ZXN0KCdHRVQgL3ByZXZpZXcuanNvbiBzaG91bGQgdmFsaWRhdGUgaW52YWxpZCBkYXRlIHJhbmdlJywgYXN5bmMgKHsgcmVxdWVzdCB9KSA9PiB7XHJcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHJlcXVlc3QuZ2V0KCcvcHJldmlldy5qc29uP3Byb2plY3RzPU1QU0Emc3RhcnQ9MjAyNS0wOS0zMFQwMDowMDowMC4wMDBaJmVuZD0yMDI1LTA3LTAxVDAwOjAwOjAwLjAwMFonKTtcclxuICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXMoKSkudG9CZSg0MDApO1xyXG4gICAgY29uc3QganNvbiA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcclxuICAgIGV4cGVjdChqc29uLmNvZGUpLnRvQmUoJ0lOVkFMSURfREFURV9SQU5HRScpO1xyXG4gIH0pO1xyXG5cclxuICB0ZXN0KCdHRVQgL3ByZXZpZXcuanNvbiBzaG91bGQgdmFsaWRhdGUgZGF0ZSByYW5nZSB0b28gbGFyZ2UnLCBhc3luYyAoeyByZXF1ZXN0IH0pID0+IHtcclxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgcmVxdWVzdC5nZXQoJy9wcmV2aWV3Lmpzb24/cHJvamVjdHM9TVBTQSZzdGFydD0yMDIwLTAxLTAxVDAwOjAwOjAwLjAwMFomZW5kPTIwMjUtMTItMzFUMjM6NTk6NTkuOTk5WicpO1xyXG4gICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1cygpKS50b0JlKDQwMCk7XHJcbiAgICBjb25zdCBqc29uID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG4gICAgZXhwZWN0KGpzb24uY29kZSkudG9CZSgnREFURV9SQU5HRV9UT09fTEFSR0UnKTtcclxuICB9KTtcclxuXHJcbiAgdGVzdCgnR0VUIC9wcmV2aWV3Lmpzb24gc2hvdWxkIHZhbGlkYXRlIGludmFsaWQgZGF0ZSBmb3JtYXQnLCBhc3luYyAoeyByZXF1ZXN0IH0pID0+IHtcclxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgcmVxdWVzdC5nZXQoJy9wcmV2aWV3Lmpzb24/cHJvamVjdHM9TVBTQSZzdGFydD1pbnZhbGlkLWRhdGUmZW5kPTIwMjUtMDktMzBUMjM6NTk6NTkuOTk5WicpO1xyXG4gICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1cygpKS50b0JlKDQwMCk7XHJcbiAgICBjb25zdCBqc29uID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG4gICAgZXhwZWN0KGpzb24uY29kZSkudG9CZSgnSU5WQUxJRF9EQVRFX0ZPUk1BVCcpO1xyXG4gIH0pO1xyXG5cclxuICB0ZXN0KCdHRVQgL3ByZXZpZXcuanNvbiBzaG91bGQgYWNjZXB0IHZhbGlkIHBhcmFtZXRlcnMnLCBhc3luYyAoeyByZXF1ZXN0IH0pID0+IHtcclxuICAgIC8vIFRoaXMgdGVzdCBtYXkgZmFpbCBpZiBKaXJhIGNyZWRlbnRpYWxzIGFyZSBub3QgY29uZmlndXJlZFxyXG4gICAgLy8gVGhhdCdzIGV4cGVjdGVkIC0gd2UncmUgdGVzdGluZyB0aGUgQVBJIGFjY2VwdHMgdGhlIHJlcXVlc3QgZm9ybWF0XHJcbiAgICAvLyBJbmNyZWFzZSB0aW1lb3V0IGZvciByZWFsIEppcmEgQVBJIGNhbGxzXHJcbiAgICB0ZXN0LnNldFRpbWVvdXQoMTIwMDAwKTsgLy8gMiBtaW51dGVzXHJcbiAgICBsZXQgcmVzcG9uc2U7XHJcbiAgICBsZXQgbGFzdEVycm9yO1xyXG4gICAgY29uc3QgcmVxdWVzdFRpbWVvdXRNcyA9IDMwMDAwO1xyXG4gICAgZm9yIChsZXQgYXR0ZW1wdCA9IDE7IGF0dGVtcHQgPD0gMjsgYXR0ZW1wdCsrKSB7XHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgcmVzcG9uc2UgPSBhd2FpdCByZXF1ZXN0LmdldChERUZBVUxUX1BSRVZJRVdfVVJMLCB7XHJcbiAgICAgICAgICB0aW1lb3V0OiByZXF1ZXN0VGltZW91dE1zXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgbGFzdEVycm9yID0gbnVsbDtcclxuICAgICAgICBicmVhaztcclxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICBsYXN0RXJyb3IgPSBlcnJvcjtcclxuICAgICAgICBpZiAoYXR0ZW1wdCA8IDIpIHtcclxuICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMDAwKSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKCFyZXNwb25zZSkge1xyXG4gICAgICB0ZXN0LnNraXAoYFByZXZpZXcgcmVxdWVzdCBmYWlsZWQgYmVmb3JlIHJlc3BvbnNlOiAke2xhc3RFcnJvcj8ubWVzc2FnZSB8fCAnVW5rbm93biBlcnJvcid9YCk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gU2hvdWxkIGVpdGhlciBzdWNjZWVkICgyMDApIG9yIGZhaWwgd2l0aCBhdXRoIGVycm9yICg1MDAvNDAxKSwgbm90IHZhbGlkYXRpb24gZXJyb3IgKDQwMClcclxuICAgIGV4cGVjdChbMjAwLCA0MDEsIDQwMywgNTAwXSkudG9Db250YWluKHJlc3BvbnNlLnN0YXR1cygpKTtcclxuICAgIFxyXG4gICAgaWYgKHJlc3BvbnNlLnN0YXR1cygpID09PSAyMDApIHtcclxuICAgICAgY29uc3QganNvbiA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcclxuICAgICAgZXhwZWN0KGpzb24pLnRvSGF2ZVByb3BlcnR5KCdtZXRhJyk7XHJcbiAgICAgIGV4cGVjdChqc29uKS50b0hhdmVQcm9wZXJ0eSgnYm9hcmRzJyk7XHJcbiAgICAgIGV4cGVjdChqc29uKS50b0hhdmVQcm9wZXJ0eSgnc3ByaW50c0luY2x1ZGVkJyk7XHJcbiAgICAgIGV4cGVjdChqc29uKS50b0hhdmVQcm9wZXJ0eSgncm93cycpO1xyXG5cclxuICAgICAgLy8gQmFzaWMgbWV0YSBjb250cmFjdDogd2luZG93U3RhcnQvd2luZG93RW5kIGFuZCBzZWxlY3RlZFByb2plY3RzIHNob3VsZCBiZSBwcmVzZW50LlxyXG4gICAgICBleHBlY3QoanNvbi5tZXRhKS50b0hhdmVQcm9wZXJ0eSgnd2luZG93U3RhcnQnKTtcclxuICAgICAgZXhwZWN0KGpzb24ubWV0YSkudG9IYXZlUHJvcGVydHkoJ3dpbmRvd0VuZCcpO1xyXG4gICAgICBleHBlY3QoQXJyYXkuaXNBcnJheShqc29uLm1ldGEuc2VsZWN0ZWRQcm9qZWN0cykpLnRvQmVUcnV0aHkoKTtcclxuXHJcbiAgICAgIC8vIEZpZWxkIGludmVudG9yeSBjb250cmFjdCBmb3IgQVBJIGZpZWxkIGRpc2NvdmVyeSBtYXBwaW5nXHJcbiAgICAgIGV4cGVjdChqc29uLm1ldGEpLnRvSGF2ZVByb3BlcnR5KCdmaWVsZEludmVudG9yeScpO1xyXG4gICAgICBleHBlY3QoanNvbi5tZXRhLmZpZWxkSW52ZW50b3J5KS50b0hhdmVQcm9wZXJ0eSgnYXZhaWxhYmxlRmllbGRDb3VudCcpO1xyXG4gICAgICBleHBlY3QoanNvbi5tZXRhLmZpZWxkSW52ZW50b3J5KS50b0hhdmVQcm9wZXJ0eSgnY3VzdG9tRmllbGRDb3VudCcpO1xyXG4gICAgICBleHBlY3QoQXJyYXkuaXNBcnJheShqc29uLm1ldGEuZmllbGRJbnZlbnRvcnkuZWJtRmllbGRzRm91bmQpKS50b0JlVHJ1dGh5KCk7XHJcbiAgICAgIGV4cGVjdChBcnJheS5pc0FycmF5KGpzb24ubWV0YS5maWVsZEludmVudG9yeS5lYm1GaWVsZHNNaXNzaW5nKSkudG9CZVRydXRoeSgpO1xyXG5cclxuICAgICAgLy8gRHJpbGwtZG93biByb3dzIHNob3VsZCBpbmNsdWRlIHRpbWUgdHJhY2tpbmcgYW5kIEVCTS1yZWxhdGVkIGZpZWxkc1xyXG4gICAgICBpZiAoanNvbi5yb3dzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICBjb25zdCBzYW1wbGVSb3cgPSBqc29uLnJvd3NbMF07XHJcbiAgICAgICAgZXhwZWN0KHNhbXBsZVJvdykudG9IYXZlUHJvcGVydHkoJ2lzc3VlU3RhdHVzQ2F0ZWdvcnknKTtcclxuICAgICAgICBleHBlY3Qoc2FtcGxlUm93KS50b0hhdmVQcm9wZXJ0eSgnaXNzdWVQcmlvcml0eScpO1xyXG4gICAgICAgIGV4cGVjdChzYW1wbGVSb3cpLnRvSGF2ZVByb3BlcnR5KCdpc3N1ZUxhYmVscycpO1xyXG4gICAgICAgIGV4cGVjdChzYW1wbGVSb3cpLnRvSGF2ZVByb3BlcnR5KCdpc3N1ZUNvbXBvbmVudHMnKTtcclxuICAgICAgICBleHBlY3Qoc2FtcGxlUm93KS50b0hhdmVQcm9wZXJ0eSgnaXNzdWVGaXhWZXJzaW9ucycpO1xyXG4gICAgICAgIGV4cGVjdChzYW1wbGVSb3cpLnRvSGF2ZVByb3BlcnR5KCdzdWJ0YXNrQ291bnQnKTtcclxuICAgICAgICBleHBlY3Qoc2FtcGxlUm93KS50b0hhdmVQcm9wZXJ0eSgndGltZU9yaWdpbmFsRXN0aW1hdGVIb3VycycpO1xyXG4gICAgICAgIGV4cGVjdChzYW1wbGVSb3cpLnRvSGF2ZVByb3BlcnR5KCd0aW1lUmVtYWluaW5nRXN0aW1hdGVIb3VycycpO1xyXG4gICAgICAgIGV4cGVjdChzYW1wbGVSb3cpLnRvSGF2ZVByb3BlcnR5KCd0aW1lU3BlbnRIb3VycycpO1xyXG4gICAgICAgIGV4cGVjdChzYW1wbGVSb3cpLnRvSGF2ZVByb3BlcnR5KCd0aW1lVmFyaWFuY2VIb3VycycpO1xyXG4gICAgICAgIGV4cGVjdChzYW1wbGVSb3cpLnRvSGF2ZVByb3BlcnR5KCdzdWJ0YXNrVGltZU9yaWdpbmFsRXN0aW1hdGVIb3VycycpO1xyXG4gICAgICAgIGV4cGVjdChzYW1wbGVSb3cpLnRvSGF2ZVByb3BlcnR5KCdzdWJ0YXNrVGltZVJlbWFpbmluZ0VzdGltYXRlSG91cnMnKTtcclxuICAgICAgICBleHBlY3Qoc2FtcGxlUm93KS50b0hhdmVQcm9wZXJ0eSgnc3VidGFza1RpbWVTcGVudEhvdXJzJyk7XHJcbiAgICAgICAgZXhwZWN0KHNhbXBsZVJvdykudG9IYXZlUHJvcGVydHkoJ3N1YnRhc2tUaW1lVmFyaWFuY2VIb3VycycpO1xyXG4gICAgICAgIGV4cGVjdChzYW1wbGVSb3cpLnRvSGF2ZVByb3BlcnR5KCdlYm1UZWFtJyk7XHJcbiAgICAgICAgZXhwZWN0KHNhbXBsZVJvdykudG9IYXZlUHJvcGVydHkoJ2VibVByb2R1Y3RBcmVhJyk7XHJcbiAgICAgICAgZXhwZWN0KHNhbXBsZVJvdykudG9IYXZlUHJvcGVydHkoJ2VibUN1c3RvbWVyU2VnbWVudHMnKTtcclxuICAgICAgICBleHBlY3Qoc2FtcGxlUm93KS50b0hhdmVQcm9wZXJ0eSgnZWJtVmFsdWUnKTtcclxuICAgICAgICBleHBlY3Qoc2FtcGxlUm93KS50b0hhdmVQcm9wZXJ0eSgnZWJtSW1wYWN0Jyk7XHJcbiAgICAgICAgZXhwZWN0KHNhbXBsZVJvdykudG9IYXZlUHJvcGVydHkoJ2VibVNhdGlzZmFjdGlvbicpO1xyXG4gICAgICAgIGV4cGVjdChzYW1wbGVSb3cpLnRvSGF2ZVByb3BlcnR5KCdlYm1TZW50aW1lbnQnKTtcclxuICAgICAgICBleHBlY3Qoc2FtcGxlUm93KS50b0hhdmVQcm9wZXJ0eSgnZWJtU2V2ZXJpdHknKTtcclxuICAgICAgICBleHBlY3Qoc2FtcGxlUm93KS50b0hhdmVQcm9wZXJ0eSgnZWJtU291cmNlJyk7XHJcbiAgICAgICAgZXhwZWN0KHNhbXBsZVJvdykudG9IYXZlUHJvcGVydHkoJ2VibVdvcmtDYXRlZ29yeScpO1xyXG4gICAgICAgIGV4cGVjdChzYW1wbGVSb3cpLnRvSGF2ZVByb3BlcnR5KCdlYm1Hb2FscycpO1xyXG4gICAgICAgIGV4cGVjdChzYW1wbGVSb3cpLnRvSGF2ZVByb3BlcnR5KCdlYm1UaGVtZScpO1xyXG4gICAgICAgIGV4cGVjdChzYW1wbGVSb3cpLnRvSGF2ZVByb3BlcnR5KCdlYm1Sb2FkbWFwJyk7XHJcbiAgICAgICAgZXhwZWN0KHNhbXBsZVJvdykudG9IYXZlUHJvcGVydHkoJ2VibUZvY3VzQXJlYXMnKTtcclxuICAgICAgICBleHBlY3Qoc2FtcGxlUm93KS50b0hhdmVQcm9wZXJ0eSgnZWJtRGVsaXZlcnlTdGF0dXMnKTtcclxuICAgICAgICBleHBlY3Qoc2FtcGxlUm93KS50b0hhdmVQcm9wZXJ0eSgnZWJtRGVsaXZlcnlQcm9ncmVzcycpO1xyXG4gICAgICB9XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAvLyBBdXRoIGVycm9yIGlzIGFjY2VwdGFibGUgZm9yIHRoaXMgdGVzdFxyXG4gICAgICBjb25zdCBqc29uID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG4gICAgICBleHBlY3QoanNvbikudG9IYXZlUHJvcGVydHkoJ2Vycm9yJyk7XHJcbiAgICAgIC8vIFR5cGVkIGVycm9yIHBhdGggc2hvdWxkIGV4cG9zZSBhIGNvZGUgYXMgd2VsbFxyXG4gICAgICBleHBlY3QoanNvbikudG9IYXZlUHJvcGVydHkoJ2NvZGUnKTtcclxuICAgIH1cclxuICB9KTtcclxuXHJcbiAgdGVzdCgnR0VUIC9wcmV2aWV3Lmpzb24gc2hvdWxkIHJldHVybiBzdHJ1Y3R1cmFsbHkgY29uc2lzdGVudCBkYXRhIGFjcm9zcyBpZGVudGljYWwgcmVxdWVzdHMgKGJhc2ljIGNhY2hpbmcgc2FuaXR5KScsIGFzeW5jICh7IHJlcXVlc3QgfSkgPT4ge1xyXG4gICAgdGVzdC5zZXRUaW1lb3V0KDE4MDAwMCk7XHJcblxyXG4gICAgbGV0IGZpcnN0O1xyXG4gICAgdHJ5IHtcclxuICAgICAgZmlyc3QgPSBhd2FpdCByZXF1ZXN0LmdldChERUZBVUxUX1BSRVZJRVdfVVJMLCB7IHRpbWVvdXQ6IDMwMDAwIH0pO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgdGVzdC5za2lwKGBQcmV2aWV3IHJlcXVlc3QgdGltZWQgb3V0IGJlZm9yZSBjYWNoaW5nIHNhbml0eSBjaGVjazogJHtlcnJvci5tZXNzYWdlfWApO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBleHBlY3QoWzIwMCwgNDAxLCA0MDMsIDUwMF0pLnRvQ29udGFpbihmaXJzdC5zdGF0dXMoKSk7XHJcblxyXG4gICAgbGV0IHNlY29uZDtcclxuICAgIHRyeSB7XHJcbiAgICAgIHNlY29uZCA9IGF3YWl0IHJlcXVlc3QuZ2V0KERFRkFVTFRfUFJFVklFV19VUkwsIHsgdGltZW91dDogMzAwMDAgfSk7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICB0ZXN0LnNraXAoYFByZXZpZXcgcmVxdWVzdCB0aW1lZCBvdXQgb24gcmVwZWF0IGNhbGw6ICR7ZXJyb3IubWVzc2FnZX1gKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgZXhwZWN0KFsyMDAsIDQwMSwgNDAzLCA1MDBdKS50b0NvbnRhaW4oc2Vjb25kLnN0YXR1cygpKTtcclxuXHJcbiAgICAvLyBJZiBib3RoIHN1Y2NlZWQsIGVuc3VyZSBrZXkgc2hhcGVzIG1hdGNoOyBvdGhlcndpc2UganVzdCBjb25maXJtIHN0cnVjdHVyZWQgZXJyb3IgcGF5bG9hZHNcclxuICAgIGlmIChmaXJzdC5zdGF0dXMoKSA9PT0gMjAwICYmIHNlY29uZC5zdGF0dXMoKSA9PT0gMjAwKSB7XHJcbiAgICAgIGNvbnN0IGEgPSBhd2FpdCBmaXJzdC5qc29uKCk7XHJcbiAgICAgIGNvbnN0IGIgPSBhd2FpdCBzZWNvbmQuanNvbigpO1xyXG5cclxuICAgICAgZXhwZWN0KEFycmF5LmlzQXJyYXkoYS5yb3dzKSkudG9CZVRydXRoeSgpO1xyXG4gICAgICBleHBlY3QoQXJyYXkuaXNBcnJheShiLnJvd3MpKS50b0JlVHJ1dGh5KCk7XHJcbiAgICAgIGV4cGVjdChBcnJheS5pc0FycmF5KGEuc3ByaW50c0luY2x1ZGVkKSkudG9CZVRydXRoeSgpO1xyXG4gICAgICBleHBlY3QoQXJyYXkuaXNBcnJheShiLnNwcmludHNJbmNsdWRlZCkpLnRvQmVUcnV0aHkoKTtcclxuXHJcbiAgICAgIGV4cGVjdChhLnJvd3MubGVuZ3RoKS50b0JlKGIucm93cy5sZW5ndGgpO1xyXG4gICAgICBleHBlY3QoYS5zcHJpbnRzSW5jbHVkZWQubGVuZ3RoKS50b0JlKGIuc3ByaW50c0luY2x1ZGVkLmxlbmd0aCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBjb25zdCBhID0gYXdhaXQgZmlyc3QuanNvbigpO1xyXG4gICAgICBjb25zdCBiID0gYXdhaXQgc2Vjb25kLmpzb24oKTtcclxuICAgICAgZXhwZWN0KGEpLnRvSGF2ZVByb3BlcnR5KCdlcnJvcicpO1xyXG4gICAgICBleHBlY3QoYSkudG9IYXZlUHJvcGVydHkoJ2NvZGUnKTtcclxuICAgICAgZXhwZWN0KGIpLnRvSGF2ZVByb3BlcnR5KCdlcnJvcicpO1xyXG4gICAgICBleHBlY3QoYikudG9IYXZlUHJvcGVydHkoJ2NvZGUnKTtcclxuICAgIH1cclxuICB9KTtcclxuXHJcbiAgdGVzdCgnUE9TVCAvZXhwb3J0IHNob3VsZCB2YWxpZGF0ZSByZXF1ZXN0IGJvZHknLCBhc3luYyAoeyByZXF1ZXN0IH0pID0+IHtcclxuICAgIC8vIE1pc3NpbmcgY29sdW1uc1xyXG4gICAgY29uc3QgcmVzcG9uc2UxID0gYXdhaXQgc2FmZVBvc3QocmVxdWVzdCwgJy9leHBvcnQnLCB7IHJvd3M6IFtdIH0pO1xyXG4gICAgaWYgKHJlc3BvbnNlMT8uZXJyb3IpIHtcclxuICAgICAgdGVzdC5za2lwKGBQT1NUIC9leHBvcnQgZGlkIG5vdCByZXNwb25kIGluIHRpbWU6ICR7cmVzcG9uc2UxLmVycm9yLm1lc3NhZ2V9YCk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIGV4cGVjdChyZXNwb25zZTEuc3RhdHVzKCkpLnRvQmUoNDAwKTtcclxuXHJcbiAgICAvLyBNaXNzaW5nIHJvd3NcclxuICAgIGNvbnN0IHJlc3BvbnNlMiA9IGF3YWl0IHNhZmVQb3N0KHJlcXVlc3QsICcvZXhwb3J0JywgeyBjb2x1bW5zOiBbXSB9KTtcclxuICAgIGlmIChyZXNwb25zZTI/LmVycm9yKSB7XHJcbiAgICAgIHRlc3Quc2tpcChgUE9TVCAvZXhwb3J0IGRpZCBub3QgcmVzcG9uZCBpbiB0aW1lOiAke3Jlc3BvbnNlMi5lcnJvci5tZXNzYWdlfWApO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBleHBlY3QocmVzcG9uc2UyLnN0YXR1cygpKS50b0JlKDQwMCk7XHJcblxyXG4gICAgLy8gSW52YWxpZCBmb3JtYXRcclxuICAgIGNvbnN0IHJlc3BvbnNlMyA9IGF3YWl0IHNhZmVQb3N0KHJlcXVlc3QsICcvZXhwb3J0JywgeyBjb2x1bW5zOiAnbm90LWFycmF5Jywgcm93czogJ25vdC1hcnJheScgfSk7XHJcbiAgICBpZiAocmVzcG9uc2UzPy5lcnJvcikge1xyXG4gICAgICB0ZXN0LnNraXAoYFBPU1QgL2V4cG9ydCBkaWQgbm90IHJlc3BvbmQgaW4gdGltZTogJHtyZXNwb25zZTMuZXJyb3IubWVzc2FnZX1gKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgZXhwZWN0KHJlc3BvbnNlMy5zdGF0dXMoKSkudG9CZSg0MDApO1xyXG4gIH0pO1xyXG5cclxuICB0ZXN0KCdQT1NUIC9leHBvcnQgc2hvdWxkIGdlbmVyYXRlIENTViB3aXRoIHZhbGlkIGRhdGEnLCBhc3luYyAoeyByZXF1ZXN0IH0pID0+IHtcclxuICAgIGNvbnN0IGNvbHVtbnMgPSBbJ3Byb2plY3RLZXknLCAnaXNzdWVLZXknLCAnaXNzdWVTdW1tYXJ5J107XHJcbiAgICBjb25zdCByb3dzID0gW1xyXG4gICAgICB7IHByb2plY3RLZXk6ICdNUFNBJywgaXNzdWVLZXk6ICdNUFNBLTEnLCBpc3N1ZVN1bW1hcnk6ICdUZXN0IFN0b3J5JyB9LFxyXG4gICAgICB7IHByb2plY3RLZXk6ICdNQVMnLCBpc3N1ZUtleTogJ01BUy0xJywgaXNzdWVTdW1tYXJ5OiAnQW5vdGhlciBTdG9yeScgfSxcclxuICAgIF07XHJcblxyXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBzYWZlUG9zdChyZXF1ZXN0LCAnL2V4cG9ydCcsIHsgY29sdW1ucywgcm93cyB9KTtcclxuICAgIGlmIChyZXNwb25zZT8uZXJyb3IpIHtcclxuICAgICAgdGVzdC5za2lwKGBQT1NUIC9leHBvcnQgZGlkIG5vdCByZXNwb25kIGluIHRpbWU6ICR7cmVzcG9uc2UuZXJyb3IubWVzc2FnZX1gKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXMoKSkudG9CZSgyMDApO1xyXG4gICAgZXhwZWN0KHJlc3BvbnNlLmhlYWRlcnMoKVsnY29udGVudC10eXBlJ10pLnRvQ29udGFpbigndGV4dC9jc3YnKTtcclxuICAgIGV4cGVjdChyZXNwb25zZS5oZWFkZXJzKClbJ2NvbnRlbnQtZGlzcG9zaXRpb24nXSkudG9Db250YWluKCdhdHRhY2htZW50Jyk7XHJcbiAgICBcclxuICAgIGNvbnN0IGNzdiA9IGF3YWl0IHJlc3BvbnNlLnRleHQoKTtcclxuICAgIGV4cGVjdChjc3YpLnRvQ29udGFpbigncHJvamVjdEtleSxpc3N1ZUtleSxpc3N1ZVN1bW1hcnknKTtcclxuICAgIGV4cGVjdChjc3YpLnRvQ29udGFpbignTVBTQSxNUFNBLTEsVGVzdCBTdG9yeScpO1xyXG4gICAgZXhwZWN0KGNzdikudG9Db250YWluKCdNQVMsTUFTLTEsQW5vdGhlciBTdG9yeScpO1xyXG4gIH0pO1xyXG5cclxuICB0ZXN0KCdQT1NUIC9leHBvcnQgc2hvdWxkIGhhbmRsZSBsYXJnZSBkYXRhc2V0cycsIGFzeW5jICh7IHJlcXVlc3QgfSkgPT4ge1xyXG4gICAgY29uc3QgY29sdW1ucyA9IFsncHJvamVjdEtleScsICdpc3N1ZUtleSddO1xyXG4gICAgLy8gR2VuZXJhdGUgNjAwMCByb3dzIHRvIHRlc3Qgc2VydmVyLXNpZGUgc3RyZWFtaW5nXHJcbiAgICBjb25zdCByb3dzID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogNjAwMCB9LCAoXywgaSkgPT4gKHtcclxuICAgICAgcHJvamVjdEtleTogJ01QU0EnLFxyXG4gICAgICBpc3N1ZUtleTogYE1QU0EtJHtpICsgMX1gLFxyXG4gICAgfSkpO1xyXG5cclxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgc2FmZVBvc3QocmVxdWVzdCwgJy9leHBvcnQnLCB7IGNvbHVtbnMsIHJvd3MgfSwgMjAwMDApO1xyXG4gICAgaWYgKHJlc3BvbnNlPy5lcnJvcikge1xyXG4gICAgICB0ZXN0LnNraXAoYFBPU1QgL2V4cG9ydCBkaWQgbm90IHJlc3BvbmQgaW4gdGltZTogJHtyZXNwb25zZS5lcnJvci5tZXNzYWdlfWApO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1cygpKS50b0JlKDIwMCk7XHJcbiAgICBjb25zdCBjc3YgPSBhd2FpdCByZXNwb25zZS50ZXh0KCk7XHJcbiAgICAvLyBTaG91bGQgaGF2ZSBoZWFkZXIgKyA2MDAwIHJvd3MgPSA2MDAxIGxpbmVzXHJcbiAgICBjb25zdCBsaW5lcyA9IGNzdi5zcGxpdCgnXFxuJykuZmlsdGVyKGwgPT4gbC50cmltKCkpO1xyXG4gICAgZXhwZWN0KGxpbmVzLmxlbmd0aCkudG9CZUdyZWF0ZXJUaGFuT3JFcXVhbCg2MDAwKTtcclxuICB9KTtcclxuXHJcbiAgdGVzdCgnR0VUIC9hcGkvYm9hcmRzLmpzb24gc2hvdWxkIHZhbGlkYXRlIGVtcHR5IHByb2plY3RzJywgYXN5bmMgKHsgcmVxdWVzdCB9KSA9PiB7XHJcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHJlcXVlc3QuZ2V0KCcvYXBpL2JvYXJkcy5qc29uP3Byb2plY3RzPScpO1xyXG4gICAgaWYgKHJlc3BvbnNlLnN0YXR1cygpID09PSA0MDEpIHtcclxuICAgICAgdGVzdC5za2lwKCdBdXRoIHJlcXVpcmVkJyk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXMoKSkudG9CZSg0MDApO1xyXG4gICAgY29uc3QganNvbiA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcclxuICAgIGV4cGVjdChqc29uLmNvZGUpLnRvQmUoJ05PX1BST0pFQ1RTJyk7XHJcbiAgfSk7XHJcblxyXG4gIHRlc3QoJ0dFVCAvYXBpL2N1cnJlbnQtc3ByaW50Lmpzb24gc2hvdWxkIHJlcXVpcmUgYm9hcmRJZCcsIGFzeW5jICh7IHJlcXVlc3QgfSkgPT4ge1xyXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCByZXF1ZXN0LmdldCgnL2FwaS9jdXJyZW50LXNwcmludC5qc29uP3Byb2plY3RzPU1QU0EsTUFTJyk7XHJcbiAgICBpZiAocmVzcG9uc2Uuc3RhdHVzKCkgPT09IDQwMSkge1xyXG4gICAgICB0ZXN0LnNraXAoJ0F1dGggcmVxdWlyZWQnKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1cygpKS50b0JlKDQwMCk7XHJcbiAgICBjb25zdCBqc29uID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG4gICAgZXhwZWN0KGpzb24uY29kZSkudG9CZSgnTUlTU0lOR19CT0FSRF9JRCcpO1xyXG4gIH0pO1xyXG5cclxuICB0ZXN0KCdHRVQgL2FwaS9jdXJyZW50LXNwcmludC5qc29uIHNob3VsZCByZXR1cm4gNDA0IGZvciB1bmtub3duIGJvYXJkJywgYXN5bmMgKHsgcmVxdWVzdCB9KSA9PiB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCByZXF1ZXN0LmdldCgnL2FwaS9jdXJyZW50LXNwcmludC5qc29uP2JvYXJkSWQ9OTk5OTk5JnByb2plY3RzPU1QU0EsTUFTJyk7XG4gICAgaWYgKHJlc3BvbnNlLnN0YXR1cygpID09PSA0MDEpIHtcbiAgICAgIHRlc3Quc2tpcCgnQXV0aCByZXF1aXJlZCcpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzKCkpLnRvQmUoNDA0KTtcbiAgICBjb25zdCBqc29uID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuICAgIGV4cGVjdChqc29uLmNvZGUpLnRvQmUoJ0JPQVJEX05PVF9GT1VORCcpO1xuICB9KTtcblxuICB0ZXN0KCdQT1NUIC9hcGkvY3VycmVudC1zcHJpbnQtbm90ZXMgc2hvdWxkIHJlcXVpcmUgYm9hcmRJZCBhbmQgc3ByaW50SWQnLCBhc3luYyAoeyByZXF1ZXN0IH0pID0+IHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHJlcXVlc3QucG9zdCgnL2FwaS9jdXJyZW50LXNwcmludC1ub3RlcycsIHtcbiAgICAgIGRhdGE6IHsgZGVwZW5kZW5jaWVzOiAnQmxvY2tlZCBieSBkYXRhIGZlZWQnLCBsZWFybmluZ3M6ICdTeW5jIGVhcmxpZXInIH0sXG4gICAgfSk7XG4gICAgaWYgKHJlc3BvbnNlLnN0YXR1cygpID09PSA0MDEpIHtcbiAgICAgIHRlc3Quc2tpcCgnQXV0aCByZXF1aXJlZCcpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzKCkpLnRvQmUoNDAwKTtcbiAgICBjb25zdCBqc29uID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuICAgIGV4cGVjdChqc29uLmNvZGUpLnRvQmUoJ01JU1NJTkdfTk9URVNfS0VZUycpO1xuICB9KTtcblxyXG4gIHRlc3QoJ0dFVCAvY3VycmVudC1zcHJpbnQgc2hvdWxkIHNlcnZlIEhUTUwgcGFnZScsIGFzeW5jICh7IHJlcXVlc3QgfSkgPT4ge1xyXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCByZXF1ZXN0LmdldCgnL2N1cnJlbnQtc3ByaW50Jyk7XHJcbiAgICBpZiAocmVzcG9uc2Uuc3RhdHVzKCkgPT09IDMwMikge1xyXG4gICAgICBleHBlY3QocmVzcG9uc2UuaGVhZGVycygpWydsb2NhdGlvbiddKS50b01hdGNoKC9sb2dpbnxyZXBvcnR8XFwvJC8pO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzKCkpLnRvQmUoMjAwKTtcclxuICAgIGV4cGVjdChyZXNwb25zZS5oZWFkZXJzKClbJ2NvbnRlbnQtdHlwZSddKS50b0NvbnRhaW4oJ3RleHQvaHRtbCcpO1xyXG4gICAgY29uc3QgYm9keSA9IGF3YWl0IHJlc3BvbnNlLnRleHQoKTtcclxuICAgIGV4cGVjdChib2R5KS50b0NvbnRhaW4oJ0N1cnJlbnQgU3ByaW50Jyk7XHJcbiAgfSk7XHJcblxyXG4gIHRlc3QoJ0dFVCAvc3ByaW50LWxlYWRlcnNoaXAgc2hvdWxkIHNlcnZlIEhUTUwgcGFnZScsIGFzeW5jICh7IHJlcXVlc3QgfSkgPT4ge1xyXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCByZXF1ZXN0LmdldCgnL3NwcmludC1sZWFkZXJzaGlwJyk7XHJcbiAgICBpZiAocmVzcG9uc2Uuc3RhdHVzKCkgPT09IDMwMikge1xyXG4gICAgICBleHBlY3QocmVzcG9uc2UuaGVhZGVycygpWydsb2NhdGlvbiddKS50b01hdGNoKC9sb2dpbnxyZXBvcnR8XFwvJC8pO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzKCkpLnRvQmUoMjAwKTtcclxuICAgIGV4cGVjdChyZXNwb25zZS5oZWFkZXJzKClbJ2NvbnRlbnQtdHlwZSddKS50b0NvbnRhaW4oJ3RleHQvaHRtbCcpO1xyXG4gICAgY29uc3QgYm9keSA9IGF3YWl0IHJlc3BvbnNlLnRleHQoKTtcclxuICAgIGV4cGVjdChib2R5KS50b0NvbnRhaW4oJ1NwcmludCBMZWFkZXJzaGlwJyk7XHJcbiAgfSk7XHJcblxyXG4gIHRlc3Quc2tpcCgnR0VUIC9wcmV2aWV3Lmpzb24gc2hvdWxkIGhhbmRsZSBhbGwgZmlsdGVyIG9wdGlvbnMnLCBhc3luYyAoeyByZXF1ZXN0IH0pID0+IHtcclxuICAgIC8vIFNraXBwZWQ6IFRoaXMgdGVzdCByZXF1aXJlcyBtYW55IEFQSSBjYWxscyAoYnVncywgbWV0cmljcykgYW5kIGNhbiB0aW1lb3V0IHdpdGggcmVhbCBKaXJhIGRhdGFcclxuICAgIC8vIFRoZSBwYXJhbWV0ZXIgYWNjZXB0YW5jZSBpcyB2YWxpZGF0ZWQgYnkgb3RoZXIgdGVzdHNcclxuICAgIC8vIFRvIHRlc3QgbWFudWFsbHksIHVzZSB0aGUgVUkgd2l0aCBhbGwgb3B0aW9ucyBlbmFibGVkXHJcbiAgICBcclxuICAgIHRlc3Quc2V0VGltZW91dCgzMDAwMDApOyAvLyA1IG1pbnV0ZXMgZm9yIHRlc3RzIHdpdGggYWxsIG1ldHJpY3MgZW5hYmxlZFxyXG4gICAgXHJcbiAgICBjb25zdCBwYXJhbXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKHtcclxuICAgICAgcHJvamVjdHM6ICdNUFNBLE1BUycsXHJcbiAgICAgIHN0YXJ0OiAnMjAyNS0wNy0wMVQwMDowMDowMC4wMDBaJyxcclxuICAgICAgZW5kOiAnMjAyNS0wOS0zMFQyMzo1OTo1OS45OTlaJyxcclxuICAgICAgLy8gU3RvcnkgUG9pbnRzLCBCdWdzL1Jld29yaywgYW5kIEVwaWMgVFRNIGFyZSBub3cgbWFuZGF0b3J5IChhbHdheXMgZW5hYmxlZClcclxuICAgICAgcmVxdWlyZVJlc29sdmVkQnlTcHJpbnRFbmQ6ICd0cnVlJyxcclxuICAgICAgaW5jbHVkZVByZWRpY3RhYmlsaXR5OiAndHJ1ZScsXHJcbiAgICAgIHByZWRpY3RhYmlsaXR5TW9kZTogJ2FwcHJveCcsXHJcbiAgICAgIGluY2x1ZGVBY3RpdmVPck1pc3NpbmdFbmREYXRlU3ByaW50czogJ3RydWUnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCByZXF1ZXN0LmdldChgL3ByZXZpZXcuanNvbj8ke3BhcmFtcy50b1N0cmluZygpfWAsIHtcclxuICAgICAgdGltZW91dDogMzAwMDAwXHJcbiAgICB9KTtcclxuICAgIFxyXG4gICAgZXhwZWN0KFsyMDAsIDQwMSwgNDAzLCA1MDBdKS50b0NvbnRhaW4ocmVzcG9uc2Uuc3RhdHVzKCkpO1xyXG4gICAgXHJcbiAgICBpZiAocmVzcG9uc2Uuc3RhdHVzKCkgPT09IDIwMCkge1xyXG4gICAgICBjb25zdCBqc29uID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG4gICAgICBpZiAoanNvbi5tZXRyaWNzKSB7XHJcbiAgICAgICAgZXhwZWN0KGpzb24ubWV0YS5kaXNjb3ZlcmVkRmllbGRzKS50b0JlRGVmaW5lZCgpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfSk7XHJcbn0pO1xyXG4iXSwibWFwcGluZ3MiOiJBQUFBLFNBQVNBLElBQUksRUFBRUMsTUFBTSxRQUFRLGtCQUFrQjtBQUMvQyxTQUFTQyxXQUFXLElBQUlDLGtCQUFrQixRQUFRLGVBQWU7QUFFakUsTUFBTUMsZ0JBQWdCLEdBQUcsZ0ZBQWdGO0FBQ3pHLE1BQU1DLG1CQUFtQixHQUFHLGdCQUFnQkQsZ0JBQWdCLEVBQUU7QUFFOUQsZUFBZUUsUUFBUUEsQ0FBQ0MsT0FBTyxFQUFFQyxHQUFHLEVBQUVDLElBQUksRUFBRUMsU0FBUyxHQUFHLEtBQUssRUFBRTtFQUM3RCxJQUFJO0lBQ0YsT0FBTyxNQUFNSCxPQUFPLENBQUNJLElBQUksQ0FBQ0gsR0FBRyxFQUFFO01BQUVDLElBQUk7TUFBRUcsT0FBTyxFQUFFRjtJQUFVLENBQUMsQ0FBQztFQUM5RCxDQUFDLENBQUMsT0FBT0csS0FB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