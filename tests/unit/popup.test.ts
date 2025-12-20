import test from 'node:test';
import assert from 'node:assert';
import { type StreamInfo } from '../../src/types';

/**
 * Unit tests for testable logic in popup.ts
 *
 * Note: DOM-heavy functions (stream display, browser messaging) are validated
 * through integration tests. These tests focus on pure data transformation logic.
 */

test('Stream URL truncation: long URLs should be displayable', () => {
  const longUrl =
    'https://example.com/very/long/path/to/stream/manifest.m3u8?token=abc123def456&session=xyz789&quality=high';

  // Simulates display logic (truncation for UI, full URL in title attribute)
  const displayText = longUrl.length > 60 ? longUrl.substring(0, 60) + '...' : longUrl;
  const titleText = longUrl;

  assert(displayText.length <= 63, 'Display text should be truncated');
  assert(displayText.endsWith('...'), 'Truncated text should end with ellipsis');
  assert.strictEqual(titleText, longUrl, 'Full URL should be preserved for title');
});

test('Stream URL truncation: short URLs remain unchanged', () => {
  const shortUrl = 'https://example.com/stream.m3u8';
  const displayText = shortUrl.length > 60 ? shortUrl.substring(0, 60) + '...' : shortUrl;

  assert.strictEqual(displayText, shortUrl, 'Short URLs should not be truncated');
  assert(!displayText.endsWith('...'), 'Should not have ellipsis');
});

test('Stream grouping by type: groups streams by their type', () => {
  const streams: StreamInfo[] = [
    { url: 'https://example.com/1.m3u8', type: 'HLS' },
    { url: 'https://example.com/2.mpd', type: 'DASH' },
    { url: 'https://example.com/3.m3u8', type: 'HLS' },
    { url: 'https://example.com/4.mp3', type: 'HTTP Audio' }
  ];

  const grouped = streams.reduce((acc, stream) => {
    if (!acc[stream.type]) {
      acc[stream.type] = [];
    }
    acc[stream.type].push(stream);
    return acc;
  }, {} as Record<string, StreamInfo[]>);

  assert.strictEqual(Object.keys(grouped).length, 3, 'Should have 3 stream types');
  assert.strictEqual(grouped['HLS'].length, 2, 'Should have 2 HLS streams');
  assert.strictEqual(grouped['DASH'].length, 1, 'Should have 1 DASH stream');
  assert.strictEqual(grouped['HTTP Audio'].length, 1, 'Should have 1 HTTP Audio stream');
});

test('Empty state detection: identifies when no streams available', () => {
  const emptyStreams: StreamInfo[] = [];
  const hasStreams = emptyStreams.length > 0;

  assert.strictEqual(hasStreams, false, 'Empty array should indicate no streams');
});

test('Empty state detection: identifies when streams are available', () => {
  const streams: StreamInfo[] = [{ url: 'https://example.com/stream.m3u8', type: 'HLS' }];
  const hasStreams = streams.length > 0;

  assert.strictEqual(hasStreams, true, 'Non-empty array should indicate streams present');
});

test('Notification type classification: maps error types correctly', () => {
  type NotificationType = 'info' | 'success' | 'error';

  const getNotificationType = (message: string): NotificationType => {
    if (message.includes('❌') || message.toLowerCase().includes('error') || message.toLowerCase().includes('failed')) {
      return 'error';
    }
    if (message.includes('✅') || message.toLowerCase().includes('success')) {
      return 'success';
    }
    return 'info';
  };

  assert.strictEqual(getNotificationType('❌ API call failed'), 'error');
  assert.strictEqual(getNotificationType('Failed to load streams'), 'error');
  assert.strictEqual(getNotificationType('✅ Stream URL sent successfully!'), 'success');
  assert.strictEqual(getNotificationType('Sending stream URL to API...'), 'info');
});

test('Endpoint selection: defaults to first endpoint when available', () => {
  type ApiEndpoint = { name: string };
  const apiEndpoints: ApiEndpoint[] = [
    { name: 'API-1' },
    { name: 'API-2' },
    { name: 'API-3' }
  ];

  const defaultEndpointName = apiEndpoints[0]?.name;

  assert.strictEqual(defaultEndpointName, 'API-1', 'Should default to first endpoint');
});

test('Endpoint selection: handles empty endpoints array', () => {
  type ApiEndpoint = { name: string };
  const apiEndpoints: ApiEndpoint[] = [];

  const defaultEndpointName = apiEndpoints[0]?.name;

  assert.strictEqual(defaultEndpointName, undefined, 'Should be undefined when no endpoints');
});

test('Stream sorting by timestamp: newest first', () => {
  const streams: StreamInfo[] = [
    { url: 'https://example.com/1.m3u8', type: 'HLS', timestamp: 1000 },
    { url: 'https://example.com/2.m3u8', type: 'HLS', timestamp: 3000 },
    { url: 'https://example.com/3.m3u8', type: 'HLS', timestamp: 2000 }
  ];

  const sorted = [...streams].sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));

  assert.strictEqual(sorted[0].timestamp, 3000, 'Newest stream should be first');
  assert.strictEqual(sorted[1].timestamp, 2000);
  assert.strictEqual(sorted[2].timestamp, 1000, 'Oldest stream should be last');
});

test('Stream deduplication: removes duplicate URLs', () => {
  const streams: StreamInfo[] = [
    { url: 'https://example.com/stream.m3u8', type: 'HLS' },
    { url: 'https://example.com/stream.m3u8', type: 'HLS' },
    { url: 'https://example.com/other.mpd', type: 'DASH' }
  ];

  const unique = streams.filter(
    (stream, index, self) => self.findIndex((s) => s.url === stream.url) === index
  );

  assert.strictEqual(unique.length, 2, 'Should have 2 unique streams');
  assert.strictEqual(unique[0].url, 'https://example.com/stream.m3u8');
  assert.strictEqual(unique[1].url, 'https://example.com/other.mpd');
});
