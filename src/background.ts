/**
 * stream-call Background Service Worker
 * Handles communication between content scripts and popup,
 * manages detected streams, and triggers API calls
 */
export {};

import { applyTemplate } from './template';
import { parseEndpoints } from './endpoint';

// Limit streams per tab to prevent unbounded memory growth
const MAX_STREAMS_PER_TAB = 200;

// Default configuration with 3 demo endpoints
const DEFAULT_CONFIG = {
  apiEndpoints: JSON.stringify(
    [
      {
        name: 'example.com GET',
        endpointTemplate: 'https://api.example.com/record?url={{streamUrl}}&time={{timestamp}}',
        method: 'GET'
      },
      {
        name: 'example.com JSON POST',
        endpointTemplate: 'https://api.example.com/stream',
        method: 'POST',
        bodyTemplate:
          '{"streamUrl":"{{streamUrl}}","timestamp":"{{timestamp}}","pageUrl":"{{pageUrl}}","pageTitle":"{{pageTitle}}"}'
      },
      {
        name: 'Echo httpbin.org',
        endpointTemplate: 'https://httpbin.org/anything',
        method: 'POST',
        headers: { 'X-Test': 'stream-call' },
        bodyTemplate:
          '{"url":"{{streamUrl}}","title":"{{pageTitle}}","page":"{{pageUrl}}","time":"{{timestamp}}"}'
      }
    ],
    null,
    2
  )
} as const;

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
      return callStreamAPI({
        streamUrl: message.streamUrl,
        pageUrl: message.pageUrl,
        pageTitle: message.pageTitle,
        endpointName: message.endpointName
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

/**
 * Call the configured HTTP API with stream information
 */
async function callStreamAPI({
  streamUrl,
  pageUrl,
  pageTitle,
  endpointName
}: {
  streamUrl: string;
  pageUrl?: string;
  pageTitle?: string;
  endpointName?: string;
}) {
  try {
    const defaults = { apiEndpoints: '[]' } as const;
    const config = (await browser.storage.sync.get(defaults)) as typeof defaults;

    let endpoints: ReturnType<typeof parseEndpoints>;
    try {
      endpoints = parseEndpoints(config.apiEndpoints);
    } catch (parseError: any) {
      return {
        success: false,
        error: `Failed to parse API endpoints: ${parseError?.message ?? 'Unknown error'}`
      };
    }

    const selectedEndpoint = endpointName ? endpoints.find((e) => e.name === endpointName) : endpoints[0];

    if (!selectedEndpoint) {
      return {
        success: false,
        error: 'No API endpoints configured. Please add an endpoint in the extension options.'
      };
    }

    const requestContext = buildContext({ streamUrl, pageUrl, pageTitle });

    // Separate template error handling for actionable error messages
    let endpoint: string;
    let bodyJson: string;
    try {
      endpoint = applyTemplate(selectedEndpoint.endpointTemplate, requestContext);
      bodyJson = selectedEndpoint.bodyTemplate
        ? applyTemplate(selectedEndpoint.bodyTemplate, requestContext)
        : JSON.stringify(requestContext);
    } catch (templateError: any) {
      return {
        success: false,
        error: `Interpolation error in endpoint "${selectedEndpoint.name}": ${templateError?.message ?? 'Invalid placeholder'}. Check endpoint/body templates and placeholders.`
      };
    }

    const method = (selectedEndpoint.method || 'POST').toUpperCase();

    let headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (selectedEndpoint.headers) {
      headers = { ...headers, ...selectedEndpoint.headers };
    }

    // Add cookies to headers if flag is enabled
    if (selectedEndpoint.includeCookies && pageUrl) {
      try {
        const cookies = await browser.cookies.getAll({ url: pageUrl });
        if (cookies.length > 0) {
          const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
          headers['Cookie'] = cookieHeader;
        }
      } catch (cookieError: any) {
        console.warn('Failed to get cookies:', cookieError);
        // Continue without cookies rather than failing entire request
      }
    }

    // Add page headers if flag is enabled
    if (selectedEndpoint.includePageHeaders) {
      const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.id !== undefined) {
        const pageHeaders = tabHeaders.get(activeTab.id);
        if (pageHeaders) {
          // Merge page headers, but don't override existing headers
          for (const [key, value] of Object.entries(pageHeaders)) {
            if (!(key in headers)) {
              headers[key] = value;
            }
          }
        }
      }
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
