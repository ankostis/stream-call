/**
 * Pure helpers for stream URL detection and typing, extracted for testing.
 */
export const STREAM_PATTERNS: RegExp[] = [
  /\.(m3u8|m3u|pls|asx|ram|mp3|aac|ogg|opus|flac|wav|m4a|wma)(\?.*)?$/i,
  /\/manifest\.(m3u8|mpd)/i,
  /^(https?|rtmp|rtsp|mms):\/\/.*(stream|radio|live|cast|audio|podcast)/i,
  /\/(listen|stream|;\?|dyn\/)\/?.*/i
];

export function isStreamUrl(url: string | null | undefined, base?: string): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    const urlObj = new URL(url, base ?? 'http://localhost');
    const fullUrl = urlObj.href;
    return STREAM_PATTERNS.some((pattern) => pattern.test(fullUrl));
  } catch (e) {
    return false;
  }
}

export function getStreamType(url: string): string {
  const urlLower = url.toLowerCase();
  // NOTE: Detect DASH first to avoid matching 'manifest' in '.mpd' URLs as HLS.
  if (urlLower.includes('.mpd')) return 'DASH';
  if (urlLower.includes('.m3u8') || urlLower.includes('manifest')) return 'HLS';
  if (urlLower.match(/\.(mp3|aac|ogg)(\?|$)/)) return 'HTTP Audio';
  if (urlLower.includes('rtmp')) return 'RTMP';
  if (urlLower.includes('rtsp')) return 'RTSP';
  if (urlLower.includes('icecast') || urlLower.includes('shoutcast')) return 'Icecast/Shoutcast';
  return 'Stream';
}
