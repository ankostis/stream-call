/**
 * stream-call Popup Script that calls the API endpoint (extension-context)
 */
export {};

import { parseEndpoints, type ApiEndpoint } from './endpoint';
import { Logger, StatusBar, LogLevel } from './logger';
import { createStatusRenderer, createLogAppender, applyLogFiltering } from './logging-ui';

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

// Logging utilities
const logger = new Logger();
const statusBar = new StatusBar();
statusBar.setLogger(logger);

// UI rendering will be set up in initialize() after DOM is ready
let renderStatus: ReturnType<typeof createStatusRenderer>;
let appendLog: ReturnType<typeof createLogAppender>;

/**
 * Initialize popup
 */
async function initialize() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (tabs.length === 0) return;

  currentTabId = tabs[0].id ?? null;

  // Setup UI rendering with actual DOM elements (now available)
  const statusBarEl = document.getElementById('status-bar') as HTMLDivElement;
  const statusIconEl = document.getElementById('status-icon') as HTMLSpanElement;
  const statusMsgEl = document.getElementById('status-message') as HTMLSpanElement;
  const logViewerEl = document.getElementById('log-viewer') as HTMLDivElement;
  const logToggleEl = document.getElementById('log-toggle') as HTMLButtonElement;
  const logFilterPanelEl = document.getElementById('log-filter-panel') as HTMLDivElement;

  // Wire status bar rendering
  renderStatus = createStatusRenderer({
    bar: statusBarEl,
    icon: statusIconEl,
    message: statusMsgEl
  });
  statusBar.subscribe((current) => renderStatus(current ? { level: current.level, message: current.message } : null));

  // Wire log appending
  appendLog = createLogAppender(logViewerEl);
  logger.subscribe((entries) => {
    entries.slice(-1).forEach((e) => appendLog(e.level, e.category as any, e.message));
  });

  // Wire log toggle (expand/collapse log viewer and filters)
  logToggleEl.addEventListener('click', () => {
    logViewerEl.classList.toggle('visible');
    logFilterPanelEl.classList.toggle('visible');
    logToggleEl.textContent = logViewerEl.classList.contains('visible') ? '📋 Hide' : '📋 Logs';
  });

  // Wire log filtering (filter panel always visible)\n  const levelCheckboxes = document.querySelectorAll('.log-level-filter') as NodeListOf<HTMLInputElement>;\n  applyLogFiltering(logViewerEl, levelCheckboxes);

  // Load data
  await loadEndpoints();
  await loadStreams();

  // Wire action buttons
  document.getElementById('refresh-btn')?.addEventListener('click', handleRefresh);
  document.getElementById('options-btn')?.addEventListener('click', handleOptions);

  logger.debug('popup', 'Popup initialized successfully');
}

