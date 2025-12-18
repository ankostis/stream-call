/**
 * stream-call Popup Script that calls the API endpoint (extension-context)
 */
export {};

import { parseEndpoints, type ApiEndpoint, previewCall, callEndpoint } from './endpoint';
import { LogLevel } from './logger';
import { applyLogFiltering } from './logging-ui';
import { initLogging, createButton, type ButtonConfig } from './components-ui';

type StreamInfo = {
  url: string;
  type: string;
  pageUrl?: string;
  pageTitle?: string;
  timestamp?: number;
};

let currentTabId: number | null = null;
let apiEndpoints: ApiEndpoint[] = [];

// Cache endpoints in memory for the popup's lifetime to avoid repeated storage reads
let endpointsCached = false;

// Logging utilities (initialized in initialize() after DOM ready)
let logger: ReturnType<typeof initLogging>['logger'];

let appendLog: ReturnType<typeof initLogging>['appendLog'];

/**
 * Open URL in tab, reusing existing tab if found
 */
async function openOrSwitchToTab(url: string): Promise<void> {
  const tabs = await browser.tabs.query({ url });
  if (tabs.length > 0 && tabs[0].id) {
    await browser.tabs.update(tabs[0].id, { active: true });
  } else {
    await browser.tabs.create({ url, active: true });
  }
}

/**
 * Initialize popup
 */
async function initialize() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (tabs.length === 0) return;

  currentTabId = tabs[0].id ?? null;

  // Initialize logging infrastructure
  const logging = initLogging({
    statusBar: document.getElementById('status-bar') as HTMLDivElement,
    statusIcon: document.getElementById('status-icon') as HTMLSpanElement,
    statusMsg: document.getElementById('status-message') as HTMLSpanElement,
    logViewer: document.getElementById('log-viewer') as HTMLDivElement
  });
  logger = logging.logger;
  appendLog = logging.appendLog;

  // Wire log filtering (always visible)
  const levelCheckboxes = document.querySelectorAll('.log-level-filter') as NodeListOf<HTMLInputElement>;
  applyLogFiltering(document.getElementById('log-viewer') as HTMLDivElement, levelCheckboxes);

  // Load data
  await loadEndpoints();
  await loadStreams();

  // Wire action buttons
  document.getElementById('refresh-btn')?.addEventListener('click', handleRefresh);
  document.getElementById('options-btn')?.addEventListener('click', handleOptions);

  logger.debug('popup', 'Popup initialized successfully');
}

async function loadEndpoints() {
  // Return cached endpoints if available (avoids repeated storage reads during popup lifetime)
  if (endpointsCached) return;

  // Use empty object as defaults - browser.storage.sync.get returns stored values or empty object
  // On first run (no stored config), storage is empty, so we get no defaults
  const stored = await browser.storage.sync.get('apiEndpoints');
  const apiEndpointsStr = stored.apiEndpoints || '[]';

  try {
    apiEndpoints = parseEndpoints(apiEndpointsStr);
    logger.debug('endpoint', `Loaded ${apiEndpoints.length} API endpoints`);
  } catch (error: any) {
    // Parse error is expected if config is corrupted - show to user via logger
    logger.error( 'endpoint', 'Invalid API endpoints configured. Check options.', error);
    apiEndpoints = [];
  }
  endpointsCached = true;
  // Note: storage.get errors bubble up to caller (initialize)
}

/**
 * Load and display streams for current tab
 */
