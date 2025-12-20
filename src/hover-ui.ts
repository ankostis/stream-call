/**
 * stream-call Hover Panel UI (page/iframe context)
 * In-page overlay for mobile UX. Mirrors popup.ts structure.
 * Uses browser.runtime.sendMessage - broker gets sender.tab.id automatically.
 */
export {};

import { parseEndpoints, type ApiEndpoint, previewCall, formatResponseBody } from './endpoint';
import { LogLevel } from './logger';
import { applyLogFiltering } from './logger-ui';
import { initLogging, displayStreams, populateStreamPanel, type StreamActionHandlers } from './components-ui';
import { type StreamInfo, type RuntimeMessage } from './types';

let apiEndpoints: ApiEndpoint[] = [];

// Logging utilities (initialized in initialize() after DOM ready)
let logger: ReturnType<typeof initLogging>['logger'];
let appendLog: ReturnType<typeof initLogging>['appendLog'];

/**
 * Initialize hover panel
 */
async function initialize() {
  // Initialize logging infrastructure
  const logging = initLogging({
    statusBar: document.getElementById('status-bar') as HTMLDivElement,
    statusIcon: document.getElementById('status-icon') as HTMLSpanElement,
    statusMsg: document.getElementById('status-message') as HTMLSpanElement,
    logViewer: document.getElementById('log-viewer') as HTMLDivElement
  });
  logger = logging.logger;
  appendLog = logging.appendLog;

  // Wire log filtering
  const levelCheckboxes = document.querySelectorAll('.log-level-filter') as NodeListOf<HTMLInputElement>;
  applyLogFiltering(document.getElementById('log-viewer') as HTMLDivElement, levelCheckboxes);

  // Load data
  await loadEndpoints();
  await loadStreams();

  // Wire action buttons
  document.getElementById('refresh-btn')?.addEventListener('click', handleRefresh);
  document.getElementById('options-btn')?.addEventListener('click', handleOptions);

  logger.debug('hover', 'Hover panel initialized successfully');
}

/**
 * Load endpoints from storage via broker GET_ENDPOINTS message
 */
async function loadEndpoints() {
  try {
    const response = await browser.runtime.sendMessage({ type: 'GET_ENDPOINTS' } as RuntimeMessage);
    if (response?.endpoints) {
      apiEndpoints = response.endpoints;
      logger.debug('endpoint', `Loaded ${apiEndpoints.length} endpoints`);
    } else {
      logger.warn('endpoint', 'No endpoints configured');
      apiEndpoints = [];
    }
  } catch (error: any) {
    logger.error('endpoint', 'Failed to load endpoints', error);
    apiEndpoints = [];
  }
}

/**
 * Load and display streams for current tab.
 * Broker uses sender.tab.id automatically - no need to pass tabId explicitly.
 */
async function loadStreams() {
  // Verify broker is alive
  try {
    await browser.runtime.sendMessage({ type: 'PING' } as RuntimeMessage);
  } catch (pingError) {
    logger.error('broker', 'Broker not responding', pingError);
    showEmptyState('⚠️ Extension not ready', 'Try refreshing the page');
    return;
  }

  const loading = document.getElementById('loading');
  const status = document.getElementById('status');

  try {
    // Use GET_STREAMS without tabId - broker will use sender.tab.id
    const response = await browser.runtime.sendMessage({
      type: 'GET_STREAMS'
    } as RuntimeMessage);

    if (!response?.streams) {
      showEmptyState();
      return;
    }

    const streams = response.streams as StreamInfo[];
    logger.debug('broker', `Loaded ${streams.length} streams`);

    if (loading) loading.style.display = 'none';

    if (streams.length === 0) {
      showEmptyState();
      return;
    }

    if (status) {
      status.style.display = 'block';
      status.classList.add('detected');
    }

    const badge = document.getElementById('stream-count');
    if (badge) badge.textContent = streams.length.toString();

    displayStreamsHover(streams);
  } catch (error: any) {
    logger.error('broker', 'Failed to load streams', error);
    showEmptyState('❌ Error loading streams', error.message);
  }
}

/**
 * Display detected streams using shared UI components
 */
function displayStreamsHover(streams: StreamInfo[]) {
  displayStreams(streams, (stream, index) => {
    populatePanel(stream, index, streams);
  });
}

/**
 * Populate the detail panel with selected stream (uses shared component)
 */
function populatePanel(stream: StreamInfo, _index: number, _allStreams: StreamInfo[]) {
  const activeEndpoints = apiEndpoints.filter(ep => ep.active !== false);

  const handlers: StreamActionHandlers = {
    onPreview: (stream, endpointName) => handlePreview(stream, endpointName),
    onCopy: (url) => handleCopyUrl(url),
    onCall: (mode, stream, endpointName) => handleCallEndpoint(mode, stream, endpointName)
  };

  populateStreamPanel(stream, activeEndpoints, handlers);
}