// Helper to show log controls
function showLogControls() {
  const logToggleEl = document.getElementById('log-toggle') as HTMLButtonElement;
  if (logToggleEl) logToggleEl.style.display = 'block';
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
    // Parse error is expected if config is corrupted - show to user via statusBar (which logs internally)
    statusBar.post(LogLevel.Error, 'endpoint', 'Invalid API endpoints configured. Check options.', error);
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
    // Known issue: background worker crashed or not loaded - statusBar.post handles logging
    statusBar.post(LogLevel.Error, 'messaging', '⚠️ Extension background service not responding. Try reloading the extension.', pingError);
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'none';
    showLogControls();
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
    statusBar.post(LogLevel.Error, 'messaging', 'Failed to fetch streams from background', error);
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'none';
    showLogControls();
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

  // Show log controls if we have streams or errors
  if (logger.getAll().length > 0) {
    showLogControls();
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
  const panelType = document.getElementById('panel-type');
  const panelUrl = document.getElementById('panel-url');
  const panelActions = document.getElementById('panel-actions');

  if (!panel || !panelType || !panelUrl || !panelActions) return;

  panelType.textContent = stream.type;
  panelUrl.textContent = stream.url;
  panelUrl.title = stream.url;

  // Rebuild actions
  panelActions.innerHTML = '';

  let endpointName: string | undefined = apiEndpoints[0]?.name;

  if (apiEndpoints.length > 0) {
    const select = document.createElement('select');
    select.className = 'endpoint-select';
    apiEndpoints.forEach((endpoint) => {
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

  const callBtn = document.createElement('button');
  callBtn.className = 'btn-primary';
  callBtn.textContent = '📤 Call API';
  callBtn.addEventListener('click', () => handleCallAPI(stream, endpointName));

  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn-secondary';
  copyBtn.textContent = '📋 Copy';
  copyBtn.addEventListener('click', () => handleCopyUrl(stream.url));

  panelActions.appendChild(callBtn);
  panelActions.appendChild(copyBtn);

  panel.style.display = 'block';
}

/**
 * Handle API call
 */
async function handleCallAPI(stream: StreamInfo, endpointName?: string) {
  const config = await browser.storage.sync.get(['apiEndpoints']);
  let endpoints: ReturnType<typeof parseEndpoints>;
  try {
    endpoints = parseEndpoints(config.apiEndpoints || '[]');
  } catch (parseError: any) {
    // Parse error is a known configuration issue - statusBar.post handles logging
    statusBar.post(LogLevel.Error, 'endpoint', 'Invalid endpoint configuration. Check options.', parseError);
    showLogControls();
    return;
  }

  if (endpoints.length === 0) {
    // statusBar.post handles logging internally
    statusBar.post(LogLevel.Warn, 'endpoint', 'Please configure API endpoints in options first');
    showLogControls();
    setTimeout(() => {
      browser.runtime.openOptionsPage();
    }, 2000);
    return;
  }

  // statusBar.flash handles logging internally
  statusBar.flash(LogLevel.Info, 'apicall', 3000, 'Sending stream URL to API...');
  logger.info('apicall', `Calling API: endpoint=${endpointName}, streamUrl=${stream.url}`);

  let response;
  try {
    response = await browser.runtime.sendMessage({
      type: 'CALL_API',
      streamUrl: stream.url,
      pageUrl: stream.pageUrl,
      pageTitle: stream.pageTitle,
      endpointName
    });
  } catch (error) {
    // Message passing error - log and display
    statusBar.post(LogLevel.Error, 'apicall', 'Failed to send API request', error);
    showLogControls();
    return;
  }

  if (response?.success) {
    // statusBar.flash handles logging internally
  statusBar.flash(LogLevel.Info, 'apicall', 3000, '✅ Stream URL sent successfully!');
    logger.info('apicall', `API call succeeded: ${response.details || 'no details'}`);
  } else {
    // statusBar.post handles logging internally
    const errorMsg = response?.error ?? 'Unknown error';
    statusBar.post(LogLevel.Error, 'apicall', `❌ Error: ${errorMsg}`);
    logger.error('apicall', `API call failed: ${errorMsg}`, response);
    showLogControls();
  }
}

/**
 * Handle copy URL
 */
async function handleCopyUrl(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    // statusBar.flash handles logging internally
    statusBar.flash(LogLevel.Info, 'clipboard', 3000, '📋 URL copied to clipboard');
    logger.debug('popup', `Copied URL to clipboard: ${url}`);
  } catch (error) {
    // Clipboard write may fail due to permissions; statusBar.post handles logging
    statusBar.post(LogLevel.Warn, 'clipboard', '⚠️ Failed to copy URL', error);
    showLogControls();
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
    statusBar.post(LogLevel.Error, 'popup', 'Failed to refresh streams', error);
    const loading = document.getElementById('loading');
    if (loading) loading.style.display = 'none';
    showLogControls();
  }
}

/**
 * Handle options button
 */
function handleOptions() {
  logger.debug('popup', 'Options button clicked');
  browser.runtime.openOptionsPage();
}

/**
 * Show notification
 */
// Inline notification UI removed; delegate to StatusBar/Logger for feedback

// Initialize when popup opens
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await initialize();
  } catch (error) {
    // Top-level exception handler - log and display to user
    statusBar.post(LogLevel.Error, 'popup', 'Failed to initialize popup', error);
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'none';
    showLogControls();
  }
});
