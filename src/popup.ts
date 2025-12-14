/**
 * stream-call Popup Script
 */
export {};

import { parseEndpoints, type ApiEndpoint } from './endpoint';
import { Logger, StatusBar, LogLevel } from './logger';
import { createStatusRenderer, createLogAppender, setupLogFiltering } from './logging-ui';

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
  const logFilterToggleEl = document.getElementById('log-filter-toggle') as HTMLButtonElement;
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

  // Wire log toggle
  logToggleEl.addEventListener('click', () => {
    logViewerEl.classList.toggle('visible');
    logToggleEl.textContent = logViewerEl.classList.contains('visible') ? '📋 Hide logs' : '📋 Show logs';
  });

  // Wire log filtering
  const levelCheckboxes = document.querySelectorAll('.log-level-filter') as NodeListOf<HTMLInputElement>;
  setupLogFiltering(logViewerEl, logFilterPanelEl, logFilterToggleEl, levelCheckboxes);

  // Load data
  await loadEndpoints();
  await loadStreams();

  // Wire action buttons
  document.getElementById('refresh-btn')?.addEventListener('click', handleRefresh);
  document.getElementById('options-btn')?.addEventListener('click', handleOptions);
}

// Helper to show log controls
function showLogControls() {
  const logToggleEl = document.getElementById('log-toggle') as HTMLButtonElement;
  const logFilterToggleEl = document.getElementById('log-filter-toggle') as HTMLButtonElement;
  if (logToggleEl) logToggleEl.style.display = 'block';
  if (logFilterToggleEl) logFilterToggleEl.style.display = 'block';
}

async function loadEndpoints() {
  // Return cached endpoints if available (avoids repeated storage reads during popup lifetime)
  if (endpointsCached) return;

  const defaults = { apiEndpoints: '[]' } as const;
  const stored = (await browser.storage.sync.get(defaults)) as typeof defaults;
  try {
    apiEndpoints = parseEndpoints(stored.apiEndpoints);
  } catch (error: any) {
    // Parse error is expected if config is corrupted - show to user via statusBar (which logs internally)
    statusBar.post(LogLevel.Error, 'config-error', 'Invalid API endpoints configured. Check options.', error);
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
    statusBar.post(LogLevel.Error, 'background-error', '⚠️ Extension background service not responding. Try reloading the extension.', pingError);
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'none';
    showLogControls();
    return;
  }

  const response = await browser.runtime.sendMessage({
    type: 'GET_STREAMS',
    tabId: currentTabId
  });

  const streams = (response?.streams as StreamInfo[] | undefined) || [];

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
 * Display streams in the UI
 */
function displayStreams(streams: StreamInfo[]) {
  const container = document.getElementById('streams-container');
  if (!container) return;

  container.innerHTML = '';
  const streamsList = document.createElement('div');
  streamsList.className = 'streams-list';

  streams.forEach((stream, index) => {
    const streamItem = createStreamItem(stream, index);
    streamsList.appendChild(streamItem);
  });

  container.appendChild(streamsList);
}

/**
 * Create stream item element
 */
function createStreamItem(stream: StreamInfo, index: number): HTMLElement {
  const item = document.createElement('div');
  item.className = 'stream-item';
  item.setAttribute('data-index', index.toString());

  const type = document.createElement('span');
  type.className = 'stream-type';
  type.textContent = stream.type;

  const url = document.createElement('div');
  url.className = 'stream-url';
  url.textContent = stream.url;
  url.title = stream.url;

  const actions = document.createElement('div');
  actions.className = 'stream-actions';

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
    actions.appendChild(select);
  }

  const callBtn = document.createElement('button');
  callBtn.className = 'btn-primary';
  callBtn.textContent = '📤 Call API';
  callBtn.addEventListener('click', () => handleCallAPI(stream, endpointName));

  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn-secondary';
  copyBtn.textContent = '📋 Copy';
  copyBtn.addEventListener('click', () => handleCopyUrl(stream.url));

  actions.appendChild(callBtn);
  actions.appendChild(copyBtn);

  item.appendChild(type);
  item.appendChild(url);
  item.appendChild(actions);

  return item;
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
    statusBar.post(LogLevel.Error, 'config-error', 'Invalid endpoint configuration. Check options.', parseError);
    showLogControls();
    return;
  }

  if (endpoints.length === 0) {
    // statusBar.post handles logging internally
    statusBar.post(LogLevel.Warn, 'config-error', 'Please configure API endpoints in options first');
    showLogControls();
    setTimeout(() => {
      browser.runtime.openOptionsPage();
    }, 2000);
    return;
  }

  // statusBar.flash handles logging internally
  statusBar.flash(LogLevel.Info, 'api-status', 3000, 'Sending stream URL to API...');

  const response = await browser.runtime.sendMessage({
    type: 'CALL_API',
    streamUrl: stream.url,
    pageUrl: stream.pageUrl,
    pageTitle: stream.pageTitle,
    endpointName
  });

  if (response?.success) {
    // statusBar.flash handles logging internally
    statusBar.flash(LogLevel.Info, 'api-status', 3000, '✅ Stream URL sent successfully!');
  } else {
    // statusBar.post handles logging internally
    statusBar.post(LogLevel.Error, 'api-error', `❌ Error: ${response?.error ?? 'Unknown error'}`);
    showLogControls();
  }
  // Note: Other errors (storage.get, sendMessage) bubble to event handler caller
}

/**
 * Handle copy URL
 */
async function handleCopyUrl(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    // statusBar.flash handles logging internally
    statusBar.flash(LogLevel.Info, 'last-action', 3000, '📋 URL copied to clipboard');
  } catch (error) {
    // Clipboard write may fail due to permissions; statusBar.post handles logging
    statusBar.post(LogLevel.Warn, 'clipboard-error', '⚠️ Failed to copy URL', error);
    showLogControls();
  }
}

/**
 * Handle refresh
 */
async function handleRefresh() {
  const loading = document.getElementById('loading');
  if (loading) loading.style.display = 'block';

  const container = document.getElementById('streams-container');
  if (container) container.innerHTML = '';

  await loadStreams();
}

/**
 * Handle options button
 */
function handleOptions() {
  browser.runtime.openOptionsPage();
}

/**
 * Show notification
 */
// Inline notification UI removed; delegate to StatusBar/Logger for feedback

// Initialize when popup opens
document.addEventListener('DOMContentLoaded', initialize);
