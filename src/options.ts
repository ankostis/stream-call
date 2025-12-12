/**
 * stream-call Options Script
 */
export {};

const DEFAULT_CONFIG = {
  apiEndpoint: '',
  apiMethod: 'POST',
  apiHeaders: '{}',
  includePageInfo: true,
  apiPatterns: JSON.stringify(
    [
      {
        id: 'default-pattern',
        name: 'Default JSON',
        endpointTemplate: 'https://api.example.com/stream',
        method: 'POST',
        headers: { 'X-Example': 'value' },
        bodyTemplate:
          '{"streamUrl":"{{streamUrl}}","timestamp":"{{timestamp}}","pageUrl":"{{pageUrl}}","pageTitle":"{{pageTitle}}"}',
        includePageInfo: true
      }
    ],
    null,
    2
  )
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
    (document.getElementById('api-patterns') as HTMLTextAreaElement).value = config.apiPatterns;
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
    const apiPatternsRaw = (document.getElementById('api-patterns') as HTMLTextAreaElement).value.trim();
    const apiPatternsRaw = (document.getElementById('api-patterns') as HTMLTextAreaElement).value.trim();

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

    const validatedPatterns = validatePatterns(apiPatternsRaw || '[]');
    if (!validatedPatterns.valid) {
      showAlert(validatedPatterns.errorMessage ?? 'Invalid API patterns JSON', 'error');
      return;
    }

    await browser.storage.sync.set({
      apiEndpoint,
      apiMethod,
      apiHeaders: apiHeaders || '{}',
      includePageInfo,
      apiPatterns: validatedPatterns.formatted
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

    const patterns = validatePatterns(apiPatternsRaw || '[]');
    if (!apiEndpoint && (!patterns.valid || patterns.parsed.length === 0)) {
      showAlert('Please enter an API endpoint URL or a pattern first', 'error');
      return;
    }

    showAlert('Testing API connection...', 'info');

    const context = {
      streamUrl: 'https://example.com/test-stream.m3u8',
      timestamp: new Date().toISOString(),
      pageUrl: includePageInfo ? 'https://example.com/test-page' : undefined,
      pageTitle: includePageInfo ? 'Test Page - stream-call' : undefined
    } as Record<string, unknown>;

    const firstPattern = patterns.valid ? patterns.parsed[0] : undefined;
    const endpoint = firstPattern
      ? applyTemplate(firstPattern.endpointTemplate, context)
      : apiEndpoint;
    const method = (firstPattern?.method || apiMethod).toUpperCase();

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
    if (firstPattern?.headers) {
      headers = { ...headers, ...firstPattern.headers };
    }

    const body = firstPattern?.bodyTemplate
      ? applyTemplate(firstPattern.bodyTemplate, context)
      : JSON.stringify(context);

    const response = await fetch(endpoint, {
      method,
      headers,
      body
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
    (document.getElementById('api-patterns') as HTMLTextAreaElement).value = DEFAULT_CONFIG.apiPatterns;

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

  (document.getElementById('api-patterns') as HTMLTextAreaElement).addEventListener('blur', function () {
    const value = this.value.trim();
    if (value) {
      const validated = validatePatterns(value);
      if (validated.valid) {
        this.value = validated.formatted;
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', initialize);

function validatePatterns(raw: string): {
  valid: boolean;
  parsed: Array<{
    id: string;
    name: string;
    endpointTemplate: string;
    method?: string;
    headers?: Record<string, string>;
    bodyTemplate?: string;
    includePageInfo?: boolean;
  }>;
  formatted: string;
  errorMessage?: string;
} {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return { valid: false, parsed: [], formatted: '[]', errorMessage: 'API patterns must be a JSON array.' };
    }

    const cleaned = parsed
      .map((p: any, index: number) => {
        if (!p || typeof p.endpointTemplate !== 'string' || !p.endpointTemplate.trim()) {
          throw new Error(`Pattern ${index + 1} is missing an endpointTemplate.`);
        }
        return {
          id: p.id || crypto.randomUUID(),
          name: p.name || `Pattern ${index + 1}`,
          endpointTemplate: p.endpointTemplate,
          method: p.method || 'POST',
          headers: p.headers,
          bodyTemplate: p.bodyTemplate,
          includePageInfo: p.includePageInfo ?? true
        };
      })
      .filter(Boolean);

    return {
      valid: true,
      parsed: cleaned,
      formatted: JSON.stringify(cleaned, null, 2)
    };
  } catch (e: any) {
    return { valid: false, parsed: [], formatted: '[]', errorMessage: e?.message };
  }
}

function applyTemplate(template: string, context: Record<string, unknown>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => {
    const value = context[key];
    return value === undefined || value === null ? '' : String(value);
  });
}
