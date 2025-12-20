/**
 * Shared type definitions for stream-call
 * Single source of truth for domain types used across multiple modules
 */

/**
 * Stream information detected on pages
 * Used by: broker.ts (storage), popup.ts (UI), hover-panel.ts (UI), tests
 * Note: timestamp is optional in UI contexts, but broker always sets it
 */
export type StreamInfo = {
  url: string;
  type: string;
  pageUrl?: string;
  pageTitle?: string;
  timestamp?: number;
};

/**
 * Runtime message types for cross-component communication
 * Used by: broker.ts (handlers), hover-panel.ts (sender), tests
 */
export type RuntimeMessage =
  | { type: 'STREAM_DETECTED'; url: string; streamType: string }
  | { type: 'GET_STREAMS'; tabId: number }
  | { type: 'CALL_API'; streamUrl: string; pageUrl?: string; pageTitle?: string; endpointName?: string }
  | { type: 'OPEN_IN_TAB'; streamUrl: string; pageUrl?: string; pageTitle?: string; endpointName?: string }
  | { type: 'PING' };
