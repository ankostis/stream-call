/**
 * StreamCall Popup Script
 */

let currentTabId = null;

/**
 * Initialize popup
 */
async function initialize() {
  try {
    // Get current tab
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs.length === 0) return;
    
    currentTabId = tabs[0].id;
    
    // Load streams
    await loadStreams();
    
    // Setup event listeners
    document.getElementById('refresh-btn').addEventListener('click', handleRefresh);
    document.getElementById('options-btn').addEventListener('click', handleOptions);
    
  } catch (error) {
    console.error('Initialization error:', error);
    showNotification('Failed to initialize', 'error');
  }
}

/**
 * Load and display streams for current tab
 */
async function loadStreams() {
  try {
    const response = await browser.runtime.sendMessage({
      type: 'GET_STREAMS',
      tabId: currentTabId
    });
    
    const streams = response.streams || [];
    
    // Hide loading
    document.getElementById('loading').style.display = 'none';
    
    if (streams.length === 0) {
      document.getElementById('empty-state').style.display = 'block';
      document.getElementById('status').style.display = 'none';
    } else {
      document.getElementById('empty-state').style.display = 'none';
      document.getElementById('status').style.display = 'block';
      document.getElementById('status').classList.add('detected');
      document.getElementById('stream-count').textContent = streams.length;
      
      displayStreams(streams);
    }
    
  } catch (error) {
    console.error('Failed to load streams:', error);
    document.getElementById('loading').style.display = 'none';
    document.getElementById('empty-state').style.display = 'block';
  }
}

/**
 * Display streams in the UI
 */
function displayStreams(streams) {
  const container = document.getElementById('streams-container');
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
function createStreamItem(stream, index) {
  const item = document.createElement('div');
  item.className = 'stream-item';
  
  const type = document.createElement('span');
  type.className = 'stream-type';
  type.textContent = stream.type;
  
  const url = document.createElement('div');
  url.className = 'stream-url';
  url.textContent = stream.url;
  url.title = stream.url;
  
  const actions = document.createElement('div');
  actions.className = 'stream-actions';
  
  const callBtn = document.createElement('button');
  callBtn.className = 'btn-primary';
  callBtn.textContent = '📤 Call API';
  callBtn.addEventListener('click', () => handleCallAPI(stream));
  
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
async function handleCallAPI(stream) {
  try {
    // Check if API is configured
    const config = await browser.storage.sync.get('apiEndpoint');
    if (!config.apiEndpoint) {
      showNotification('Please configure API endpoint in options first', 'error');
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
      pageTitle: stream.pageTitle
    });
    
    if (response.success) {
      showNotification('✅ Stream URL sent successfully!', 'success');
    } else {
      showNotification(`❌ Error: ${response.error}`, 'error');
    }
    
  } catch (error) {
    console.error('API call error:', error);
    showNotification('Failed to call API', 'error');
  }
}

/**
 * Handle copy URL
 */
async function handleCopyUrl(url) {
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
  document.getElementById('loading').style.display = 'block';
  document.getElementById('streams-container').innerHTML = '';
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
function showNotification(message, type = 'info') {
  // Remove existing notifications
  const existing = document.querySelectorAll('.notification');
  existing.forEach(el => el.remove());
  
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
