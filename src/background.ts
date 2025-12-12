/**
 * Stream call Background Service Worker
 * Handles communication between content scripts and popup,
 * manages detected streams, and triggers API calls
 */
export {};

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
  | { type: 'CALL_API'; streamUrl: string; pageUrl?: string; pageTitle?: string }
  | { type: 'CLEAR_STREAMS'; tabId: number };

const tabStreams = new Map<number, StreamInfo[]>();

// Listen for messages from content scripts and popup
browser.runtime.onMessage.addListener((message: RuntimeMessage, sender) => {
  if (message.type === 'STREAM_DETECTED') {
    const tabId = sender.tab?.id;
    if (tabId === undefined) {
      return Promise.resolve({ success: false, error: 'No tab context for stream detection.' });
    }

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
      console.log('Stream detected:', streamInfo);
      updateBadge(tabId, streams.length);
    }

    return Promise.resolve({ success: true });
  }

  if (message.type === 'GET_STREAMS') {
    const tabId = message.tabId;
    const streams = tabStreams.get(tabId) || [];
    return Promise.resolve({ streams });
  }

  if (message.type === 'CALL_API') {
    return callStreamAPI(message.streamUrl, message.pageUrl, message.pageTitle);
  }

  if (message.type === 'CLEAR_STREAMS') {
    const tabId = message.tabId;
    tabStreams.delete(tabId);
    updateBadge(tabId, 0);
    return Promise.resolve({ success: true });
  }

  return Promise.resolve({ success: false, error: 'Unhandled message type' });
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
async function callStreamAPI(streamUrl: string, pageUrl?: string, pageTitle?: string) {
  try {
    const defaults = {
      apiEndpoint: '',
      apiMethod: 'POST',
      apiHeaders: '{}',
      includePageInfo: true
    } as const;

    const config = (await browser.storage.sync.get(defaults)) as typeof defaults;

    if (!config.apiEndpoint) {
      return {
        success: false,
        error: 'API endpoint not configured. Please set it in the extension options.'
      };
    }

    const payload: Record<string, unknown> = {
      streamUrl,
      timestamp: new Date().toISOString()
    };

    if (config.includePageInfo) {
      payload.pageUrl = pageUrl;
      payload.pageTitle = pageTitle;
    }

    let headers: Record<string, string> = { 'Content-Type': 'application/json' };
    try {
      const customHeaders = JSON.parse(config.apiHeaders) as Record<string, string>;
      headers = { ...headers, ...customHeaders };
    } catch (e) {
      console.warn('Invalid custom headers JSON:', e);
    }

    const response = await fetch(config.apiEndpoint, {
      method: config.apiMethod,
      headers,
      body: JSON.stringify(payload)
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

console.log('Stream call background service worker loaded');
