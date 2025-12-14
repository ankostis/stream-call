import test from 'node:test';
import assert from 'node:assert';
import { StatusBar } from '../../src/status-bar';
import { Logger } from '../../src/logger';

test('StatusBar: post() stores persistent message in slot', () => {
  const statusBar = new StatusBar();
  statusBar.post('form-error', 'error', 'Invalid input');

  const current = statusBar.getCurrent();
  assert(current !== null);
  assert.strictEqual(current.slot, 'form-error');
  assert.strictEqual(current.level, 'error');
  assert.strictEqual(current.message, 'Invalid input');
  assert.strictEqual(current.isTransient, false);
});

test('StatusBar: post() replaces older message in same slot', () => {
  const statusBar = new StatusBar();
  statusBar.post('form-error', 'error', 'First error');
  statusBar.post('form-error', 'warn', 'Second error');

  const current = statusBar.getCurrent();
  assert(current !== null);
  assert.strictEqual(current.message, 'Second error');
  assert.strictEqual(current.level, 'warn');
});

test('StatusBar: flash() sets transient message', () => {
  const statusBar = new StatusBar();
  statusBar.flash('info', '✅ Saved', 5000);

  const current = statusBar.getCurrent();
  assert(current !== null);
  assert.strictEqual(current.message, '✅ Saved');
  assert.strictEqual(current.isTransient, true);
  assert.strictEqual(current.timeout, 5000);
});

test('StatusBar: transient overrides persistent (priority)', () => {
  const statusBar = new StatusBar();
  statusBar.post('form-error', 'error', 'Persistent error');
  statusBar.flash('info', '✅ Saved', 5000);

  const current = statusBar.getCurrent();
  assert(current !== null);
  assert.strictEqual(current.message, '✅ Saved', 'Transient should win');
  assert.strictEqual(current.isTransient, true);
});

test('StatusBar: transient auto-clears after timeout', async () => {
  const statusBar = new StatusBar();
  statusBar.flash('info', '✅ Saved', 100); // Short timeout for testing

  let current = statusBar.getCurrent();
  assert(current !== null);
  assert.strictEqual(current.message, '✅ Saved');

  // Wait for timeout
  await new Promise((resolve) => setTimeout(resolve, 150));

  current = statusBar.getCurrent();
  assert.strictEqual(current, null, 'Transient should be cleared');
});

test('StatusBar: after transient clears, persistent becomes visible', async () => {
  const statusBar = new StatusBar();
  statusBar.post('form-error', 'error', 'Persistent error');
  statusBar.flash('info', '✅ Saved', 100);

  // Wait for transient to clear
  await new Promise((resolve) => setTimeout(resolve, 150));

  const current = statusBar.getCurrent();
  assert(current !== null);
  assert.strictEqual(current.message, 'Persistent error', 'Should fall back to persistent');
});

test('StatusBar: clear() removes specific slot', () => {
  const statusBar = new StatusBar();
  statusBar.post('form-error', 'error', 'Error 1');
  statusBar.post('storage-error', 'error', 'Error 2');

  statusBar.clear('form-error');

  const current = statusBar.getCurrent();
  assert(current !== null);
  assert.strictEqual(current.message, 'Error 2', 'Should show other slot');
});

test('StatusBar: clear() with no args removes all slots', () => {
  const statusBar = new StatusBar();
  statusBar.post('form-error', 'error', 'Error 1');
  statusBar.post('storage-error', 'error', 'Error 2');

  statusBar.clear();

  const current = statusBar.getCurrent();
  assert.strictEqual(current, null, 'All slots should be cleared');
});

test('StatusBar: clear() by level filters correctly', () => {
  const statusBar = new StatusBar();
  statusBar.post('form-error', 'error', 'Error msg');
  statusBar.post('storage-error', 'warn', 'Warning msg');

  statusBar.clear(undefined, 'error');

  const current = statusBar.getCurrent();
  assert(current !== null);
  assert.strictEqual(current.message, 'Warning msg', 'Should keep warn level');
});

test('StatusBar: getCurrent() returns highest level persistent', () => {
  const statusBar = new StatusBar();
  statusBar.post('form-error', 'info', 'Info msg');
  statusBar.post('storage-error', 'error', 'Error msg');
  statusBar.post('template-error', 'warn', 'Warn msg');

  const current = statusBar.getCurrent();
  assert(current !== null);
  assert.strictEqual(current.level, 'error', 'Error should have highest priority');
  assert.strictEqual(current.message, 'Error msg');
});

