import test from 'node:test';
import assert from 'node:assert';
import { parsePatterns, validatePatterns } from '../../src/config';

test('parsePatterns: parses valid JSON array', () => {
  const raw = JSON.stringify([
    {
      id: 'test-1',
      name: 'Test Pattern',
      endpointTemplate: 'https://api.example.com/stream'
    }
  ]);

  const patterns = parsePatterns(raw);
  assert.strictEqual(patterns.length, 1);
  assert.strictEqual(patterns[0].name, 'Test Pattern');
  assert.strictEqual(patterns[0].endpointTemplate, 'https://api.example.com/stream');
});

test('parsePatterns: assigns UUID to missing ids', () => {
  const raw = JSON.stringify([
    {
      name: 'No ID Pattern',
      endpointTemplate: 'https://api.example.com/stream'
    }
  ]);

  const patterns = parsePatterns(raw);
  assert.strictEqual(patterns.length, 1);
  assert(patterns[0].id, 'UUID should be generated');
});

test('parsePatterns: filters out invalid patterns', () => {
  const raw = JSON.stringify([
    {
      id: 'valid',
      name: 'Valid',
      endpointTemplate: 'https://api.example.com/valid'
    },
    {
      id: 'invalid',
      name: 'Missing endpoint'
    },
    {
      id: 'empty-endpoint',
      name: 'Empty endpoint',
      endpointTemplate: ''
    }
  ]);

  const patterns = parsePatterns(raw);
  assert.strictEqual(patterns.length, 1);
  assert.strictEqual(patterns[0].name, 'Valid');
});

test('parsePatterns: returns empty array on invalid JSON', () => {
  const patterns = parsePatterns('not json');
  assert.strictEqual(patterns.length, 0);
});

test('validatePatterns: validates and formats', () => {
  const raw = JSON.stringify([
    {
      name: 'Test',
      endpointTemplate: 'https://api.example.com/stream'
    }
  ]);

  const result = validatePatterns(raw);
  assert(result.valid);
  assert.strictEqual(result.parsed.length, 1);
  assert(result.parsed[0].id, 'ID should be generated');
  assert.strictEqual(result.parsed[0].method, 'POST', 'Default method should be POST');
  assert.strictEqual(result.parsed[0].includePageInfo, true, 'Default includePageInfo should be true');
});

test('validatePatterns: rejects non-array JSON', () => {
  const result = validatePatterns('{"key": "value"}');
  assert(!result.valid);
  assert.match(result.errorMessage!, /must be a JSON array/);
});

test('validatePatterns: rejects pattern with missing endpointTemplate', () => {
  const raw = JSON.stringify([
    {
      name: 'Invalid',
      method: 'POST'
    }
  ]);

  const result = validatePatterns(raw);
  assert(!result.valid);
  assert.match(result.errorMessage!, /missing an endpointTemplate/);
});

test('validatePatterns: returns formatted JSON', () => {
  const raw = JSON.stringify([{ name: 'T', endpointTemplate: 'https://api.example.com' }]);
  const result = validatePatterns(raw);

  // Should be nicely formatted
  assert(result.formatted.includes('\n'));
  assert(result.formatted.includes('  '));
});
