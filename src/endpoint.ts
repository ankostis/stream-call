/**
 * Configuration and templating utilities for stream-call
 * Centralized endpoint parsing, validation, normalization, and template interpolation
 */

import type { Logger } from './logger';

export type ApiEndpoint = {
  name: string;
  endpointTemplate: string;
  method?: string;
  headers?: Record<string, string>;
  bodyTemplate?: string;
  includeCookies?: boolean;
  includePageHeaders?: boolean;
  active?: boolean;
};

/**
 * Default configuration with demo endpoints (blueprints)
 * Single source of truth for built-in endpoints
 * Built-ins are identified by name prefix 'httpbingo'
 */
export const DEFAULT_CONFIG = {
  enableHoverPanel: false,
  apiEndpoints: JSON.stringify(
    [
      {
        name: 'httpbingo GET (open in tab)',
        endpointTemplate: 'https://httpbingo.org/anything?url={{streamUrl}}&page={{pageUrl}}&title={{pageTitle|url}}&time={{timestamp}}',
        active: true
      },
      {
        name: 'httpbingo POST (fetch API)',
        endpointTemplate: 'https://httpbingo.org/anything',
        method: 'POST',
        bodyTemplate: '{"streamUrl":"{{streamUrl}}","pageUrl":"{{pageUrl}}","pageTitle":"{{pageTitle}}","timestamp":{{timestamp}}}',
        active: true
      },
      {
        name: 'httpbingo POST with headers (inactive example)',
        endpointTemplate: 'https://httpbingo.org/anything',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Custom-Header': 'stream-call' },
        bodyTemplate: '{"streamUrl":"{{streamUrl}}","timestamp":{{timestamp}}}',
        active: false
      }
    ],
    null,
    2
  )
} as const;

/**
 * Get built-in blueprint endpoints from DEFAULT_CONFIG
 */
export function getBuiltInEndpoints(): ApiEndpoint[] {
  return parseEndpoints(DEFAULT_CONFIG.apiEndpoints);
}

/**
 * Suggest an endpoint name from an endpoint URL (extract hostname)
 * Example: https://api.example.com/stream → api.example.com
 */
export function suggestEndpointName(endpointUrl: string): string {
  try {
    const url = new URL(endpointUrl);
    return url.hostname || 'API Endpoint';
  } catch {
    // Fallback if URL is invalid
    return endpointUrl.substring(0, 30).replace(/[^a-z0-9.-]/gi, '');
  }
}

/**
 * Parse raw JSON string into validated ApiEndpoint array
 * Requires name field; enforces uniqueness by name
 * Throws on invalid JSON or invalid endpoint structure
 */
export function parseEndpoints(raw: string): ApiEndpoint[] {
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('API endpoints must be a JSON array.');
  }

  const names = new Set<string>();
  return parsed
    .map((p) => ({
      name: p.name || suggestEndpointName(p.endpointTemplate),
      endpointTemplate: p.endpointTemplate,
      method: p.method,
      headers: p.headers,
      bodyTemplate: p.bodyTemplate,
      includeCookies: p.includeCookies,
      includePageHeaders: p.includePageHeaders,
      active: p.active !== undefined ? p.active : true
    }))
    .filter((p) => {
      // Require endpoint and unique name
      if (
        typeof p.endpointTemplate !== 'string' ||
        p.endpointTemplate.length === 0 ||
        !p.name ||
        names.has(p.name)
      ) {
        return false;
      }
      names.add(p.name);
      return true;
    });
}

/**
 * Generate preview text for an API endpoint with given context
 */
export function generatePreview(
  endpoint: ApiEndpoint,
  context: Record<string, unknown>,
  applyTemplate: (template: string, context: Record<string, unknown>) => string
): string {
  const url = applyTemplate(endpoint.endpointTemplate, context);
  const body = endpoint.bodyTemplate
    ? applyTemplate(endpoint.bodyTemplate, context)
    : JSON.stringify(context, null, 2);

  return [
    `Endpoint: ${endpoint.name}`,
    `URL: ${url}`,
    `Method: ${(endpoint.method || 'POST').toUpperCase()}`,
    '',
    `Headers: ${JSON.stringify(endpoint.headers || {}, null, 2)}`,
    '',
    `Body:`,
    body
  ].join('\n');
}

/**
 * Validate and normalize raw JSON string into formatted array
 * Returns validation result with parsed endpoints, formatted JSON, and error message if invalid
 */
