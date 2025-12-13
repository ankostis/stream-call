import test from 'node:test';
import assert from 'node:assert';
import { applyTemplate } from '../../src/template';

test('replaces plain placeholders', () => {
  const tpl = 'Hello {{name}}!';
  const out = applyTemplate(tpl, { name: 'world' });
  assert.strictEqual(out, 'Hello world!');
});

test('leaves missing placeholders by default', () => {
  const tpl = 'URL={{streamUrl}}';
  const out = applyTemplate(tpl, {});
  assert.strictEqual(out, 'URL={{streamUrl}}');
});

test('throws on missing when configured', () => {
  const tpl = 'URL={{streamUrl}}';
  assert.throws(() => applyTemplate(tpl, {}, { onMissing: 'throw' }));
});

test('empties missing when configured', () => {
  const tpl = 'URL={{streamUrl}}';
  const out = applyTemplate(tpl, {}, { onMissing: 'empty' });
  assert.strictEqual(out, 'URL=');
});

test('applies url filter', () => {
  const tpl = 'q={{pageTitle|url}}';
  const out = applyTemplate(tpl, { pageTitle: 'A B&C' });
  assert.strictEqual(out, 'q=A%20B%26C');
});

test('applies json filter', () => {
  const tpl = '{"t": {{pageTitle|json}}}';
  const out = applyTemplate(tpl, { pageTitle: 'Hello "World"' });
  assert.strictEqual(out, '{"t": "Hello \\\"World\\\""}');
});
