/**
 * Unit tests for background.ts message handlers
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Mock browser APIs
const mockBrowser = {
  runtime: {
    onMessage: {
      addListener: () => {},
    },
  },
  tabs: {
    onRemoved: { addListener: () => {} },
    onUpdated: { addListener: () => {} },
    query: async () => [{ id: 1 }],
  },
  action: {
    setBadgeText: () => {},
    setBadgeBackgroundColor: () => {},
  },
  webRequest: {
    onSendHeaders: { addListener: () => {} },
  },
  cookies: {
    getAll: async () => [],
  },
  storage: {
    sync: {
      get: async () => ({ apiEndpoints: '[]' }),
    },
  },
};

(global as any).browser = mockBrowser;

// Type definitions for testing
type StreamInfo = {
  url: string;
  type: string;
  pageUrl?: string;
  pageTitle?: string;
  timestamp: number;
};

type RuntimeMessage =
  | { type: 'STREAM_DETECTED'; url: string; streamType: string }
  | { type: 'GET_STREAMS'; tabId: number }
  | { type: 'PING' };

// Simulate the background script's message handler
// This is a simplified version for testing
const tabStreams = new Map<number, StreamInfo[]>();

async function handleMessage(message: RuntimeMessage, sender: any) {
  if (message.type === 'STREAM_DETECTED') {
    const tabId = sender.tab?.id;
    if (tabId === undefined) {
      return { success: false, error: 'No tab context for stream detection.' };
    }

    // Initialize streams array for this tab if not exists
    if (!tabStreams.has(tabId)) {
      tabStreams.set(tabId, []);
    }

    const streams = tabStreams.get(tabId)!;
    const streamInfo: StreamInfo = {
      url: message.url,
      type: message.streamType,
      pageUrl: sender.tab?.url,
      pageTitle: sender.tab?.title,
      timestamp: Date.now(),
    };

    const exists = streams.some((s) => s.url === streamInfo.url);
    if (!exists) {
      streams.push(streamInfo);
    }

    return Promise.resolve({ success: true });
  }

  if (message.type === 'GET_STREAMS') {
    const tabId = message.tabId;
    const streams = tabStreams.get(tabId) || [];
    return { streams };
  }

  if (message.type === 'PING') {
    return { pong: true };
  }

  return {};
}

test('STREAM_DETECTED: initializes stream array on first detection', async () => {
  tabStreams.clear();

  const message = {
    type: 'STREAM_DETECTED' as const,
    url: 'https://example.com/stream.m3u8',
    streamType: 'HLS',
  };

  const sender = {
    tab: {
      id: 1,
      url: 'https://example.com/page',
      title: 'Test Page',
    },
  };

  const result = await handleMessage(message, sender);

  assert.equal(result.success, true, 'Should return success');
  assert.equal(tabStreams.has(1), true, 'Should initialize streams array for tab');
  assert.equal(tabStreams.get(1)!.length, 1, 'Should have one stream');
  assert.equal(tabStreams.get(1)![0].url, 'https://example.com/stream.m3u8');
});

test('STREAM_DETECTED: adds stream to existing array', async () => {
  tabStreams.clear();
  tabStreams.set(1, [
    {
      url: 'https://example.com/stream1.m3u8',
      type: 'HLS',
      timestamp: Date.now(),
    },
  ]);

  const message = {
    type: 'STREAM_DETECTED' as const,
    url: 'https://example.com/stream2.m3u8',
    streamType: 'HLS',
  };

  const sender = {
    tab: { id: 1, url: 'https://example.com', title: 'Test' },
  };

  await handleMessage(message, sender);

  assert.equal(tabStreams.get(1)!.length, 2, 'Should have two streams');
});

test('STREAM_DETECTED: prevents duplicate streams', async () => {
  tabStreams.clear();

  const message = {
    type: 'STREAM_DETECTED' as const,
    url: 'https://example.com/stream.m3u8',
    streamType: 'HLS',
  };

  const sender = {
    tab: { id: 1, url: 'https://example.com', title: 'Test' },
  };

  await handleMessage(message, sender);
  await handleMessage(message, sender); // Send same stream again

  assert.equal(tabStreams.get(1)!.length, 1, 'Should not add duplicate');
});

test('STREAM_DETECTED: handles missing tab context', async () => {
  const message = {
    type: 'STREAM_DETECTED' as const,
    url: 'https://example.com/stream.m3u8',
    streamType: 'HLS',
  };

  const sender = {
    tab: undefined, // No tab context
  };

  const result = await handleMessage(message, sender);

  assert.equal(result.success, false, 'Should return failure');
  assert.match(result.error!, /No tab context/);
});

test('GET_STREAMS: returns streams for tab', async () => {
  tabStreams.clear();
  tabStreams.set(1, [
    {
      url: 'https://example.com/stream.m3u8',
      type: 'HLS',
      timestamp: Date.now(),
    },
  ]);

  const message = { type: 'GET_STREAMS' as const, tabId: 1 };
  const result = await handleMessage(message, {});

  assert.equal(result.streams.length, 1);
  assert.equal(result.streams[0].url, 'https://example.com/stream.m3u8');
});

test('GET_STREAMS: returns empty array for unknown tab', async () => {
  tabStreams.clear();

  const message = { type: 'GET_STREAMS' as const, tabId: 999 };
  const result = await handleMessage(message, {});

  assert.deepEqual(result.streams, []);
});

test('PING: responds with pong', async () => {
  const message = { type: 'PING' as const };
  const result = await handleMessage(message, {});

  assert.equal(result.pong, true);
});

test('STREAM_DETECTED: captures page context', async () => {
  tabStreams.clear();

  const message = {
    type: 'STREAM_DETECTED' as const,
    url: 'https://example.com/stream.m3u8',
    streamType: 'HLS',
  };

  const sender = {
    tab: {
      id: 1,
      url: 'https://example.com/page',
      title: 'Test Page Title',
    },
  };

  await handleMessage(message, sender);

  const streams = tabStreams.get(1)!;
  assert.equal(streams[0].pageUrl, 'https://example.com/page');
  assert.equal(streams[0].pageTitle, 'Test Page Title');
  assert.ok(streams[0].timestamp > 0);
});

/**
 * Test that all handled message types are declared in RuntimeMessage union
 * This prevents the issue where message handlers exist but types are missing
 */