async function loadStreams() {
  if (currentTabId === null) return;

  // Verify background worker is alive before fetching streams
  try {
    await browser.runtime.sendMessage({ type: 'PING' });
  } catch (pingError) {
    // Known issue: background worker crashed or not loaded.
    logger.error( 'messaging', '⚠️ Extension background service not responding. Try reloading the extension.', pingError);
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'none';
    return;
  }

  let response;
  try {
    response = await browser.runtime.sendMessage({
      type: 'GET_STREAMS',
      tabId: currentTabId
    });
  } catch (error) {
    // Message passing error - log and display
    logger.error( 'messaging', 'Failed to fetch streams from background', error);
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'none';
    return;
  }

  const streams = (response?.streams as StreamInfo[] | undefined) || [];
  logger.debug('popup', `Loaded ${streams.length} streams for tab ${currentTabId}`);

  const loadingEl = document.getElementById('loading');
  if (loadingEl) loadingEl.style.display = 'none';

  const statusEl = document.getElementById('status');
  const emptyState = document.getElementById('empty-state');

  if (streams.length === 0) {
    if (emptyState) emptyState.style.display = 'block';
    if (statusEl) statusEl.style.display = 'none';
  } else {
    if (emptyState) emptyState.style.display = 'none';
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.classList.add('detected');
    }

    const badge = document.getElementById('stream-count');
    if (badge) badge.textContent = streams.length.toString();

    displayStreams(streams);
  }
  // Note: Other errors bubble to caller (initialize) with full context
}

/**
 * Display streams in the UI (master-detail pattern)
 */
function displayStreams(streams: StreamInfo[]) {
  const listContainer = document.getElementById('streams-list-container');
  const list = document.getElementById('streams-list');
  const panel = document.getElementById('stream-panel');

  if (!list || !listContainer || !panel) return;

  list.innerHTML = '';

  streams.forEach((stream, index) => {
    const item = createStreamListItem(stream, index, streams);
    list.appendChild(item);
  });

  listContainer.style.display = 'block';

  // Auto-select first stream
  if (streams.length > 0) {
    populatePanel(streams[0], 0, streams);
  }
}

/**
 * Create compact stream list item (master)
 */
function createStreamListItem(stream: StreamInfo, index: number, allStreams: StreamInfo[]): HTMLElement {
  const item = document.createElement('div');
  item.className = 'stream-list-item';
  if (index === 0) item.classList.add('selected');
  item.setAttribute('data-index', index.toString());

  const type = document.createElement('span');
  type.className = 'stream-type';
  type.textContent = stream.type;

  const url = document.createElement('div');
  url.className = 'stream-url';
  url.textContent = stream.url;
  url.title = stream.url;

  item.appendChild(type);
  item.appendChild(url);

  // Click to populate detail panel
  item.addEventListener('click', () => {
    // Update selected state
    document.querySelectorAll('.stream-list-item').forEach(el => el.classList.remove('selected'));
    item.classList.add('selected');
    populatePanel(stream, index, allStreams);
  });

  return item;
}

/**
 * Populate the detail panel with selected stream (detail)
 */
function populatePanel(stream: StreamInfo, index: number, allStreams: StreamInfo[]) {
  const panel = document.getElementById('stream-panel');
  const panelActions = document.getElementById('panel-actions');

  if (!panel || !panelActions) return;

  // Rebuild actions
  panelActions.innerHTML = '';

  // Filter to show only active endpoints
  const activeEndpoints = apiEndpoints.filter(ep => ep.active !== false);
  let endpointName: string | undefined = activeEndpoints[0]?.name;

  if (activeEndpoints.length > 0) {
    const select = document.createElement('select');
    select.className = 'endpoint-select';
    activeEndpoints.forEach((endpoint) => {
      const option = document.createElement('option');
      option.value = endpoint.name;
      option.textContent = endpoint.name;
      select.appendChild(option);
    });
    select.addEventListener('change', (e) => {
      const target = e.target as HTMLSelectElement;
      endpointName = target.value;
    });
    panelActions.appendChild(select);
  }

  const previewBtn = createButton({
    className: 'btn-test',
    text: '👁 Preview',
    onClick: () => handlePreview(stream, endpointName)
  });

  const copyBtn = createButton({
    className: 'btn-secondary',
    text: '📋 Copy',
    onClick: () => handleCopyUrl(stream.url)
  });

  const callBtn = createButton({
    className: 'btn-action',
    text: '📤 Call',
    onClick: () => handleCallEndpoint('fetch', stream, endpointName)
  });

  const openTabBtn = createButton({
    className: 'btn-action',
    text: '🌐 Open tab',
    onClick: () => handleCallEndpoint('tab', stream, endpointName)
  });

  // Append buttons directly - CSS flexbox with wrap handles 2-row layout
  panelActions.appendChild(previewBtn);
  panelActions.appendChild(copyBtn);
  panelActions.appendChild(callBtn);
  panelActions.appendChild(openTabBtn);

  panel.style.display = 'block';
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

  logger.infoFlash(2000, 'popup', 'Generating preview:');
  previewCall(endpoint, context, logger);
}

