/**
 * stream-call Options Script
 */
export {};

const DEFAULT_CONFIG = {
  apiPatterns: JSON.stringify(
    [
      {
        id: 'url-param',
        name: 'URL Parameter GET',
        endpointTemplate: 'https://api.example.com/record?url={{streamUrl}}&time={{timestamp}}',
        method: 'GET',
        includePageInfo: false
      },
      {
        id: 'default-json',
        name: 'Default JSON POST',
        endpointTemplate: 'https://api.example.com/stream',
        method: 'POST',
        bodyTemplate:
          '{"streamUrl":"{{streamUrl}}","timestamp":"{{timestamp}}","pageUrl":"{{pageUrl}}","pageTitle":"{{pageTitle}}"}',
        includePageInfo: true
      },
      {
        id: 'echo-httpbin',
        name: 'Echo httpbin (POST)',
        endpointTemplate: 'https://httpbin.org/anything',
        method: 'POST',
        headers: { 'X-Test': 'stream-call' },
        bodyTemplate:
          '{"url":"{{streamUrl}}","title":"{{pageTitle}}","page":"{{pageUrl}}","time":"{{timestamp}}"}',
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
    const apiPatternsRaw = (document.getElementById('api-patterns') as HTMLTextAreaElement).value.trim();

    const validatedPatterns = validatePatterns(apiPatternsRaw || '[]');
    if (!validatedPatterns.valid) {
      showAlert(validatedPatterns.errorMessage ?? 'Invalid API patterns JSON', 'error');
      return;
    }

    if (validatedPatterns.parsed.length === 0) {
      showAlert('Please add at least one API pattern', 'error');
      return;
    }

    await browser.storage.sync.set({
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
    const apiPatternsRaw = (document.getElementById('api-patterns') as HTMLTextAreaElement).value.trim();
    const patterns = validatePatterns(apiPatternsRaw || '[]');

    if (!patterns.valid || patterns.parsed.length === 0) {
      showAlert('Please add at least one valid API pattern first', 'error');
      return;
    }

    showAlert('Testing API connection...', 'info');

    const firstPattern = patterns.parsed[0];
    const context = {
      streamUrl: 'https://example.com/test-stream.m3u8',
      timestamp: new Date().toISOString(),
      pageUrl: firstPattern.includePageInfo ? 'https://example.com/test-page' : undefined,
      pageTitle: firstPattern.includePageInfo ? 'Test Page - stream-call' : undefined
    } as Record<string, unknown>;

    const endpoint = applyTemplate(firstPattern.endpointTemplate, context);
    const method = (firstPattern.method || 'POST').toUpperCase();

    let headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (firstPattern.headers) {
      headers = { ...headers, ...firstPattern.headers };
    }

    const body = firstPattern.bodyTemplate
      ? applyTemplate(firstPattern.bodyTemplate, context)
      : JSON.stringify(
          firstPattern.includePageInfo
            ? context
            : { streamUrl: context.streamUrl, timestamp: context.timestamp }
        );

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

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', initialize);
}

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

import { applyTemplate } from './template';