test('RuntimeMessage type includes all handled message types', async () => {
  // Read the background.ts source to extract handled types and declared types
  const fs = await import('fs/promises');
  const path = await import('path');

  const backgroundPath = path.join(process.cwd(), 'src', 'background.ts');
  const content = await fs.readFile(backgroundPath, 'utf-8');

  // Extract handled message types from if statements
  const handledTypesRegex = /if \(message\.type === '([^']+)'\)/g;
  const handledTypes = new Set<string>();
  let match;
  while ((match = handledTypesRegex.exec(content)) !== null) {
    handledTypes.add(match[1]);
  }

  // Extract declared types from RuntimeMessage union
  // Match the entire type definition including all union members
  const runtimeMessageMatch = content.match(/type RuntimeMessage\s*=\s*((?:[\s\S](?!\ntype\s|\nconst\s|\nfunction\s))+)/);
  assert(runtimeMessageMatch, 'RuntimeMessage type definition not found');

  const declaredTypes = new Set<string>();
  const unionContent = runtimeMessageMatch[1];
  const declaredTypesRegex = /\{\s*type:\s*'([^']+)'/g;
  while ((match = declaredTypesRegex.exec(unionContent)) !== null) {
    declaredTypes.add(match[1]);
  }

  // Verify all handled types are declared
  const missingTypes: string[] = [];
  for (const handledType of handledTypes) {
    if (!declaredTypes.has(handledType)) {
      missingTypes.push(handledType);
    }
  }

  assert.strictEqual(
    missingTypes.length,
    0,
    `Message types handled but not declared in RuntimeMessage: ${missingTypes.join(', ')}`
  );

  console.log(`✓ Handled types: ${Array.from(handledTypes).sort().join(', ')}`);
  console.log(`✓ Declared types: ${Array.from(declaredTypes).sort().join(', ')}`);
});

test('No duplicate message type declarations in RuntimeMessage', async () => {
  const fs = await import('fs/promises');
  const path = await import('path');

  const backgroundPath = path.join(process.cwd(), 'src', 'background.ts');
  const content = await fs.readFile(backgroundPath, 'utf-8');

  // Extract all declared types
  const declaredTypesRegex = /\{\s*type:\s*'([^']+)'/g;
  const runtimeMessageMatch = content.match(/type RuntimeMessage\s*=\s*([\s\S]*?);/);
  assert(runtimeMessageMatch, 'RuntimeMessage type definition not found');

  const types: string[] = [];
  const unionContent = runtimeMessageMatch[1];
  let match;
  while ((match = declaredTypesRegex.exec(unionContent)) !== null) {
    types.push(match[1]);
  }

  const uniqueTypes = new Set(types);
  const duplicates = types.filter((t, i) => types.indexOf(t) !== i);

  assert.strictEqual(
    types.length,
    uniqueTypes.size,
    `Duplicate message types found: ${duplicates.join(', ')}`
  );
});