/**
 * Handle endpoint action (call API or open in tab)
 */
async function handleCallEndpoint(mode: 'fetch' | 'tab', stream: StreamInfo, endpointName?: string) {
  const config = await browser.storage.sync.get(['apiEndpoints']);
  let endpoints: ReturnType<typeof parseEndpoints>;
  try {
    endpoints = parseEndpoints(config.apiEndpoints || '[]');
  } catch (parseError: any) {
    logger.error( 'endpoint', 'Invalid endpoint configuration. Check options.', parseError);
    return;
  }

  if (endpoints.length === 0) {
    logger.warn( 'endpoint', 'Please configure API endpoints in options first');
    setTimeout(async () => {
      const optionsUrl = browser.runtime.getURL('dist/options.html');
      await openOrSwitchToTab(optionsUrl);
    }, 2000);
    return;
  }

  const action = mode === 'fetch' ? 'Calling API' : 'Opening in tab';
  logger.infoFlash(3000, 'apicall', `${action}: ${endpointName || 'default'} → ${stream.url}`);

  // Direct call (popup runs in extension context)
  const response = await callEndpoint({
    mode,
    streamUrl: stream.url,
    pageUrl: stream.pageUrl,
    pageTitle: stream.pageTitle,
    endpointName,
    logger
  });

  if (response?.success) {
    const successMsg = mode === 'fetch' ? `✅ API call successful: ${response.message}` : `✅ Opened in new tab: ${response.details || stream.url}`;
    logger.infoFlash(3000, 'apicall', successMsg);
  } else {
    const errorMsg = response?.error ?? 'Unknown error';
    const failMsg = mode === 'fetch' ? `❌ API call failed: ${errorMsg}` : `❌ Failed to open URL: ${errorMsg}`;
    logger.error( 'apicall', failMsg, response);
  }
}

/**
 * Handle copy URL
 */
async function handleCopyUrl(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    // logger.infoFlash automatically logs to ring buffer
    logger.infoFlash(3000, 'clipboard', `📋 URL copied: ${url}`);
  } catch (error) {
    // Clipboard write may fail due to permissions.
    logger.warn( 'clipboard', '⚠️ Failed to copy URL', error);
  }
}

/**
 * Handle refresh
 */
async function handleRefresh() {
  try {
    const loading = document.getElementById('loading');
    if (loading) loading.style.display = 'block';

    const container = document.getElementById('streams-container');
    if (container) container.innerHTML = '';

    logger.debug('popup', 'Refresh button clicked');
    await loadStreams();
  } catch (error) {
    // Unexpected error in refresh - log and display
    logger.error( 'popup', 'Failed to refresh streams', error);
    const loading = document.getElementById('loading');
    if (loading) loading.style.display = 'none';
  }
}

/**
 * Handle options button
 */
async function handleOptions() {
  logger.debug('popup', 'Options button clicked');
  const optionsUrl = browser.runtime.getURL('dist/options.html');
  await openOrSwitchToTab(optionsUrl);
}

/**
 * Show notification
 */
// Inline notification UI removed; delegate to Logger for feedback

// Initialize when popup opens
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await initialize();
  } catch (error) {
    // Top-level exception handler - log and display to user
    logger.error( 'popup', 'Failed to initialize popup', error);
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'none';
  }
});
