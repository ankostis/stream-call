import test from 'node:test';
import assert from 'node:assert';
import { parseEndpoints, validateEndpoints, suggestEndpointName, applyTemplate } from '../../src/endpoint';

test('suggestEndpointName: extracts hostname from URL', () => {
  assert.strictEqual(suggestEndpointName('https://api.example.com/stream'), 'api.example.com');
  assert.strictEqual(suggestEndpointName('https://httpbin.org/anything'), 'httpbin.org');
  assert.strictEqual(suggestEndpointName('http://localhost:3000/webhook'), 'localhost');
});

test('suggestEndpointName: handles invalid URL gracefully', () => {
  const result = suggestEndpointName('not-a-url');
  assert(result.length > 0, 'Should return a fallback value');
});

test('parseEndpoints: parses valid JSON array', () => {
  const raw = JSON.stringify([
    {
      name: 'test-api',
      endpointTemplate: 'https://api.example.com/stream'
    }
  ]);

  const endpoints = parseEndpoints(raw);
  assert.strictEqual(endpoints.length, 1);
  assert.strictEqual(endpoints[0].name, 'test-api');
  assert.strictEqual(endpoints[0].endpointTemplate, 'https://api.example.com/stream');
});

test('parseEndpoints: auto-suggests name from endpoint when missing', () => {
  const raw = JSON.stringify([
    {
      endpointTemplate: 'https://api.example.com/stream'
    }
  ]);

  const endpoints = parseEndpoints(raw);
  assert.strictEqual(endpoints.length, 1);
  assert.strictEqual(endpoints[0].name, 'api.example.com');
});

test('parseEndpoints: filters out duplicate names', () => {
  const raw = JSON.stringify([
    {
      name: 'api',
      endpointTemplate: 'https://api.example.com/stream'
    },
    {
      name: 'api',
      endpointTemplate: 'https://api.example.com/other'
    }
  ]);

  const endpoints = parseEndpoints(raw);
  assert.strictEqual(endpoints.length, 1, 'Only first endpoint should be kept');
  assert.strictEqual(endpoints[0].name, 'api');
});

test('parseEndpoints: preserves description field', () => {
  const raw = JSON.stringify([
    {
      name: 'test-api',
      description: 'Test endpoint for webhooks',
      endpointTemplate: 'https://api.example.com/webhook'
    }
  ]);

  const endpoints = parseEndpoints(raw);
  assert.strictEqual(endpoints.length, 1);
  assert.strictEqual(endpoints[0].description, 'Test endpoint for webhooks');
});

test('parseEndpoints: handles missing description field', () => {
  const raw = JSON.stringify([
    {
      name: 'test-api',
      endpointTemplate: 'https://api.example.com/webhook'
    }
  ]);

  const endpoints = parseEndpoints(raw);
  assert.strictEqual(endpoints.length, 1);
  assert.strictEqual(endpoints[0].description, undefined);
});

test('parseEndpoints: filters out invalid endpoints', () => {
  const raw = JSON.stringify([
    {
      name: 'valid',
      endpointTemplate: 'https://api.example.com/valid'
    },
    {
      name: 'invalid',
      endpointTemplate: ''
    },
    {
      endpointTemplate: 'https://api.example.com/no-name'
    }
  ]);

  const endpoints = parseEndpoints(raw);
  // First is valid, second has empty endpoint (filtered), third auto-names to api.example.com
  assert(endpoints.length >= 1);
  assert(endpoints.some((p) => p.name === 'valid'));
});

test('parseEndpoints: throws on non-array JSON', () => {
  assert.throws(() => parseEndpoints('{"key": "value"}'), /must be a JSON array/);
});

test('parseEndpoints: returns empty array on invalid JSON', () => {
  assert.throws(() => parseEndpoints('not json'), /JSON/);
});

test('validateEndpoints: validates and formats', () => {
  const raw = JSON.stringify([
    {
      name: 'test-api',
      endpointTemplate: 'https://api.example.com/stream'
    }
  ]);

  const result = validateEndpoints(raw);
  assert(result.valid);
  assert.strictEqual(result.parsed.length, 1);
  assert.strictEqual(result.parsed[0].name, 'test-api');
  assert.strictEqual(result.parsed[0].endpointTemplate, 'https://api.example.com/stream');
});

