import test from 'node:test';
import assert from 'node:assert';
import { parseEndpoints, validateEndpoints, suggestEndpointName } from '../../src/endpoint';

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
  assert.strictEqual(result.parsed[0].method, 'POST', 'Default method should be POST');
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
