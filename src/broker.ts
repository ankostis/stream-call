/**
 * stream-call Broker Service Worker (extension-context)
 * Handles communication between content scripts and popup,
 * manages detected streams, and triggers API calls
 *
 */
export {};

import { callEndpoint, DEFAULT_CONFIG } from './endpoint';
import { Logger, LogLevel } from './logger';

const logger = new Logger();

// Limit streams per tab to prevent unbounded memory growth
const MAX_STREAMS_PER_TAB = 200;

// Initialize storage with default config on first install
browser.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // First install - populate storage with demo endpoints
    const stored = await browser.storage.sync.get('apiEndpoints');
    if (!stored.apiEndpoints) {
      await browser.storage.sync.set({ apiEndpoints: DEFAULT_CONFIG.apiEndpoints });
      logger.info('storage', 'Initialized storage with 3 demo endpoints');
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
  | { type: 'OPEN_IN_TAB'; streamUrl: string; pageUrl?: string; pageTitle?: string; endpointName?: string }
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
        logger.debug('broker', `Tab ${tabId}: stream cap reached, removed oldest`);
      }
      logger.info('broker', `Stream detected: ${streamInfo.url} (${streamInfo.type})`);
      updateBadge(tabId, streams.length);
    }

      return Promise.resolve({ success: true });
    }

    if (message.type === 'GET_STREAMS') {
      const tabId = message.tabId;
      const streams = tabStreams.get(tabId) || [];
      logger.debug('messaging', `GET_STREAMS for tab ${tabId}: ${streams.length} streams`);
      return { streams };
    }

    if (message.type === 'OPEN_IN_TAB') {
      // Message handler for page/hover-panel contexts (popup/options call directly)
      logger.info('messaging', `OPEN_IN_TAB: endpoint=${message.endpointName || 'default'}, url=${message.streamUrl}`);
      return callEndpoint({
        mode: 'tab',
        streamUrl: message.streamUrl,
        pageUrl: message.pageUrl,
        pageTitle: message.pageTitle,
        endpointName: message.endpointName,
        logger
      });
    }

    if (message.type === 'CALL_API') {
      // Message handler for page/hover-panel contexts (popup/options call directly)
      // Get page headers for current tab if available
      const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
      const pageHeaders = activeTab?.id !== undefined ? tabHeaders.get(activeTab.id) : undefined;

      logger.info('messaging', `CALL_API: endpoint=${message.endpointName || 'default'}, url=${message.streamUrl}`);
      return callEndpoint({
        mode: 'fetch',
        streamUrl: message.streamUrl,
        pageUrl: message.pageUrl,
        pageTitle: message.pageTitle,
        endpointName: message.endpointName,
        tabHeaders: pageHeaders,
        logger
      });
    }

  if (message.type === 'PING') {
    // Test integration: respond with current detection state
    const totalDetected = Array.from(tabStreams.values()).reduce((sum, streams) => sum + streams.length, 0);
    logger.debug('messaging', `PING: ${totalDetected} streams across ${tabStreams.size} tabs`);
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
  const count = tabStreams.get(tabId)?.length || 0;
  tabStreams.delete(tabId);
  tabHeaders.delete(tabId);
  if (count > 0) {
    logger.debug('broker', `Tab ${tabId} closed: cleaned ${count} streams`);
  }
});

// Clean up when navigating away
browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    const count = tabStreams.get(tabId)?.length || 0;
    tabStreams.delete(tabId);
    tabHeaders.delete(tabId);
    updateBadge(tabId, 0);
    if (count > 0) {
      logger.debug('broker', `Tab ${tabId} navigated: cleared ${count} streams`);
    }
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

logger.info('broker', 'Broker service worker loaded');