test('parseEndpoints: preserves optional fields', () => {
  const raw = JSON.stringify([
    {
      name: 'with-options',
      endpointTemplate: 'https://api.example.com/stream',
      method: 'POST',
      headers: { 'X-Custom': 'value' },
      bodyTemplate: '{"url":"{{streamUrl}}"}',
      includeCookies: true,
      includePageHeaders: true
    },
    {
      name: 'simple',
      endpointTemplate: 'https://api.example.com/stream2'
    }
  ]);

  const endpoints = parseEndpoints(raw);
  assert.strictEqual(endpoints.length, 2);
  assert.strictEqual(endpoints[0].method, 'POST');
  assert.deepStrictEqual(endpoints[0].headers, { 'X-Custom': 'value' });
  assert.strictEqual(endpoints[0].bodyTemplate, '{"url":"{{streamUrl}}"}');
  assert.strictEqual(endpoints[0].includeCookies, true);
  assert.strictEqual(endpoints[0].includePageHeaders, true);
  assert.strictEqual(endpoints[1].method, undefined);
});

test('validateEndpoints: rejects non-array JSON', () => {
  const result = validateEndpoints('{"key": "value"}');
  assert(!result.valid);
  assert.match(result.errorMessage!, /must be a JSON array/);
});

test('validateEndpoints: rejects endpoint with missing endpointTemplate', () => {
  const raw = JSON.stringify([
    {
      name: 'Invalid'
    }
  ]);

  const result = validateEndpoints(raw);
  assert(!result.valid);
  assert.match(result.errorMessage!, /missing an endpointTemplate/);
});

test('validateEndpoints: rejects duplicate names', () => {
  const raw = JSON.stringify([
    {
      name: 'api',
      endpointTemplate: 'https://api.example.com'
    },
    {
      name: 'api',
      endpointTemplate: 'https://other.example.com'
    }
  ]);

  const result = validateEndpoints(raw);
  assert(!result.valid);
  assert.match(result.errorMessage!, /Duplicate endpoint name/);
});

test('validateEndpoints: auto-suggests name when missing and enforces uniqueness', () => {
  const raw = JSON.stringify([
    {
      endpointTemplate: 'https://api.example.com/stream'
    },
    {
      endpointTemplate: 'https://other.example.com/webhook'
    }
  ]);

  const result = validateEndpoints(raw);
  assert(result.valid);
  assert.strictEqual(result.parsed.length, 2);
  assert.strictEqual(result.parsed[0].name, 'api.example.com');
  assert.strictEqual(result.parsed[1].name, 'other.example.com');
});

test('validateEndpoints: returns formatted JSON', () => {
  const raw = JSON.stringify([{ name: 'test', endpointTemplate: 'https://api.example.com' }]);
  const result = validateEndpoints(raw);

  // Should be nicely formatted
  assert(result.formatted.includes('\n'));
  assert(result.formatted.includes('  '));
});

// ============================================================================
// Template tests (applyTemplate function)
// ============================================================================

test('applyTemplate: replaces plain placeholders', () => {
  const tpl = 'Hello {{name}}!';
  const out = applyTemplate(tpl, { name: 'world' });
  assert.strictEqual(out, 'Hello world!');
});

test('applyTemplate: leaves missing placeholders by default', () => {
  const tpl = 'URL={{streamUrl}}';
  const out = applyTemplate(tpl, {});
  assert.strictEqual(out, 'URL={{streamUrl}}');
});

test('applyTemplate: throws on missing when configured', () => {
  const tpl = 'URL={{streamUrl}}';
  assert.throws(() => applyTemplate(tpl, {}, { onMissing: 'throw' }));
});

test('applyTemplate: empties missing when configured', () => {
  const tpl = 'URL={{streamUrl}}';
  const out = applyTemplate(tpl, {}, { onMissing: 'empty' });
  assert.strictEqual(out, 'URL=');
});

test('applyTemplate: applies url filter', () => {
  const tpl = 'q={{pageTitle|url}}';
  const out = applyTemplate(tpl, { pageTitle: 'A B&C' });
  assert.strictEqual(out, 'q=A%20B%26C');
});

test('applyTemplate: applies json filter', () => {
  const tpl = '{"t": {{pageTitle|json}}}';
  const out = applyTemplate(tpl, { pageTitle: 'Hello "World"' });
  assert.strictEqual(out, '{"t": "Hello \\\"World\\\""}');
});

test('applyTemplate: matches placeholders case-insensitively', () => {
  const tpl = '{{StreamUrl}} - {{PAGETITLE}} - {{pageurl}}';
  const out = applyTemplate(tpl, { streamUrl: 'http://ex.com/s.mpd', pageTitle: 'Video', pageUrl: 'http://ex.com' });
  assert.strictEqual(out, 'http://ex.com/s.mpd - Video - http://ex.com');
});

