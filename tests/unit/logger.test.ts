import { test } from 'node:test';
import * as assert from 'node:assert';
import { Logger, LogLevel, type LogEntry, type SlotMessage } from '../../src/logger';

// ==============================================================================
// RING BUFFER TESTS
// ==============================================================================

test('Logger: adds entry to ring buffer', () => {
  const logger = new Logger();
  logger.error('test-slot', 'Test message');
  
  assert.strictEqual(logger.logsRing.length, 1);
  assert.strictEqual(logger.logsRing[0].level, LogLevel.Error);
  assert.strictEqual(logger.logsRing[0].category, 'test-slot');
  assert.strictEqual(logger.logsRing[0].message, 'Test message');
});

test('Logger: ring buffer drops oldest when max exceeded', () => {
  const logger = new Logger();
  
  for (let i = 0; i < 105; i++) {
    logger.info('storage', `Message ${i}`);
  }
  
  assert.strictEqual(logger.logsRing.length, 100);
  assert.strictEqual(logger.logsRing[0].message, 'Message 5');
  assert.strictEqual(logger.logsRing[99].message, 'Message 104');
});

test('Logger: level-specific methods work correctly', () => {
  const logger = new Logger();
  
  logger.error('slot1', 'Error msg');
  logger.warn('slot2', 'Warn msg');
  logger.info('slot3', 'Info msg');
  logger.debug('slot4', 'Debug msg');
  
  assert.strictEqual(logger.logsRing[0].level, LogLevel.Error);
  assert.strictEqual(logger.logsRing[1].level, LogLevel.Warn);
  assert.strictEqual(logger.logsRing[2].level, LogLevel.Info);
  assert.strictEqual(logger.logsRing[3].level, LogLevel.Debug);
});

test('Logger: filterLogs by level', () => {
  const logger = new Logger();
  
  logger.error('slot1', 'Error 1');
  logger.warn('slot2', 'Warn 1');
  logger.error('slot3', 'Error 2');
  
  const errors = logger.filterLogs([LogLevel.Error]);
  assert.strictEqual(errors.length, 2);
  assert.strictEqual(errors[0].message, 'Error 1');
  assert.strictEqual(errors[1].message, 'Error 2');
});

test('Logger: filterLogs by category', () => {
  const logger = new Logger();
  
  logger.error('storage', 'Storage error');
  logger.error('endpoint', 'Endpoint error');
  logger.warn('storage', 'Storage warn');
  
  const storage = logger.filterLogs(undefined, ['storage']);
  assert.strictEqual(storage.length, 2);
  assert.strictEqual(storage[0].category, 'storage');
  assert.strictEqual(storage[1].category, 'storage');
});

test('Logger: filterLogs by level and category', () => {
  const logger = new Logger();
  
  logger.error('storage', 'Storage error');
  logger.warn('storage', 'Storage warn');
  logger.error('endpoint', 'Endpoint error');
  
  const storageErrors = logger.filterLogs([LogLevel.Error], ['storage']);
  assert.strictEqual(storageErrors.length, 1);
  assert.strictEqual(storageErrors[0].message, 'Storage error');
});

test('Logger: clearLogs removes all entries', () => {
  const logger = new Logger();
  
  logger.error('slot', 'Msg 1');
  logger.warn('slot', 'Msg 2');
  logger.clearLogs();
  
  assert.strictEqual(logger.logsRing.length, 0);
});

test('Logger: subscribeLogs receives notifications', () => {
  const logger = new Logger();
  let receivedEntries: LogEntry[] = [];
  
  logger.subscribeLogs((entries) => {
    receivedEntries = entries;
  });
  
  logger.error('test', 'Test message');
  
  assert.strictEqual(receivedEntries.length, 1);
  assert.strictEqual(receivedEntries[0].message, 'Test message');
});

test('Logger: subscribeLogs notification on clearLogs', () => {
  const logger = new Logger();
  let callCount = 0;
  
  logger.subscribeLogs(() => {
    callCount++;
  });
  
  logger.error('test', 'Test');
  logger.clearLogs();
  
  assert.strictEqual(callCount, 2);
});

test('Logger: unsubscribe from logs stops notifications', () => {
  const logger = new Logger();
  let callCount = 0;
  
  const unsubscribe = logger.subscribeLogs(() => {
    callCount++;
  });
  
  logger.error('test', 'Message 1');
  unsubscribe();
  logger.error('test', 'Message 2');
  
  assert.strictEqual(callCount, 1);
});

