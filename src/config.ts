/**
 * Configuration utilities for stream-call
 * Centralized pattern parsing, validation, and normalization
 */

export type ApiPattern = {
  id: string;
  name: string;
  endpointTemplate: string;
  method?: string;
  headers?: Record<string, string>;
  bodyTemplate?: string;
  includePageInfo?: boolean;
};

/**
 * Parse raw JSON string into validated ApiPattern array
 * Normalizes missing fields and generates IDs if needed
 */
export function parsePatterns(raw: string): ApiPattern[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((p) => ({
        id: p.id || crypto.randomUUID(),
        name: p.name || 'Pattern',
        endpointTemplate: p.endpointTemplate,
        method: p.method,
        headers: p.headers,
        bodyTemplate: p.bodyTemplate,
        includePageInfo: p.includePageInfo
      }))
      .filter((p) => typeof p.endpointTemplate === 'string' && p.endpointTemplate.length > 0);
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
    return {
      valid: false,
      parsed: [],
      formatted: '[]',
      errorMessage: e?.message
    };
  }
}

export {};
