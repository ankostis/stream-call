/**
 * stream-call Popup Script
 */
export {};

import { parseEndpoints, type ApiEndpoint } from './endpoint';

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

/**
 * Initialize popup
 */
async function initialize() {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs.length === 0) return;

    currentTabId = tabs[0].id ?? null;
    await loadEndpoints();
    await loadStreams();

    document.getElementById('refresh-btn')?.addEventListener('click', handleRefresh);
    document.getElementById('options-btn')?.addEventListener('click', handleOptions);
  } catch (error) {
    console.error('Initialization error:', error);
    showNotification('Failed to initialize', 'error');
  }
}

async function loadEndpoints() {
  // Return cached endpoints if available (avoids repeated storage reads during popup lifetime)
  if (endpointsCached) return;

  const defaults = { apiEndpoints: '[]' } as const;
  const stored = (await browser.storage.sync.get(defaults)) as typeof defaults;
  try {
    apiEndpoints = parseEndpoints(stored.apiEndpoints);
  } catch (error: any) {
    console.error('Failed to parse API endpoints:', error);
    showNotification(
      `API endpoint error: ${error?.message ?? 'Invalid endpoints'}. Check options.`,
      'error'
    );
    apiEndpoints = [];
  }
  endpointsCached = true;
}

/**
 * Load and display streams for current tab
 */
async function loadStreams() {
  if (currentTabId === null) return;

  try {
    // Verify background worker is alive before fetching streams
    try {
      await browser.runtime.sendMessage({ type: 'PING' });
    } catch (pingError) {
      console.error('Background worker not responding:', pingError);
      const loadingEl = document.getElementById('loading');
      if (loadingEl) loadingEl.style.display = 'none';
      showNotification('⚠️ Extension background service not responding. Try reloading the extension.', 'error');
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
  } catch (error) {
    console.error('Failed to load streams:', error);
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'none';
    showNotification('Failed to load streams from background. Try refreshing.', 'error');
  }
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
  try {
    const config = await browser.storage.sync.get(['apiEndpoints']);
    let endpoints: ReturnType<typeof parseEndpoints>;
    try {
      endpoints = parseEndpoints(config.apiEndpoints || '[]');
    } catch (parseError: any) {
      showNotification(
        `Failed to parse endpoints: ${parseError?.message ?? 'Invalid JSON'}. Check options.`,
        'error'
      );
      return;
    }

    if (endpoints.length === 0) {
      showNotification('Please configure API endpoints in options first', 'error');
      setTimeout(() => {
        browser.runtime.openOptionsPage();
      }, 2000);
      return;
    }

    showNotification('Sending stream URL to API...', 'info');

    const response = await browser.runtime.sendMessage({
      type: 'CALL_API',
      streamUrl: stream.url,
      pageUrl: stream.pageUrl,
      pageTitle: stream.pageTitle,
      endpointName
    });

    if (response?.success) {
      showNotification('✅ Stream URL sent successfully!', 'success');
    } else {
      showNotification(`❌ Error: ${response?.error ?? 'Unknown error'}`, 'error');
    }
  } catch (error) {
    console.error('API call error:', error);
    showNotification('Failed to call API', 'error');
  }
}

/**
 * Handle copy URL
 */
async function handleCopyUrl(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    showNotification('📋 URL copied to clipboard', 'success');
  } catch (error) {
    console.error('Copy error:', error);
    showNotification('Failed to copy URL', 'error');
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
function showNotification(message: string, type: 'info' | 'success' | 'error' = 'info') {
  const existing = document.querySelectorAll('.notification');
  existing.forEach((el) => el.remove());

  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.remove();
  }, 3000);
}

// Initialize when popup opens
document.addEventListener('DOMContentLoaded', initialize);