test('Logger: exportJSON returns valid JSON', () => {
  const logger = new Logger();
  
  logger.error('slot', 'Test error');
  logger.warn('slot', 'Test warn');
  
  const json = logger.exportJSON();
  const parsed = JSON.parse(json);
  
  assert.strictEqual(parsed.length, 2);
  assert.strictEqual(parsed[0].level, 'error');
  assert.strictEqual(parsed[0].message, 'Test error');
  assert.ok(parsed[0].timestamp);
});

// ==============================================================================
// PERSISTENT STATUS TESTS
// ==============================================================================

test('Logger: persistent status sets slot', () => {
  const logger = new Logger();
  
  logger.error('form-error', 'Invalid input');
  
  const current = logger.transientMsg();
  assert.ok(current !== null);
  assert.strictEqual(current.slot, 'form-error');
  assert.strictEqual(current.message, 'Invalid input');
  assert.strictEqual(current.expireTimestamp, undefined);
});

test('Logger: persistent status replaces older message in same slot', () => {
  const logger = new Logger();
  
  logger.error('form-error', 'First error');
  logger.error('form-error', 'Second error');
  
  const current = logger.transientMsg();
  assert.ok(current !== null);
  assert.strictEqual(current.message, 'Second error');
});

test('Logger: persistent status adds to ring buffer', () => {
  const logger = new Logger();
  
  logger.error('form-error', 'Error message');
  
  assert.strictEqual(logger.logsRing.length, 1);
  assert.strictEqual(logger.logsRing[0].category, 'form-error');
  assert.strictEqual(logger.logsRing[0].message, 'Error message');
});

// ==============================================================================
// TRANSIENT STATUS TESTS (flash methods)
// ==============================================================================

test('Logger: transient status sets expireTimestamp', () => {
  const logger = new Logger();
  
  logger.errorFlash(3000, 'save-status', 'Saved!');
  
  const current = logger.transientMsg();
  assert.ok(current !== null);
  assert.strictEqual(current.slot, 'save-status');
  assert.strictEqual(current.message, 'Saved!');
  assert.ok(current.expireTimestamp instanceof Date);
});

test('Logger: transient status adds to ring buffer', () => {
  const logger = new Logger();
  
  logger.infoFlash(1000, 'save-status', 'Saved!');
  
  assert.strictEqual(logger.logsRing.length, 1);
  assert.strictEqual(logger.logsRing[0].category, 'save-status');
  assert.strictEqual(logger.logsRing[0].message, 'Saved!');
});

test('Logger: transient status auto-expires', async () => {
  const logger = new Logger();
  
  logger.infoFlash(50, 'temp', 'Temporary message');
  
  assert.ok(logger.transientMsg() !== null);
  
  await new Promise((resolve) => setTimeout(resolve, 100));
  
  assert.ok(logger.transientMsg() === null);
});

test('Logger: transient expiration notifies subscribers', async () => {
  const logger = new Logger();
  let notificationCount = 0;
  
  logger.subscribeStatus(() => {
    notificationCount++;
  });
  
  logger.infoFlash(50, 'temp', 'Temporary');
  const initialCount = notificationCount;
  
  await new Promise((resolve) => setTimeout(resolve, 100));
  
  assert.ok(notificationCount > initialCount, 'Should notify on expiration');
});

test('Logger: multiple transient messages use single timer', async () => {
  const logger = new Logger();
  
  logger.infoFlash(100, 'slot1', 'First');
  logger.infoFlash(150, 'slot2', 'Second');
  logger.infoFlash(200, 'slot3', 'Third');
  
  // All should exist initially
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(logger.transientMsg() !== null);
  
  // First should expire
  await new Promise((resolve) => setTimeout(resolve, 100));
  const current1 = logger.transientMsg();
  assert.ok(current1 !== null);
  assert.ok(['slot2', 'slot3'].includes(current1.slot));
  
  // All should expire
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.ok(logger.transientMsg() === null);
});

// ==============================================================================
// PRIORITY TESTS
// ==============================================================================

test('Logger: transientMsg returns highest level', () => {
  const logger = new Logger();
  
  logger.info('info-slot', 'Info message');
  logger.warn('warn-slot', 'Warn message');
  logger.error('error-slot', 'Error message');
  
  const current = logger.transientMsg();
  assert.ok(current !== null);
  assert.strictEqual(current.level, LogLevel.Error);
});

test('Logger: transientMsg returns most recent at same level', async () => {
  const logger = new Logger();
  
  logger.error('slot1', 'First error');
  await new Promise((resolve) => setTimeout(resolve, 2));
  logger.error('slot2', 'Second error');
  await new Promise((resolve) => setTimeout(resolve, 2));
  logger.error('slot3', 'Third error');
  
  const current = logger.transientMsg();
  assert.ok(current !== null);
  assert.strictEqual(current.message, 'Third error');
});

