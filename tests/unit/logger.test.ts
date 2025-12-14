import test from 'node:test';
import assert from 'node:assert';
import { Logger } from '../../src/logger';

test('Logger: logs entry with all fields', () => {
  const logger = new Logger();
  logger.info('storage', 'Test message');

  const entries = logger.getAll();
  assert.strictEqual(entries.length, 1);
  assert.strictEqual(entries[0].level, 'info');
  assert.strictEqual(entries[0].category, 'storage');
  assert.strictEqual(entries[0].message, 'Test message');
  assert(entries[0].timestamp instanceof Date);
});

test('Logger: level methods work correctly', () => {
  const logger = new Logger();
  logger.error('endpoint-parsing', 'Error msg');
  logger.warn('form-input', 'Warn msg');
  logger.info('api-test', 'Info msg');
  logger.debug('import-export', 'Debug msg');

  const entries = logger.getAll();
  assert.strictEqual(entries.length, 4);
  assert.strictEqual(entries[0].level, 'error');
  assert.strictEqual(entries[1].level, 'warn');
  assert.strictEqual(entries[2].level, 'info');
  assert.strictEqual(entries[3].level, 'debug');
});

test('Logger: circular buffer drops oldest when max exceeded', () => {
  const logger = new Logger();

  // Add 105 entries (max is 100)
  for (let i = 0; i < 105; i++) {
    logger.info('storage', `Message ${i}`);
  }

  const entries = logger.getAll();
  assert.strictEqual(entries.length, 100, 'Should have exactly 100 entries');
  assert.strictEqual(entries[0].message, 'Message 5', 'Oldest 5 should be dropped');
  assert.strictEqual(entries[99].message, 'Message 104', 'Latest should be kept');
});

test('Logger: filter by level only', () => {
  const logger = new Logger();
  logger.error('storage', 'Error 1');
  logger.warn('form-input', 'Warn 1');
  logger.info('api-test', 'Info 1');
  logger.error('endpoint-parsing', 'Error 2');

  const errors = logger.filter(['error']);
  assert.strictEqual(errors.length, 2);
  assert(errors.every((e) => e.level === 'error'));

  const warnings = logger.filter(['warn']);
  assert.strictEqual(warnings.length, 1);
  assert.strictEqual(warnings[0].message, 'Warn 1');
});

test('Logger: filter by category only', () => {
  const logger = new Logger();
  logger.error('storage', 'Storage error');
  logger.warn('storage', 'Storage warn');
  logger.info('api-test', 'API info');
  logger.debug('form-input', 'Form debug');

  const storageEntries = logger.filter(undefined, ['storage']);
  assert.strictEqual(storageEntries.length, 2);
  assert(storageEntries.every((e) => e.category === 'storage'));
});

test('Logger: filter by level and category', () => {
  const logger = new Logger();
  logger.error('storage', 'Storage error');
  logger.warn('storage', 'Storage warn');
  logger.error('api-test', 'API error');
  logger.info('storage', 'Storage info');

  const storageErrors = logger.filter(['error'], ['storage']);
  assert.strictEqual(storageErrors.length, 1);
  assert.strictEqual(storageErrors[0].message, 'Storage error');
});

test('Logger: filter with empty arrays returns all', () => {
  const logger = new Logger();
  logger.error('storage', 'Msg 1');
  logger.warn('api-test', 'Msg 2');

  const all = logger.filter([], []);
  assert.strictEqual(all.length, 2);
});

test('Logger: filter with undefined returns all', () => {
  const logger = new Logger();
  logger.error('storage', 'Msg 1');
  logger.warn('api-test', 'Msg 2');

  const all = logger.filter();
  assert.strictEqual(all.length, 2);
});

test('Logger: clear removes all entries', () => {
  const logger = new Logger();
  logger.info('storage', 'Msg 1');
  logger.info('api-test', 'Msg 2');

  assert.strictEqual(logger.getAll().length, 2);

  logger.clear();
  assert.strictEqual(logger.getAll().length, 0);
});

test('Logger: subscribe receives notifications on new log', () => {
  const logger = new Logger();
  let notified = false;
  let receivedEntries: any[] = [];

  logger.subscribe((entries) => {
    notified = true;
    receivedEntries = entries;
  });

  logger.info('storage', 'Test message');

  assert.strictEqual(notified, true);
  assert.strictEqual(receivedEntries.length, 1);
  assert.strictEqual(receivedEntries[0].message, 'Test message');
});

test('Logger: subscribe receives notification on clear', () => {
  const logger = new Logger();
  let callCount = 0;

  logger.subscribe(() => {
    callCount++;
  });

  logger.info('storage', 'Msg 1');
  logger.clear();

  assert.strictEqual(callCount, 2, 'Should notify twice: log + clear');
});

test('Logger: unsubscribe stops notifications', () => {
  const logger = new Logger();
  let callCount = 0;

  const unsubscribe = logger.subscribe(() => {
    callCount++;
  });

  logger.info('storage', 'Msg 1');
  assert.strictEqual(callCount, 1);

  unsubscribe();

  logger.info('storage', 'Msg 2');
  assert.strictEqual(callCount, 1, 'Should not notify after unsubscribe');
});

test('Logger: exportJSON returns valid JSON with ISO timestamps', () => {
  const logger = new Logger();
  logger.error('storage', 'Error msg');
  logger.info('api-test', 'Info msg');

  const json = logger.exportJSON();
  const parsed = JSON.parse(json);

  assert.strictEqual(Array.isArray(parsed), true);
  assert.strictEqual(parsed.length, 2);
  assert.strictEqual(parsed[0].level, 'error');
  assert.strictEqual(parsed[0].category, 'storage');
  assert.strictEqual(parsed[0].message, 'Error msg');
  assert.match(parsed[0].timestamp, /^\d{4}-\d{2}-\d{2}T/);
  assert.strictEqual(parsed[1].level, 'info');
});

test('Logger: exportJSON formats with indentation', () => {
  const logger = new Logger();
  logger.info('storage', 'Test');

  const json = logger.exportJSON();
  assert(json.includes('\n'), 'Should have newlines for formatting');
  assert(json.includes('  '), 'Should have indentation');
});

test('Logger: getAll returns copy of entries (immutable)', () => {
  const logger = new Logger();
  logger.info('storage', 'Msg 1');

  const entries1 = logger.getAll();
  const entries2 = logger.getAll();

  assert.notStrictEqual(entries1, entries2, 'Should return different array instances');
  assert.strictEqual(entries1.length, entries2.length);
});