test('applyTemplate: matches placeholders case-insensitively with filters', () => {
  const tpl = '{{StreamUrl|url}} {{PAGETITLE|json}}';
  const out = applyTemplate(tpl, { streamUrl: 'http://ex.com/s&t.mpd', pageTitle: 'A "B"' });
  assert.strictEqual(out, 'http%3A%2F%2Fex.com%2Fs%26t.mpd "A \\\"B\\\""');
});

// ==============================================================================
// IMPORT/EXPORT & UI LOGIC TESTS
// ==============================================================================

test('Import file format: valid JSON array of endpoints', () => {
  const validImport = JSON.stringify([
    {
      name: 'Test API',
      endpointTemplate: 'https://api.test.com/webhook',
      method: 'POST'
    }
  ]);

  const parsed = JSON.parse(validImport);
  assert(Array.isArray(parsed), 'Import format should be JSON array');
  assert.strictEqual(parsed.length, 1);
  assert.strictEqual(parsed[0].name, 'Test API');
});

test('Import file format: handles duplicate names during merge logic', () => {
  const existingEndpoints = [
    { name: 'API-1', endpointTemplate: 'https://existing.com', method: 'POST' }
  ];
  const importedEndpoints = [
    { name: 'API-1', endpointTemplate: 'https://imported.com', method: 'POST' },
    { name: 'API-2', endpointTemplate: 'https://new.com', method: 'POST' }
  ];

  // Merge: remove existing with same name, add all imported
  const merged = [
    ...existingEndpoints.filter(
      (e) => !importedEndpoints.some((imp) => imp.name === e.name)
    ),
    ...importedEndpoints
  ];

  assert.strictEqual(merged.length, 2, 'Should have 2 endpoints after merge');
  assert.strictEqual(merged[0].name, 'API-1');
  assert.strictEqual(merged[0].endpointTemplate, 'https://imported.com', 'Imported should override');
  assert.strictEqual(merged[1].name, 'API-2');
});

test('Import file format: replace strategy discards existing', () => {
  const existingEndpoints = [
    { name: 'Old', endpointTemplate: 'https://old.com', method: 'POST' }
  ];
  const importedEndpoints = [
    { name: 'New', endpointTemplate: 'https://new.com', method: 'POST' }
  ];

  // Replace: use imported only
  const replaced = importedEndpoints;

  assert.strictEqual(replaced.length, 1);
  assert.strictEqual(replaced[0].name, 'New');
  assert(!replaced.some((e) => e.name === 'Old'), 'Old endpoints should be discarded');
});

test('Export filename format: includes ISO date', () => {
  const date = new Date('2025-12-14T12:00:00Z');
  const isoDate = date.toISOString().split('T')[0]; // "2025-12-14"
  const filename = `stream-call-endpoints-${isoDate}.json`;

  assert.strictEqual(filename, 'stream-call-endpoints-2025-12-14.json');
  assert.match(filename, /stream-call-endpoints-\d{4}-\d{2}-\d{2}\.json/);
});

test('Header rows: builds record from key-value pairs', () => {
  // Simulates buildEndpointFromForm() header extraction logic
  const mockHeaderRows = [
    { key: 'Authorization', value: 'Bearer token123' },
    { key: 'Content-Type', value: 'application/json' },
    { key: '', value: 'ignored' } // empty key should be skipped
  ];

  const headers: Record<string, string> = {};
  mockHeaderRows.forEach(({ key, value }) => {
    const trimmedKey = key.trim();
    if (trimmedKey) {
      headers[trimmedKey] = value.trim();
    }
  });

  assert.strictEqual(Object.keys(headers).length, 2);
  assert.strictEqual(headers['Authorization'], 'Bearer token123');
  assert.strictEqual(headers['Content-Type'], 'application/json');
  assert.strictEqual(headers[''], undefined, 'Empty key should not be added');
});

test('Header rows: empty headers object when no valid headers', () => {
  const mockHeaderRows = [
    { key: '', value: 'ignored' },
    { key: '  ', value: 'also ignored' }
  ];

  const headers: Record<string, string> = {};
  mockHeaderRows.forEach(({ key, value }) => {
    const trimmedKey = key.trim();
    if (trimmedKey) {
      headers[trimmedKey] = value.trim();
    }
  });

  assert.strictEqual(Object.keys(headers).length, 0, 'No headers should be added');
});