/**
 * Show empty state with optional custom message
 */
function showEmptyState(title = '🔍 No streams detected', subtitle = 'Browse to a page with streaming media to detect streams') {
  const loading = document.getElementById('loading');
  const listContainer = document.getElementById('streams-list-container');
  const panel = document.getElementById('stream-panel');
  const emptyState = document.getElementById('empty-state');

  if (loading) loading.style.display = 'none';
  if (listContainer) listContainer.style.display = 'none';
  if (panel) panel.style.display = 'none';

  if (emptyState) {
    emptyState.style.display = 'block';
    const titleEl = emptyState.querySelector('p:first-of-type');
    const subtitleEl = emptyState.querySelector('p:last-of-type');

    if (titleEl) titleEl.innerHTML = `<strong>${title}</strong>`;
    if (subtitleEl) subtitleEl.textContent = subtitle;
  }
}

/**
 * Handle preview - shows formatted API request details in logger
 */
function handlePreview(stream: StreamInfo, endpointName?: string) {
  if (apiEndpoints.length === 0) {
    logger.warn('endpoint', 'No endpoints configured');
    return;
  }

  const endpoint = apiEndpoints.find(ep => ep.name === endpointName) || apiEndpoints[0];
  const context = {
    streamUrl: stream.url,
    timestamp: Date.now(),
    pageUrl: stream.pageUrl,
    pageTitle: stream.pageTitle
  } as Record<string, unknown>;

  logger.infoFlash(2000, 'hover', 'Generating preview:');
  previewCall(endpoint, context, logger);
}

/**
 * Handle endpoint action (call API or open in tab) via messaging
 * Broker handles CORS and tabs - hover-ui delegates everything.
 */
async function handleCallEndpoint(mode: 'fetch' | 'tab', stream: StreamInfo, endpointName?: string) {
  if (apiEndpoints.length === 0) {
    logger.warn('endpoint', 'Please configure API endpoints in options first');
    return;
  }

  const action = mode === 'fetch' ? 'Calling API' : 'Opening in tab';
  logger.infoFlash(3000, 'apicall', `${action}: ${endpointName || 'default'} → ${stream.url}`);

  // Delegate to broker via message
  try {
    const response = await browser.runtime.sendMessage({
      type: mode === 'fetch' ? 'CALL_API' : 'OPEN_IN_TAB',
      streamUrl: stream.url,
      pageUrl: stream.pageUrl,
      pageTitle: stream.pageTitle,
      endpointName
    } as RuntimeMessage);

    if (response?.success) {
      const successMsg = mode === 'fetch'
        ? `✅ API call successful: ${response.message}`
        : `✅ Opened in new tab`;
      logger.infoFlash(3000, 'apicall', successMsg);

      // Log response body if available (formatted JSON for readability)
      if (response.response) {
        const formatted = formatResponseBody(response.response);
        logger.debug('apicall', `Response: ${formatted}`);
      }
    } else {
      const errorMsg = response?.error ?? 'Unknown error';
      logger.error('apicall', `❌ Failed: ${errorMsg}`, response);
    }
  } catch (error: any) {
    logger.error('apicall', `❌ Message failed: ${error.message}`, error);
  }
}

/**
 * Handle copy URL
 */
async function handleCopyUrl(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    logger.infoFlash(3000, 'clipboard', `📋 URL copied: ${url}`);
  } catch (error) {
    logger.warn('clipboard', '⚠️ Failed to copy URL', error);
  }
}

/**
 * Handle refresh button
 */
async function handleRefresh() {
  try {
    const loading = document.getElementById('loading');
    if (loading) loading.style.display = 'block';

    logger.debug('hover', 'Refresh clicked');
    await loadStreams();
  } catch (error) {
    logger.error('hover', 'Failed to refresh streams', error);
    const loading = document.getElementById('loading');
    if (loading) loading.style.display = 'none';
  }
}

/**
 * Handle options button - delegate to broker (can't open tabs from iframe)
 */
async function handleOptions() {
  logger.debug('hover', 'Options button clicked');
  try {
    await browser.runtime.sendMessage({ type: 'OPEN_OPTIONS' } as RuntimeMessage);
  } catch (error) {
    logger.error('hover', 'Failed to open options', error);
  }
}

/**
 * Handle close button - tell parent page.ts to hide iframe
 */
function handleClose() {
  window.parent.postMessage({ type: 'CLOSE_HOVER_PANEL' }, '*');
}

// Initialize when DOM ready
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await initialize();
  } catch (error) {
    console.error('[hover-ui] Failed to initialize:', error);
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'none';
  }
});
