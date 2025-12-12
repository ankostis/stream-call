/**
 * Stream call Options Script
 */
export {};

const DEFAULT_CONFIG = {
  apiEndpoint: '',
  apiMethod: 'POST',
  apiHeaders: '{}',
  includePageInfo: true
} as const;

type Config = typeof DEFAULT_CONFIG;

/**
 * Load saved settings
 */
async function loadSettings() {
  try {
    const config = (await browser.storage.sync.get(DEFAULT_CONFIG)) as Config;

    (document.getElementById('api-endpoint') as HTMLInputElement).value = config.apiEndpoint;
    (document.getElementById('api-method') as HTMLSelectElement).value = config.apiMethod;
    (document.getElementById('api-headers') as HTMLTextAreaElement).value = config.apiHeaders;
    (document.getElementById('include-page-info') as HTMLInputElement).checked = config.includePageInfo;
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
    const apiEndpoint = (document.getElementById('api-endpoint') as HTMLInputElement).value.trim();
    const apiMethod = (document.getElementById('api-method') as HTMLSelectElement).value;
    const apiHeaders = (document.getElementById('api-headers') as HTMLTextAreaElement).value.trim();
    const includePageInfo = (document.getElementById('include-page-info') as HTMLInputElement).checked;

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

    if (apiHeaders) {
      try {
        JSON.parse(apiHeaders);
      } catch (e) {
        showAlert('Invalid JSON in custom headers. Please fix the syntax.', 'error');
        return;
      }
    }

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
    const apiEndpoint = (document.getElementById('api-endpoint') as HTMLInputElement).value.trim();
    const apiMethod = (document.getElementById('api-method') as HTMLSelectElement).value;
    const apiHeaders = (document.getElementById('api-headers') as HTMLTextAreaElement).value.trim();
    const includePageInfo = (document.getElementById('include-page-info') as HTMLInputElement).checked;

    if (!apiEndpoint) {
      showAlert('Please enter an API endpoint URL first', 'error');
      return;
    }

    showAlert('Testing API connection...', 'info');

    const testPayload: Record<string, unknown> = {
      streamUrl: 'https://example.com/test-stream.m3u8',
      timestamp: new Date().toISOString()
    };

    if (includePageInfo) {
      testPayload.pageUrl = 'https://example.com/test-page';
      testPayload.pageTitle = 'Test Page - Stream call';
    }

    let headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiHeaders) {
      try {
        const customHeaders = JSON.parse(apiHeaders) as Record<string, string>;
        headers = { ...headers, ...customHeaders };
      } catch (e) {
        showAlert('Invalid JSON in custom headers', 'error');
        return;
      }
    }

    const response = await fetch(apiEndpoint, {
      method: apiMethod,
      headers,
      body: JSON.stringify(testPayload)
    });

    if (response.ok) {
      showAlert(`✅ API test successful! Status: ${response.status} ${response.statusText}`, 'success');
    } else {
      showAlert(`⚠️ API returned status ${response.status}: ${response.statusText}`, 'error');
    }
  } catch (error: any) {
    console.error('API test error:', error);
    showAlert(`❌ API test failed: ${error?.message ?? 'Unknown error'}`, 'error');
  }
}

/**
 * Reset to default settings
 */
function resetSettings() {
  if (confirm('Are you sure you want to reset all settings to defaults?')) {
    (document.getElementById('api-endpoint') as HTMLInputElement).value = DEFAULT_CONFIG.apiEndpoint;
    (document.getElementById('api-method') as HTMLSelectElement).value = DEFAULT_CONFIG.apiMethod;
    (document.getElementById('api-headers') as HTMLTextAreaElement).value = DEFAULT_CONFIG.apiHeaders;
    (document.getElementById('include-page-info') as HTMLInputElement).checked = DEFAULT_CONFIG.includePageInfo;

    showAlert('Settings reset to defaults. Click Save to apply.', 'info');
  }
}

/**
 * Show alert message
 */
function showAlert(message: string, type: 'info' | 'success' | 'error' = 'info') {
  const alert = document.getElementById('alert');
  if (!alert) return;

  alert.textContent = message;
  alert.className = `alert ${type}`;
  alert.style.display = 'block';

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

  document.getElementById('save-btn')?.addEventListener('click', saveSettings);
  document.getElementById('test-btn')?.addEventListener('click', testAPI);
  document.getElementById('reset-btn')?.addEventListener('click', resetSettings);

  (document.getElementById('api-headers') as HTMLTextAreaElement).addEventListener('blur', function () {
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

document.addEventListener('DOMContentLoaded', initialize);
