/**
 * StreamCall Options Script
 */

// Default configuration
const DEFAULT_CONFIG = {
  apiEndpoint: '',
  apiMethod: 'POST',
  apiHeaders: '{}',
  includePageInfo: true
};

/**
 * Load saved settings
 */
async function loadSettings() {
  try {
    const config = await browser.storage.sync.get(DEFAULT_CONFIG);
    
    document.getElementById('api-endpoint').value = config.apiEndpoint;
    document.getElementById('api-method').value = config.apiMethod;
    document.getElementById('api-headers').value = config.apiHeaders;
    document.getElementById('include-page-info').checked = config.includePageInfo;
    
  } catch (error) {
    console.error('Failed to load settings:', error);
    showAlert('Failed to load settings', 'error');
  }
}

/**
 * Save settings
 */
async function saveSettings() {
  try {
    const apiEndpoint = document.getElementById('api-endpoint').value.trim();
    const apiMethod = document.getElementById('api-method').value;
    const apiHeaders = document.getElementById('api-headers').value.trim();
    const includePageInfo = document.getElementById('include-page-info').checked;
    
    // Validate API endpoint
    if (!apiEndpoint) {
      showAlert('Please enter an API endpoint URL', 'error');
      return;
    }
    
    try {
      new URL(apiEndpoint);
    } catch (e) {
      showAlert('Please enter a valid URL for the API endpoint', 'error');
      return;
    }
    
    // Validate JSON headers
    if (apiHeaders) {
      try {
        JSON.parse(apiHeaders);
      } catch (e) {
        showAlert('Invalid JSON in custom headers. Please fix the syntax.', 'error');
        return;
      }
    }
    
    // Save configuration
    await browser.storage.sync.set({
      apiEndpoint,
      apiMethod,
      apiHeaders: apiHeaders || '{}',
      includePageInfo
    });
    
    showAlert('✅ Settings saved successfully!', 'success');
    
  } catch (error) {
    console.error('Failed to save settings:', error);
    showAlert('Failed to save settings', 'error');
  }
}

/**
 * Test API connection
 */
async function testAPI() {
  try {
    const apiEndpoint = document.getElementById('api-endpoint').value.trim();
    const apiMethod = document.getElementById('api-method').value;
    const apiHeaders = document.getElementById('api-headers').value.trim();
    const includePageInfo = document.getElementById('include-page-info').checked;
    
    if (!apiEndpoint) {
      showAlert('Please enter an API endpoint URL first', 'error');
      return;
    }
    
    showAlert('Testing API connection...', 'info');
    
    // Prepare test payload
    const testPayload = {
      streamUrl: 'https://example.com/test-stream.m3u8',
      timestamp: new Date().toISOString()
    };
    
    if (includePageInfo) {
      testPayload.pageUrl = 'https://example.com/test-page';
      testPayload.pageTitle = 'Test Page - StreamCall';
    }
    
    // Parse headers
    let headers = { 'Content-Type': 'application/json' };
    if (apiHeaders) {
      try {
        const customHeaders = JSON.parse(apiHeaders);
        headers = { ...headers, ...customHeaders };
      } catch (e) {
        showAlert('Invalid JSON in custom headers', 'error');
        return;
      }
    }
    
    // Make test request
    const response = await fetch(apiEndpoint, {
      method: apiMethod,
      headers: headers,
      body: JSON.stringify(testPayload)
    });
    
    if (response.ok) {
      showAlert(`✅ API test successful! Status: ${response.status} ${response.statusText}`, 'success');
    } else {
      showAlert(`⚠️ API returned status ${response.status}: ${response.statusText}`, 'error');
    }
    
  } catch (error) {
    console.error('API test error:', error);
    showAlert(`❌ API test failed: ${error.message}`, 'error');
  }
}

/**
 * Reset to default settings
 */
function resetSettings() {
  if (confirm('Are you sure you want to reset all settings to defaults?')) {
    document.getElementById('api-endpoint').value = DEFAULT_CONFIG.apiEndpoint;
    document.getElementById('api-method').value = DEFAULT_CONFIG.apiMethod;
    document.getElementById('api-headers').value = DEFAULT_CONFIG.apiHeaders;
    document.getElementById('include-page-info').checked = DEFAULT_CONFIG.includePageInfo;
    
    showAlert('Settings reset to defaults. Click Save to apply.', 'info');
  }
}

/**
 * Show alert message
 */
function showAlert(message, type = 'info') {
  const alert = document.getElementById('alert');
  alert.textContent = message;
  alert.className = `alert ${type}`;
  alert.style.display = 'block';
  
  // Auto-hide after 5 seconds for success messages
  if (type === 'success') {
    setTimeout(() => {
      alert.style.display = 'none';
    }, 5000);
  }
}

/**
 * Initialize options page
 */
function initialize() {
  loadSettings();
  
  // Setup event listeners
  document.getElementById('save-btn').addEventListener('click', saveSettings);
  document.getElementById('test-btn').addEventListener('click', testAPI);
  document.getElementById('reset-btn').addEventListener('click', resetSettings);
  
  // Auto-format JSON on blur
  document.getElementById('api-headers').addEventListener('blur', function() {
    const value = this.value.trim();
    if (value) {
      try {
        const parsed = JSON.parse(value);
        this.value = JSON.stringify(parsed, null, 2);
      } catch (e) {
        // Invalid JSON, leave as-is
      }
    }
  });
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', initialize);