export function validateEndpoints(raw: string): {
  valid: boolean;
  parsed: ApiEndpoint[];
  formatted: string;
  errorMessage?: string;
} {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return {
        valid: false,
        parsed: [],
        formatted: '[]',
        errorMessage: 'API endpoints must be a JSON array.'
      };
    }

    const names = new Set<string>();
    const cleaned = parsed
      .map((p: any, index: number) => {
        if (!p || typeof p.endpointTemplate !== 'string' || !p.endpointTemplate.trim()) {
          throw new Error(`Endpoint ${index + 1} is missing an endpointTemplate.`);
        }
        const name = p.name || suggestEndpointName(p.endpointTemplate);
        if (names.has(name)) {
          throw new Error(`Duplicate endpoint name: "${name}" (Endpoint ${index + 1})`);
        }
        names.add(name);
        return {
          name,
          endpointTemplate: p.endpointTemplate,
          method: p.method,
          headers: p.headers,
          bodyTemplate: p.bodyTemplate,
          includeCookies: p.includeCookies,
          includePageHeaders: p.includePageHeaders,
          active: p.active
        };
      })
      .filter(Boolean);

    return {
      valid: true,
      parsed: cleaned,
      formatted: JSON.stringify(cleaned, null, 2)
    };
  } catch (e: any) {
    return {
      valid: false,
      parsed: [],
      formatted: '[]',
      errorMessage: e?.message
    };
  }
}

/**
 * Apply template with placeholder interpolation
 * Supports {{placeholder}}, {{placeholder|url}}, {{placeholder|json}}
 * Case-insensitive placeholder matching
 */
export function applyTemplate(
  template: string,
  context: Record<string, unknown>,
  options: { onMissing?: 'leave' | 'empty' | 'throw' } = { onMissing: 'leave' }
): string {
  const onMissing = options.onMissing ?? 'leave';
  const placeholderRe = /\{\{(\w+)(?:\|(url|json))?\}\}/gi;

  // Case-insensitive matching
  const normalizedContext = Object.fromEntries(
    Object.entries(context).map(([k, v]) => [k.toLowerCase(), v])
  );

  const encodeJsonString = (val: unknown) => JSON.stringify(String(val));
  const applyFilter = (val: unknown, filter?: 'url' | 'json') => {
    if (filter === 'url') return encodeURIComponent(String(val ?? ''));
    if (filter === 'json') return encodeJsonString(val);
    return String(val ?? '');
  };

  return template.replace(placeholderRe, (_m, key: string, filter?: 'url' | 'json') => {
    const value = normalizedContext[key.toLowerCase()];
    const hasValue = value !== undefined && value !== null;
    if (!hasValue) {
      if (onMissing === 'empty') return '';
      if (onMissing === 'throw') throw new Error(`Missing placeholder: ${key}`);
      return `{{${key}${filter ? '|' + filter : ''}}}`;
    }
    return applyFilter(value, filter);
  });
}

/**
 * Build request context with stream metadata
 */
function buildContext({
  streamUrl,
  pageUrl,
  pageTitle
}: {
  streamUrl: string;
  pageUrl?: string;
  pageTitle?: string;
}) {
  return {
    streamUrl,
    pageUrl,
    pageTitle,
    timestamp: Date.now()
  };
}

/**
 * Open endpoint URL in new tab with stream information
 * Handles template interpolation and opens the final URL in a new browser tab
 * Returns success/error result with detailed error messages
 */
/**
 * Call API endpoint or open in tab with stream information
 * Handles template interpolation, headers, cookies, and HTTP methods
 *
 * @param mode - 'fetch' for HTTP request, 'tab' to open URL in browser tab
 * @param apiEndpoints - Optional override for endpoints (used by options page for testing)
 * Returns success/error result with detailed error messages
 */