test('StatusBar: getCurrent() returns oldest in same level', () => {
  const statusBar = new StatusBar();

  // Add multiple errors with slight delays to ensure timestamp ordering
  statusBar.post('form-error', 'error', 'First error');
  statusBar.post('storage-error', 'error', 'Second error');
  statusBar.post('template-error', 'error', 'Third error');

  const current = statusBar.getCurrent();
  assert(current !== null);
  assert.strictEqual(current.message, 'First error', 'Should return oldest at same level');
});

test('StatusBar: slot isolation (messages in different slots dont interfere)', () => {
  const statusBar = new StatusBar();
  statusBar.post('form-error', 'error', 'Form error');
  statusBar.post('storage-error', 'warn', 'Storage warn');

  statusBar.clear('form-error');

  const current = statusBar.getCurrent();
  assert(current !== null);
  assert.strictEqual(current.message, 'Storage warn', 'Other slot should remain');
});

test('StatusBar: subscribe receives notification on post()', () => {
  const statusBar = new StatusBar();
  let notified = false;
  let receivedMsg: any = null;

  statusBar.subscribe((msg) => {
    notified = true;
    receivedMsg = msg;
  });

  statusBar.post('form-error', 'error', 'Test error');

  assert.strictEqual(notified, true);
  assert(receivedMsg !== null);
  assert.strictEqual(receivedMsg.message, 'Test error');
});

test('StatusBar: subscribe receives notification on flash()', () => {
  const statusBar = new StatusBar();
  let notified = false;

  statusBar.subscribe(() => {
    notified = true;
  });

  statusBar.flash('info', '✅ Saved', 3000);

  assert.strictEqual(notified, true);
});

test('StatusBar: subscribe receives notification on clear()', () => {
  const statusBar = new StatusBar();
  let callCount = 0;

  statusBar.subscribe(() => {
    callCount++;
  });

  statusBar.post('form-error', 'error', 'Error');
  statusBar.clear('form-error');

  assert.strictEqual(callCount, 2, 'Should notify on set + clear');
});

test('StatusBar: unsubscribe stops notifications', () => {
  const statusBar = new StatusBar();
  let callCount = 0;

  const unsubscribe = statusBar.subscribe(() => {
    callCount++;
  });

  statusBar.post('form-error', 'error', 'Error');
  assert.strictEqual(callCount, 1);

  unsubscribe();

  statusBar.post('storage-error', 'error', 'Another error');
  assert.strictEqual(callCount, 1, 'Should not notify after unsubscribe');
});

test('StatusBar: setLogger() integrates with logger', () => {
  const logger = new Logger();
  const statusBar = new StatusBar();
    statusBar.setLogger(logger);

  statusBar.post('form-error', 'error', 'Form error msg');

  const entries = logger.getAll();
  assert.strictEqual(entries.length, 1);
  assert.strictEqual(entries[0].level, 'error');
    assert.strictEqual(entries[0].category, 'form-error');
  assert.strictEqual(entries[0].message, 'Form error msg');
});

test('StatusBar: logger integration for flash()', () => {
  const logger = new Logger();
  const statusBar = new StatusBar();
  statusBar.setLogger(logger);

  statusBar.flash('info', '✅ Saved successfully', 3000);

  const entries = logger.getAll();
  assert.strictEqual(entries.length, 1);
  assert.strictEqual(entries[0].level, 'info');
  assert.strictEqual(entries[0].message, '✅ Saved successfully');
});

test('StatusBar: empty state returns null', () => {
  const statusBar = new StatusBar();

  const current = statusBar.getCurrent();
  assert.strictEqual(current, null);
});

test('StatusBar: flash() with 0 timeout does not auto-clear', async () => {
  const statusBar = new StatusBar();
  statusBar.flash('info', 'Persistent action', 0);

  await new Promise((resolve) => setTimeout(resolve, 100));

  const current = statusBar.getCurrent();
  assert(current !== null);
  assert.strictEqual(current.message, 'Persistent action', 'Should not clear with 0 timeout');
});

test('StatusBar: stacked transients restore previous after later expires', async () => {
  const statusBar = new StatusBar();
  // Flash A (longer), then B (shorter)
  statusBar.flash('info', 'A', 200);
  statusBar.flash('warn', 'B', 100);

  // Initially B should be visible (latest)
  let current = statusBar.getCurrent();
  assert(current !== null);
  assert.strictEqual(current?.message, 'B');
  assert.strictEqual(current?.level, 'warn');

  // After 120ms, B expires, A should reappear
  await new Promise((resolve) => setTimeout(resolve, 120));
  current = statusBar.getCurrent();
  assert(current !== null);
  assert.strictEqual(current?.message, 'A');
  assert.strictEqual(current?.level, 'info');

  // After total 220ms, A should expire too → fallback to null (no persistent)
  await new Promise((resolve) => setTimeout(resolve, 100));
  current = statusBar.getCurrent();
  assert.strictEqual(current, null);
});
