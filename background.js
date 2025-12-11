/**
 * StreamCall Background Service Worker
 * Handles communication between content scripts and popup,
 * manages detected streams, and triggers API calls
 */

// Store detected streams per tab
const tabStreams = new Map();

// Listen for messages from content scripts
browser.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'STREAM_DETECTED') {
    const tabId = sender.tab.id;
    
    // Initialize or update streams for this tab
    if (!tabStreams.has(tabId)) {
      tabStreams.set(tabId, []);
    }
    
    const streams = tabStreams.get(tabId);
    const streamInfo = {
      url: message.url,
      type: message.streamType,
      pageUrl: sender.tab.url,
      pageTitle: sender.tab.title,
      timestamp: Date.now()
    };
    
    // Avoid duplicates
    const exists = streams.some(s => s.url === streamInfo.url);
    if (!exists) {
      streams.push(streamInfo);
      console.log('Stream detected:', streamInfo);
      
      // Update badge to show number of streams
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
function updateBadge(tabId, count) {
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
async function callStreamAPI(streamUrl, pageUrl, pageTitle) {
  try {
    // Get API configuration from storage
    const config = await browser.storage.sync.get({
      apiEndpoint: '',
      apiMethod: 'POST',
      apiHeaders: '{}',
      includePageInfo: true
    });
    
    if (!config.apiEndpoint) {
      return {
        success: false,
        error: 'API endpoint not configured. Please set it in the extension options.'
      };
    }
    
    // Prepare request payload
    const payload = {
      streamUrl: streamUrl,
      timestamp: new Date().toISOString()
    };
    
    if (config.includePageInfo) {
      payload.pageUrl = pageUrl;
      payload.pageTitle = pageTitle;
    }
    
    // Parse custom headers
    let headers = { 'Content-Type': 'application/json' };
    try {
      const customHeaders = JSON.parse(config.apiHeaders);
      headers = { ...headers, ...customHeaders };
    } catch (e) {
      console.warn('Invalid custom headers JSON:', e);
    }
    
    // Make API call
    const response = await fetch(config.apiEndpoint, {
      method: config.apiMethod,
      headers: headers,
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
    
  } catch (error) {
    console.error('API call failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

console.log('StreamCall background service worker loaded');
