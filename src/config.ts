/**
 * Configuration utilities for stream-call
 * Centralized pattern parsing, validation, and normalization
 */

export type ApiPattern = {
  name: string;
  endpointTemplate: string;
  method?: string;
  headers?: Record<string, string>;
  bodyTemplate?: string;
  includePageInfo?: boolean;
};

/**
 * Suggest a pattern name from an endpoint URL (extract hostname)
 * Example: https://api.example.com/stream → api.example.com
 */
export function suggestPatternName(endpointUrl: string): string {
  try {
    const url = new URL(endpointUrl);
    return url.hostname || 'API Pattern';
  } catch {
    // Fallback if URL is invalid
    return endpointUrl.substring(0, 30).replace(/[^a-z0-9.-]/gi, '');
  }
}

/**
 * Parse raw JSON string into validated ApiPattern array
 * Requires name field; enforces uniqueness by name
 */
export function parsePatterns(raw: string): ApiPattern[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const names = new Set<string>();
    return parsed
      .map((p) => ({
        name: p.name || suggestPatternName(p.endpointTemplate),
        endpointTemplate: p.endpointTemplate,
        method: p.method,
        headers: p.headers,
        bodyTemplate: p.bodyTemplate,
        includePageInfo: p.includePageInfo
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
  } catch (e) {
    console.warn('Invalid apiPatterns JSON', e);
    return [];
  }
}

/**
 * Validate and normalize raw JSON string into formatted array
 * Returns validation result with parsed patterns, formatted JSON, and error message if invalid
 */
export function validatePatterns(raw: string): {
  valid: boolean;
  parsed: ApiPattern[];
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
        errorMessage: 'API patterns must be a JSON array.'
      };
    }

    const names = new Set<string>();
    const cleaned = parsed
      .map((p: any, index: number) => {
        if (!p || typeof p.endpointTemplate !== 'string' || !p.endpointTemplate.trim()) {
          throw new Error(`Pattern ${index + 1} is missing an endpointTemplate.`);
        }
        const name = p.name || suggestPatternName(p.endpointTemplate);
        if (names.has(name)) {
          throw new Error(`Duplicate pattern name: "${name}" (Pattern ${index + 1})`);
        }
        names.add(name);
        return {
          name,
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
    return {
      valid: false,
      parsed: [],
      formatted: '[]',
      errorMessage: e?.message
    };
  }
}

export {};
