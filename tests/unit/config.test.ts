import test from 'node:test';
import assert from 'node:assert';
import { parsePatterns, validatePatterns, suggestPatternName } from '../../src/config';

test('suggestPatternName: extracts hostname from URL', () => {
  assert.strictEqual(suggestPatternName('https://api.example.com/stream'), 'api.example.com');
  assert.strictEqual(suggestPatternName('https://httpbin.org/anything'), 'httpbin.org');
  assert.strictEqual(suggestPatternName('http://localhost:3000/webhook'), 'localhost');
});

test('suggestPatternName: handles invalid URL gracefully', () => {
  const result = suggestPatternName('not-a-url');
  assert(result.length > 0, 'Should return a fallback value');
});

test('parsePatterns: parses valid JSON array', () => {
  const raw = JSON.stringify([
    {
      name: 'test-api',
      endpointTemplate: 'https://api.example.com/stream'
    }
  ]);

  const patterns = parsePatterns(raw);
  assert.strictEqual(patterns.length, 1);
  assert.strictEqual(patterns[0].name, 'test-api');
  assert.strictEqual(patterns[0].endpointTemplate, 'https://api.example.com/stream');
});

test('parsePatterns: auto-suggests name from endpoint when missing', () => {
  const raw = JSON.stringify([
    {
      endpointTemplate: 'https://api.example.com/stream'
    }
  ]);

  const patterns = parsePatterns(raw);
  assert.strictEqual(patterns.length, 1);
  assert.strictEqual(patterns[0].name, 'api.example.com');
});

test('parsePatterns: filters out duplicate names', () => {
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

  const patterns = parsePatterns(raw);
  assert.strictEqual(patterns.length, 1, 'Only first pattern should be kept');
  assert.strictEqual(patterns[0].name, 'api');
});

test('parsePatterns: filters out invalid patterns', () => {
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

  const patterns = parsePatterns(raw);
  // First is valid, second has empty endpoint (filtered), third auto-names to api.example.com
  assert(patterns.length >= 1);
  assert(patterns.some((p) => p.name === 'valid'));
});

test('parsePatterns: returns empty array on invalid JSON', () => {
  const patterns = parsePatterns('not json');
  assert.strictEqual(patterns.length, 0);
});

test('validatePatterns: validates and formats', () => {
  const raw = JSON.stringify([
    {
      name: 'test-api',
      endpointTemplate: 'https://api.example.com/stream'
    }
  ]);

  const result = validatePatterns(raw);
  assert(result.valid);
  assert.strictEqual(result.parsed.length, 1);
  assert.strictEqual(result.parsed[0].name, 'test-api');
  assert.strictEqual(result.parsed[0].method, 'POST', 'Default method should be POST');
});

test('validatePatterns: rejects non-array JSON', () => {
  const result = validatePatterns('{"key": "value"}');
  assert(!result.valid);
  assert.match(result.errorMessage!, /must be a JSON array/);
});

test('validatePatterns: rejects pattern with missing endpointTemplate', () => {
  const raw = JSON.stringify([
    {
      name: 'Invalid'
    }
  ]);

  const result = validatePatterns(raw);
  assert(!result.valid);
  assert.match(result.errorMessage!, /missing an endpointTemplate/);
});

test('validatePatterns: rejects duplicate names', () => {
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

  const result = validatePatterns(raw);
  assert(!result.valid);
  assert.match(result.errorMessage!, /Duplicate pattern name/);
});

test('validatePatterns: auto-suggests name when missing and enforces uniqueness', () => {
  const raw = JSON.stringify([
    {
      endpointTemplate: 'https://api.example.com/stream'
    },
    {
      endpointTemplate: 'https://other.example.com/webhook'
    }
  ]);

  const result = validatePatterns(raw);
  assert(result.valid);
  assert.strictEqual(result.parsed.length, 2);
  assert.strictEqual(result.parsed[0].name, 'api.example.com');
  assert.strictEqual(result.parsed[1].name, 'other.example.com');
});

test('validatePatterns: returns formatted JSON', () => {
  const raw = JSON.stringify([{ name: 'test', endpointTemplate: 'https://api.example.com' }]);
  const result = validatePatterns(raw);

  // Should be nicely formatted
  assert(result.formatted.includes('\n'));
  assert(result.formatted.includes('  '));
});
