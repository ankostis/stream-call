import test from 'node:test';
import assert from 'node:assert';
import { isStreamUrl, getStreamType } from '../../src/detect';

test('detects HLS by extension', () => {
  assert.strictEqual(isStreamUrl('https://example.com/live.m3u8'), true);
  assert.strictEqual(getStreamType('https://example.com/live.m3u8'), 'HLS');
});

test('detects DASH by extension', () => {
  assert.strictEqual(isStreamUrl('https://example.com/manifest.mpd'), true);
  assert.strictEqual(getStreamType('https://example.com/manifest.mpd'), 'DASH');
});

test('detects HTTP audio', () => {
  assert.strictEqual(isStreamUrl('https://cdn.example.com/audio.mp3?x=1'), true);
  assert.strictEqual(getStreamType('https://cdn.example.com/audio.mp3?x=1'), 'HTTP Audio');
});

test('rejects non-stream URLs', () => {
  assert.strictEqual(isStreamUrl('https://example.com/page.html'), false);
});

test('protocol-based radio detection patterns', () => {
  assert.strictEqual(isStreamUrl('rtmp://radio.example.com/live'), true);
  assert.strictEqual(isStreamUrl('rtsp://radio.example.com/live'), true);
});
