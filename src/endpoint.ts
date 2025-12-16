/**
 * Configuration and templating utilities for stream-call
 * Centralized endpoint parsing, validation, normalization, and template interpolation
 */

export type ApiEndpoint = {
  name: string;
  endpointTemplate: string;
  method?: string;
  headers?: Record<string, string>;
  bodyTemplate?: string;
  includeCookies?: boolean;
  includePageHeaders?: boolean;
};

/**
 * Default configuration with demo endpoints
 * Single source of truth for default endpoints
 */
export const DEFAULT_CONFIG = {
  apiEndpoints: JSON.stringify(
    [
      {
        name: 'httpbingo GET (open in tab)',
        endpointTemplate: 'https://httpbingo.org/anything?url={{streamUrl}}&page={{pageUrl}}&title={{pageTitle|url}}&time={{timestamp}}'
      },
      {
        name: 'httpbingo POST (fetch API)',
        endpointTemplate: 'https://httpbingo.org/anything',
        method: 'POST',
        bodyTemplate: '{"streamUrl":"{{streamUrl}}","pageUrl":"{{pageUrl}}","pageTitle":"{{pageTitle}}","timestamp":{{timestamp}}}'
      }
    ],
    null,
    2
  )
} as const;

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
      includePageHeaders: p.includePageHeaders
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
          includePageHeaders: p.includePageHeaders
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
export async function openEndpointInTab({
  streamUrl,
  pageUrl,
  pageTitle,
  endpointName,
  tabHeaders
}: {
  streamUrl: string;
  pageUrl?: string;
  pageTitle?: string;
  endpointName?: string;
  tabHeaders?: Record<string, string>;
}) {
  // Declare variables at function scope for error logging
  let selectedEndpoint: ReturnType<typeof parseEndpoints>[0] | undefined;
  let finalUrl: string | undefined;

  try {
    const defaults = { apiEndpoints: '[]' } as const;
    const config = (await browser.storage.sync.get(defaults)) as typeof defaults;

    let endpoints: ReturnType<typeof parseEndpoints>;
    try {
      endpoints = parseEndpoints(config.apiEndpoints);
    } catch (parseError: any) {
      return {
        success: false,
        error: `Failed to parse API endpoints: ${parseError?.message ?? 'Unknown error'}`
      };
    }

    selectedEndpoint = endpointName ? endpoints.find((e) => e.name === endpointName) : endpoints[0];

    if (!selectedEndpoint) {
      return {
        success: false,
        error: 'No API endpoints configured. Please add an endpoint in the extension options.'
      };
    }

    const requestContext = buildContext({ streamUrl, pageUrl, pageTitle });

    // Template interpolation for URL
    try {
      finalUrl = applyTemplate(selectedEndpoint.endpointTemplate, requestContext);
    } catch (templateError: any) {
      return {
        success: false,
        error: `Interpolation error in endpoint "${selectedEndpoint.name}": ${templateError?.message ?? 'Invalid placeholder'}. Check endpoint template and placeholders.`
      };
    }

    // Validate URL format
    try {
      new URL(finalUrl);
    } catch {
      return {
        success: false,
        error: `Invalid URL after interpolation: ${finalUrl}`
      };
    }

    console.log('[stream-call] Opening URL in tab:', {
      endpoint: selectedEndpoint.name,
      url: finalUrl
    });

    // Open in new tab (switch to it)
    await browser.tabs.create({ url: finalUrl, active: true });

    return {
      success: true,
      message: 'Opened URL in new tab',
      details: finalUrl
    };
  } catch (error: any) {
    console.error('Failed to open URL:', error);
    if (selectedEndpoint) console.error('Endpoint:', selectedEndpoint.name);
    if (finalUrl) console.error('URL:', finalUrl);

    return {
      success: false,
      error: error?.message ?? 'Unknown error'
    };
  }
}

/**
 * Call API endpoint with stream information using fetch
 * Handles template interpolation, headers, cookies, and HTTP methods (GET/POST/etc)
 * Returns success/error result with detailed error messages
 */
export async function callEndpointAPI({
  streamUrl,
  pageUrl,
  pageTitle,
  endpointName,
  tabHeaders
}: {
  streamUrl: string;
  pageUrl?: string;
  pageTitle?: string;
  endpointName?: string;
  tabHeaders?: Record<string, string>;
}) {
  let selectedEndpoint: ReturnType<typeof parseEndpoints>[0] | undefined;
  let endpoint: string | undefined;
  let method: string | undefined;

  try {
    const defaults = { apiEndpoints: '[]' } as const;
    const config = (await browser.storage.sync.get(defaults)) as typeof defaults;

    let endpoints: ReturnType<typeof parseEndpoints>;
    try {
      endpoints = parseEndpoints(config.apiEndpoints);
    } catch (parseError: any) {
      return {
        success: false,
        error: `Failed to parse API endpoints: ${parseError?.message ?? 'Unknown error'}`
      };
    }

    selectedEndpoint = endpointName ? endpoints.find((e) => e.name === endpointName) : endpoints[0];

    if (!selectedEndpoint) {
      return {
        success: false,
        error: 'No API endpoints configured. Please add an endpoint in the extension options.'
      };
    }

    const requestContext = buildContext({ streamUrl, pageUrl, pageTitle });

    // Separate template error handling for actionable error messages
    let bodyJson: string;
    try {
      endpoint = applyTemplate(selectedEndpoint.endpointTemplate, requestContext);
      bodyJson = selectedEndpoint.bodyTemplate
        ? applyTemplate(selectedEndpoint.bodyTemplate, requestContext)
        : JSON.stringify(requestContext);
    } catch (templateError: any) {
      return {
        success: false,
        error: `Interpolation error in endpoint "${selectedEndpoint.name}": ${templateError?.message ?? 'Invalid placeholder'}. Check endpoint/body templates and placeholders.`
      };
    }

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
        console.warn('Failed to get cookies:', cookieError);
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

    console.log('[stream-call] API Request:', {
      endpoint: selectedEndpoint.name,
      method,
      url: endpoint,
      headers,
      body: fetchOptions.body ? fetchOptions.body.substring(0, 200) + (fetchOptions.body.length > 200 ? '...' : '') : '(none - GET/HEAD)'
    });

    const response = await fetch(endpoint, fetchOptions);

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
      console.log('[stream-call] API Error Response:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: errorBody.substring(0, 500) + (errorBody.length > 500 ? '...' : '')
      });
      throw new Error(`API returned ${response.status}: ${errorDetail}`);
    }

    const result = await response.text();
    console.log('[stream-call] API Success Response:', {
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
    console.error('API call failed:', error);
    if (selectedEndpoint) console.error('Endpoint:', selectedEndpoint.name);
    if (endpoint) console.error('URL:', endpoint);
    if (method) console.error('Method:', method);

    let errorMsg = error?.message ?? 'Unknown error';
    if (errorMsg.includes('NetworkError') || errorMsg.includes('fetch')) {
      errorMsg += ` (Check: 1) Server is reachable, 2) CORS/host permissions, 3) HTTP vs HTTPS)`;
    }

    return {
      success: false,
      error: errorMsg
    };
  }
}

export {};
