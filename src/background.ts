/**
 * stream-call Background Service Worker (extension-context)
 * Handles communication between content scripts and popup,
 * manages detected streams, and triggers API calls
 *
 */
export {};

import { callEndpointAPI, DEFAULT_CONFIG } from './endpoint';

// Limit streams per tab to prevent unbounded memory growth
const MAX_STREAMS_PER_TAB = 200;

// Initialize storage with default config on first install
browser.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // First install - populate storage with demo endpoints
    const stored = await browser.storage.sync.get('apiEndpoints');
    if (!stored.apiEndpoints) {
      await browser.storage.sync.set({ apiEndpoints: DEFAULT_CONFIG.apiEndpoints });
      console.log('[stream-call] Initialized storage with 3 demo endpoints');
    }
  }
});

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
  | { type: 'CALL_API'; streamUrl: string; pageUrl?: string; pageTitle?: string; endpointName?: string }
  | { type: 'CLEAR_STREAMS'; tabId: number }
  | { type: 'PING' };

const tabStreams = new Map<number, StreamInfo[]>();
const tabHeaders = new Map<number, Record<string, string>>();

// Capture page request headers using webRequest API
browser.webRequest.onSendHeaders.addListener(
  (details) => {
    if (details.tabId >= 0 && details.type === 'main_frame') {
      const headers: Record<string, string> = {};
      if (details.requestHeaders) {
        for (const header of details.requestHeaders) {
          if (header.name && header.value) {
            headers[header.name] = header.value;
          }
        }
      }
      tabHeaders.set(details.tabId, headers);
    }
  },
  { urls: ['<all_urls>'] },
  ['requestHeaders']
);

// Listen for messages from content scripts and popup
browser.runtime.onMessage.addListener((message: RuntimeMessage, sender) => {
  return (async () => {
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
      // Get page headers for current tab if available
      const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
      const pageHeaders = activeTab?.id !== undefined ? tabHeaders.get(activeTab.id) : undefined;

      return callEndpointAPI({
        streamUrl: message.streamUrl,
        pageUrl: message.pageUrl,
        pageTitle: message.pageTitle,
        endpointName: message.endpointName,
        tabHeaders: pageHeaders
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
  tabHeaders.delete(tabId);
});

// Clean up when navigating away
browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    tabStreams.delete(tabId);
    tabHeaders.delete(tabId);
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

console.log('stream-call: background service worker loaded');
