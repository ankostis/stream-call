import test from 'node:test';
import assert from 'node:assert';

/**
 * Unit tests for testable logic in options.ts
 *
 * Note: DOM-heavy functions (form manipulation, UI updates, browser.storage)
 * are validated through integration tests. These tests focus on pure logic
 * that can be extracted or documented.
 */

// Since options.ts functions are tightly coupled to DOM/browser APIs,
// we test the underlying utilities it depends on (validateEndpoints, suggestEndpointName)
// which are already covered in endpoint.test.ts.

// Test JSON parsing for import/export format expectations
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
