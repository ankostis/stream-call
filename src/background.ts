/**
 * stream-call Background Service Worker
 * Handles communication between content scripts and popup,
 * manages detected streams, and triggers API calls
 */
export {};

import { applyTemplate } from './template';
import { parsePatterns } from './config';

// Limit streams per tab to prevent unbounded memory growth
const MAX_STREAMS_PER_TAB = 200;

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
  | { type: 'CALL_API'; streamUrl: string; pageUrl?: string; pageTitle?: string; patternName?: string }
  | { type: 'CLEAR_STREAMS'; tabId: number }
  | { type: 'PING' };

const tabStreams = new Map<number, StreamInfo[]>();

// Listen for messages from content scripts and popup
browser.runtime.onMessage.addListener((message: RuntimeMessage, sender) => {
  return (async () => {
    if (message.type === 'STREAM_DETECTED') {
    const tabId = sender.tab?.id;
    if (tabId === undefined) {
        return { success: false, error: 'No tab context for stream detection.' };
      tabStreams.set(tabId, []);
    }

    const streams = tabStreams.get(tabId)!;
    const streamInfo: StreamInfo = {
      url: message.url,
      type: message.streamType,
      pageUrl: sender.tab?.url,
      pageTitle: sender.tab?.title,
      timestamp: Date.now()
    };

    const exists = streams.some((s) => s.url === streamInfo.url);
    if (!exists) {
      streams.push(streamInfo);
      // Enforce cap: remove oldest entry if limit exceeded
      if (streams.length > MAX_STREAMS_PER_TAB) {
        streams.shift();
      }
      console.log('Stream detected:', streamInfo);
      updateBadge(tabId, streams.length);
    }

    return Promise.resolve({ success: true });
    }

    if (message.type === 'GET_STREAMS') {
      const tabId = message.tabId;
      const streams = tabStreams.get(tabId) || [];
      return { streams };
    }

    if (message.type === 'CALL_API') {
      return callStreamAPI({
        streamUrl: message.streamUrl,
        pageUrl: message.pageUrl,
        pageTitle: message.pageTitle,
        patternName: message.patternName
      });
    }

  if (message.type === 'CLEAR_STREAMS') {
    const tabId = message.tabId;
    tabStreams.delete(tabId);
    updateBadge(tabId, 0);
    return Promise.resolve({ success: true });
  }

  if (message.type === 'PING') {
    // Test integration: respond with current detection state
    const totalDetected = Array.from(tabStreams.values()).reduce((sum, streams) => sum + streams.length, 0);
    return {
      pong: true,
      totalDetected,
      tabCount: tabStreams.size
    };
  }

  return Promise.resolve({ success: false, error: 'Unhandled message type' });
  })();
});

// Clean up when tabs are closed
browser.tabs.onRemoved.addListener((tabId) => {
  tabStreams.delete(tabId);
});

// Clean up when navigating away
browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    tabStreams.delete(tabId);
    updateBadge(tabId, 0);
  }
});

/**
 * Update extension badge with stream count
 */
function updateBadge(tabId: number, count: number) {
  if (count > 0) {
    browser.action.setBadgeText({
      text: count.toString(),
      tabId
    });
    browser.action.setBadgeBackgroundColor({
      color: '#4CAF50',
      tabId
    });
  } else {
    browser.action.setBadgeText({
      text: '',
      tabId
    });
  }
}

/**
 * Call the configured HTTP API with stream information
 */
async function callStreamAPI({
  streamUrl,
  pageUrl,
  pageTitle,
  patternName
}: {
  streamUrl: string;
  pageUrl?: string;
  pageTitle?: string;
  patternName?: string;
}) {
  try {
    const defaults = { apiPatterns: '[]' } as const;
    const config = (await browser.storage.sync.get(defaults)) as typeof defaults;

    let patterns: ReturnType<typeof parsePatterns>;
    try {
      patterns = parsePatterns(config.apiPatterns);
    } catch (parseError: any) {
      return {
        success: false,
        error: `Failed to parse API patterns: ${parseError?.message ?? 'Unknown error'}`
      };
    }

    const selectedPattern = patternName ? patterns.find((p) => p.name === patternName) : patterns[0];

    if (!selectedPattern) {
      return {
        success: false,
        error: 'No API patterns configured. Please add a pattern in the extension options.'
      };
    }

    const requestContext = buildContext({ streamUrl, pageUrl, pageTitle });

    // Separate template error handling for actionable error messages
    let endpoint: string;
    let bodyJson: string;
    try {
      endpoint = applyTemplate(selectedPattern.endpointTemplate, requestContext);
      bodyJson = selectedPattern.bodyTemplate
        ? applyTemplate(selectedPattern.bodyTemplate, requestContext)
        : JSON.stringify(
            selectedPattern.includePageInfo
              ? requestContext
              : { streamUrl, timestamp: requestContext.timestamp }
          );
    } catch (templateError: any) {
      return {
        success: false,
        error: `Interpolation error in pattern "${selectedPattern.name}": ${templateError?.message ?? 'Invalid placeholder'}. Check endpoint/body templates and placeholders.`
      };
    }

    const method = (selectedPattern.method || 'POST').toUpperCase();

    let headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (selectedPattern.headers) {
      headers = { ...headers, ...selectedPattern.headers };
    }

    const response = await fetch(endpoint, {
      method,
      headers,
      body: bodyJson
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }

    const result = await response.text();

    return {
      success: true,
      message: 'Stream URL sent successfully',
      response: result
    };
  } catch (error: any) {
    console.error('API call failed:', error);
    return {
      success: false,
      error: error?.message ?? 'Unknown error'
    };
  }
}

function buildContext({
  streamUrl,
  pageUrl,
  pageTitle
}: {
  streamUrl: string;
  pageUrl?: string;
  pageTitle?: string;
}) {
  return {
    streamUrl,
    pageUrl,
    pageTitle,
    timestamp: Date.now()
  };
}

console.log('stream-call: background service worker loaded');