export async function callEndpoint({
  mode,
  streamUrl,
  pageUrl,
  pageTitle,
  endpointName,
  tabHeaders,
  apiEndpoints,
  logger
}: {
  mode: 'fetch' | 'tab';
  streamUrl: string;
  pageUrl?: string;
  pageTitle?: string;
  endpointName?: string;
  tabHeaders?: Record<string, string>;
  apiEndpoints?: ApiEndpoint[];
  logger: Logger;
}) {
  // Declare variables at function scope for error logging
  let selectedEndpoint: ApiEndpoint | undefined;
  let finalUrl: string | undefined;
  let method: string | undefined;

  try {
    // Use provided endpoints or load from storage
    let endpoints: ApiEndpoint[];
    if (apiEndpoints) {
      endpoints = apiEndpoints;
    } else {
      const defaults = { apiEndpoints: '[]' } as const;
      const config = (await browser.storage.sync.get(defaults)) as typeof defaults;
      try {
        endpoints = parseEndpoints(config.apiEndpoints);
      } catch (parseError: any) {
        return {
          success: false,
          error: `Failed to parse API endpoints: ${parseError?.message ?? 'Unknown error'}`
        };
      }
    }

    selectedEndpoint = endpointName ? endpoints.find((e) => e.name === endpointName) : endpoints[0];

    if (!selectedEndpoint) {
      return {
        success: false,
        error: 'No API endpoints configured. Please add an endpoint in the extension options.'
      };
    }

    const requestContext = buildContext({ streamUrl, pageUrl, pageTitle });

    // Template interpolation
    let bodyJson: string | undefined;
    try {
      finalUrl = applyTemplate(selectedEndpoint.endpointTemplate, requestContext);
      if (mode === 'fetch') {
        bodyJson = selectedEndpoint.bodyTemplate
          ? applyTemplate(selectedEndpoint.bodyTemplate, requestContext)
          : JSON.stringify(requestContext);
      }
    } catch (templateError: any) {
      return {
        success: false,
        error: `Interpolation error in endpoint "${selectedEndpoint.name}": ${templateError?.message ?? 'Invalid placeholder'}. Check endpoint/body templates and placeholders.`
      };
    }

    // Mode: open in tab
    if (mode === 'tab') {
      // Validate URL format
      try {
        new URL(finalUrl);
      } catch {
        return {
          success: false,
          error: `Invalid URL after interpolation: ${finalUrl}`
        };
      }

      logger.info('apicall', `Opening URL in tab: ${selectedEndpoint.name}`, {
        endpoint: selectedEndpoint.name,
        url: finalUrl
      });

      // Reuse existing tab with same URL or create new one
      const existingTabs = await browser.tabs.query({ url: finalUrl });
      if (existingTabs.length > 0 && existingTabs[0].id) {
        await browser.tabs.update(existingTabs[0].id, { active: true });
      } else {
        await browser.tabs.create({ url: finalUrl, active: true });
      }

      return {
        success: true,
        message: 'Opened URL in tab',
        details: finalUrl
      };
    }

    // Mode: fetch (HTTP request)
    method = (selectedEndpoint.method || 'POST').toUpperCase();

    let headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (selectedEndpoint.headers) {
      headers = { ...headers, ...selectedEndpoint.headers };
    }

    // Add cookies to headers if flag is enabled
    if (selectedEndpoint.includeCookies && pageUrl) {
      try {
        const cookies = await browser.cookies.getAll({ url: pageUrl });
        if (cookies.length > 0) {
          const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
          headers['Cookie'] = cookieHeader;
        }
      } catch (cookieError: any) {
        logger.warn('apicall', `Failed to get cookies: ${cookieError}`, { pageUrl, cookieError });
      }
    }

    // Add page headers if flag is enabled
    if (selectedEndpoint.includePageHeaders && tabHeaders) {
      for (const [key, value] of Object.entries(tabHeaders)) {
        if (!(key in headers)) {
          headers[key] = value;
        }
      }
    }

    const fetchOptions: RequestInit = {
      method,
      headers
    };

    if (method !== 'GET' && method !== 'HEAD') {
      fetchOptions.body = bodyJson;
    }

    logger.info('apicall', `API Request: ${method} ${selectedEndpoint.name}`, {
      endpoint: selectedEndpoint.name,
      method,
      url: finalUrl,
      headers,
      body: fetchOptions.body ? fetchOptions.body.substring(0, 200) + (fetchOptions.body.length > 200 ? '...' : '') : '(none - GET/HEAD)'
    });

    const response = await fetch(finalUrl, fetchOptions);

    if (!response.ok) {
      let errorDetail = response.statusText;
      let errorBody = '';
      try {
        errorBody = await response.text();
        if (errorBody && errorBody.length < 500) {
          errorDetail = errorBody;
        }
      } catch {
        // Ignore if we can't read error body
      }
      logger.error('apicall', `API Error Response: ${response.status} ${response.statusText}`, {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: errorBody.substring(0, 500) + (errorBody.length > 500 ? '...' : '')
      });
      throw new Error(`API returned ${response.status}: ${errorDetail}`);
    }

    const result = await response.text();
    logger.info('apicall', `API Success Response: ${response.status} ${response.statusText}`, {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      body: result.substring(0, 500) + (result.length > 500 ? '...' : '')
    });

    return {
      success: true,
      message: 'Stream URL sent successfully',
      response: result
    };
  } catch (error: any) {
    const action = mode === 'tab' ? 'open URL' : 'API call';
    logger.error('apicall', `${action} failed: ${error?.message ?? 'Unknown error'}`, {
      endpoint: selectedEndpoint?.name,
      url: finalUrl,
      method,
      mode,
      error
    });

    let errorMsg = error?.message ?? 'Unknown error';
    if (mode === 'fetch' && (errorMsg.includes('NetworkError') || errorMsg.includes('fetch'))) {
      errorMsg += ` (Check: 1) Server is reachable, 2) CORS/host permissions, 3) HTTP vs HTTPS)`;
    }

    return {
      success: false,
      error: errorMsg
    };
  }
}

export {};
