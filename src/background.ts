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
  | { type: 'CALL_API'; streamUrl: string; pageUrl?: string; pageTitle?: string; patternId?: string }
  | { type: 'CLEAR_STREAMS'; tabId: number };

type ApiPattern = {
  id: string;
  name: string;
  endpointTemplate: string;
  method?: string;
  headers?: Record<string, string>;
  bodyTemplate?: string;
  includePageInfo?: boolean;
};

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
    return callStreamAPI({
      streamUrl: message.streamUrl,
      pageUrl: message.pageUrl,
      pageTitle: message.pageTitle,
      patternId: message.patternId
    });
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
async function callStreamAPI({
  streamUrl,
  pageUrl,
  pageTitle,
  patternId
}: {
  streamUrl: string;
  pageUrl?: string;
  pageTitle?: string;
  patternId?: string;
}) {
  try {
    const defaults = {
      apiEndpoint: '',
      apiMethod: 'POST',
      apiHeaders: '{}',
      includePageInfo: true,
      apiPatterns: '[]'
    } as const;

    const config = (await browser.storage.sync.get(defaults)) as typeof defaults;

    const patterns = parsePatterns(config.apiPatterns);
    const selectedPattern = patternId ? patterns.find((p) => p.id === patternId) : patterns[0];

    if (!selectedPattern && !config.apiEndpoint) {
      return {
        success: false,
        error: 'API endpoint not configured. Please set it in the extension options.'
      };
    }

    const requestContext = buildContext({ streamUrl, pageUrl, pageTitle });

    const endpoint = selectedPattern
      ? applyTemplate(selectedPattern.endpointTemplate, requestContext)
      : config.apiEndpoint;

    const method = (selectedPattern?.method || config.apiMethod || 'POST').toUpperCase();

    const includePage = selectedPattern?.includePageInfo ?? config.includePageInfo;
    const payload: Record<string, unknown> = includePage
      ? { ...requestContext }
      : { streamUrl, timestamp: requestContext.timestamp };

    let headers: Record<string, string> = { 'Content-Type': 'application/json' };
    try {
      if (config.apiHeaders) {
        const customHeaders = JSON.parse(config.apiHeaders) as Record<string, string>;
        headers = { ...headers, ...customHeaders };
      }
      if (selectedPattern?.headers) {
        headers = { ...headers, ...selectedPattern.headers };
      }
    } catch (e) {
      console.warn('Invalid custom headers JSON:', e);
    }

    const bodyTemplate = selectedPattern?.bodyTemplate;
    const bodyJson = bodyTemplate
      ? applyTemplate(bodyTemplate, requestContext)
      : JSON.stringify(payload);

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

function applyTemplate(template: string, context: Record<string, unknown>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => {
    const value = context[key];
    return value === undefined || value === null ? `{{${key}}}` : String(value);
  });
}

function parsePatterns(raw: string): ApiPattern[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((p) => ({
        id: p.id || crypto.randomUUID(),
        name: p.name || 'Pattern',
        endpointTemplate: p.endpointTemplate,
        method: p.method,
        headers: p.headers,
        bodyTemplate: p.bodyTemplate,
        includePageInfo: p.includePageInfo
      }))
      .filter((p) => typeof p.endpointTemplate === 'string' && p.endpointTemplate.length > 0);
  } catch (e) {
    console.warn('Invalid apiPatterns JSON', e);
    return [];
  }
}

console.log('Stream call background service worker loaded');