test('Logger: transient expiration reveals lower-priority message', async () => {
  const logger = new Logger();
  
  logger.info('persistent', 'Persistent info');
  logger.errorFlash(50, 'transient', 'Transient error');
  
  assert.strictEqual(logger.transientMsg()?.level, LogLevel.Error);
  
  await new Promise((resolve) => setTimeout(resolve, 100));
  
  const current = logger.transientMsg();
  assert.ok(current !== null);
  assert.strictEqual(current.level, LogLevel.Info);
  assert.strictEqual(current.message, 'Persistent info');
});

// ==============================================================================
// SLOT MANAGEMENT TESTS
// ==============================================================================

test('Logger: clearSlot removes specific slot', () => {
  const logger = new Logger();
  
  logger.error('slot1', 'Error 1');
  logger.error('slot2', 'Error 2');
  
  logger.clearSlot('slot1');
  
  const current = logger.transientMsg();
  assert.ok(current !== null);
  assert.strictEqual(current.slot, 'slot2');
});

test('Logger: clearSlot with no args removes all slots', () => {
  const logger = new Logger();
  
  logger.error('slot1', 'Error 1');
  logger.warn('slot2', 'Warn 1');
  
  logger.clearSlot();
  
  assert.ok(logger.transientMsg() === null);
});

test('Logger: clearSlot filters by level', () => {
  const logger = new Logger();
  
  logger.error('slot1', 'Error');
  logger.warn('slot2', 'Warning');
  
  logger.clearSlot(undefined, LogLevel.Error);
  
  const current = logger.transientMsg();
  assert.ok(current !== null);
  assert.strictEqual(current.level, LogLevel.Warn);
});

test('Logger: clearSlot with slot and level filters correctly', () => {
  const logger = new Logger();
  
  logger.error('slot1', 'Error 1');
  logger.warn('slot2', 'Warn 1');
  
  logger.clearSlot('slot1', LogLevel.Warn);
  
  // Should NOT clear because level doesn't match
  assert.ok(logger.transientMsg()?.slot === 'slot1');
});

test('Logger: clearSlot notifies subscribers', () => {
  const logger = new Logger();
  let notified = false;
  
  logger.subscribeStatus(() => {
    notified = true;
  });
  
  logger.error('slot', 'Error');
  notified = false;
  
  logger.clearSlot('slot');
  
  assert.ok(notified);
});

// ==============================================================================
// SUBSCRIPTION TESTS
// ==============================================================================

test('Logger: subscribeStatus receives notification on status change', () => {
  const logger = new Logger();
  let receivedMsg: SlotMessage | null = null;
  
  logger.subscribeStatus((msg) => {
    receivedMsg = msg;
  });
  
  logger.error('test', 'Test error');
  
  assert.ok(receivedMsg !== null);
  assert.strictEqual(receivedMsg.message, 'Test error');
});

test('Logger: subscribeStatus receives notification on transient flash', () => {
  const logger = new Logger();
  let receivedMsg: SlotMessage | null = null;
  
  logger.subscribeStatus((msg) => {
    receivedMsg = msg;
  });
  
  logger.infoFlash(1000, 'test', 'Flash message');
  
  assert.ok(receivedMsg !== null);
  assert.strictEqual(receivedMsg.message, 'Flash message');
});

test('Logger: subscribeStatus receives notification on clearSlot', () => {
  const logger = new Logger();
  let callCount = 0;
  
  logger.subscribeStatus(() => {
    callCount++;
  });
  
  logger.error('test', 'Error');
  logger.clearSlot('test');
  
  assert.strictEqual(callCount, 2);
});

test('Logger: subscribeStatus unsubscribe stops notifications', () => {
  const logger = new Logger();
  let callCount = 0;
  
  const unsubscribe = logger.subscribeStatus(() => {
    callCount++;
  });
  
  logger.error('test', 'Message 1');
  unsubscribe();
  logger.error('test', 'Message 2');
  
  assert.strictEqual(callCount, 1);
});

test('Logger: empty state returns null', () => {
  const logger = new Logger();
  
  assert.ok(logger.transientMsg() === null);
});

test('Logger: slot isolation - messages in different slots dont interfere', () => {
  const logger = new Logger();
  
  logger.error('form-error', 'Form error');
  logger.warn('storage-error', 'Storage warn');
  
  logger.clearSlot('form-error');
  
  const current = logger.transientMsg();
  assert.ok(current !== null);
  assert.strictEqual(current.message, 'Storage warn');
});
