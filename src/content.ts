import { isStreamUrl as isStreamUrlShared, getStreamType as getStreamTypeShared } from './detect';
/**
 * stream-call Content Script
 * Detects streaming media on web pages
 */
// Module content script (no exports needed)

(() => {
  'use strict';

  const detectedStreams = new Set<string>();

  // Common streaming patterns to detect
  const STREAM_PATTERNS: RegExp[] = [
    // Direct stream URLs
    // HLS/DASH streams
    // Radio stream protocols
    // Icecast/Shoutcast
  ];
    // Detection patterns centralized in detect.ts

  const getUrlString = (input: RequestInfo | URL): string | null => {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.href;
    if (input instanceof Request) return input.url;
    return null;
  };

  /**
   * Check if a URL is likely a stream
   */
  function isStreamUrl(url: string | null | undefined): boolean {
    if (!url || typeof url !== 'string') return false;

      return isStreamUrlShared(url ?? null, window.location.href);
  }

  /**
   * Determine stream type from URL
   */
  function getStreamType(url: string): string {
    const urlLower = url.toLowerCase();

      return getStreamTypeShared(url);
  }

  /**
   * Report detected stream to background script
   */
  function reportStream(url: string) {
    if (detectedStreams.has(url)) return;

    detectedStreams.add(url);
    console.log('stream-call: Detected stream:', url);

    browser.runtime
      .sendMessage({
        type: 'STREAM_DETECTED',
        url,
        streamType: getStreamType(url)
      })
      .then(() => {
        // Relay detection status to a test ping if needed
        if ((window as any).testIntegrationPingHandler) {
          (window as any).testIntegrationPingHandler({ detected: true });
        }
      })
      .catch((err) => {
        console.error('stream-call: Failed to report stream:', err);
      });
  }

  /**
   * Monitor media elements (audio/video)
   */
  function monitorMediaElements() {
    const mediaElements = document.querySelectorAll<HTMLMediaElement>('audio, video');

    mediaElements.forEach((element) => {
      if (element.src && isStreamUrl(element.src)) {
        reportStream(element.src);
      }

      const sources = element.querySelectorAll('source');
      sources.forEach((source) => {
        if (source.src && isStreamUrl(source.src)) {
          reportStream(source.src);
        }
      });

      if (!element.dataset.streamCallMonitored) {
        element.dataset.streamCallMonitored = 'true';

        const observer = new MutationObserver(() => {
          if (element.src && isStreamUrl(element.src)) {
            reportStream(element.src);
          }
        });

        observer.observe(element, {
          attributes: true,
          attributeFilter: ['src']
        });
      }
    });
  }

  /**
   * Intercept network requests
   */
  function interceptNetworkRequests() {
    const originalFetch = window.fetch.bind(window);
    window.fetch = (...args: Parameters<typeof window.fetch>) => {
      const urlString = getUrlString(args[0]);
      if (isStreamUrl(urlString)) {
        reportStream(urlString as string);
      }
      return originalFetch(...args);
    };

    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method: string, url?: string | URL, ...rest: any[]) {
      const urlString = typeof url === 'string' ? url : url?.toString();
      if (isStreamUrl(urlString)) {
        reportStream(urlString as string);
      }
      return originalOpen.call(this, method, url as any, ...rest);
    };
  }

  /**
   * Monitor DOM for new media elements
   */
  function monitorDOMChanges() {
    const observer = new MutationObserver(() => {
      monitorMediaElements();
    });

    if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
  }

  /**
   * Check common streaming player frameworks
   */
  function checkStreamingFrameworks() {
    const anyWindow = window as any;

    if (anyWindow.Hls) {
      console.log('stream-call: HLS.js detected');
    }

    if (anyWindow.videojs) {
      console.log('stream-call: Video.js detected');
    }

    if (anyWindow.jwplayer) {
      console.log('stream-call: JW Player detected');
    }

    if (anyWindow.shaka) {
      console.log('stream-call: Shaka Player detected');
    }
  }

  function startDetection() {
    checkStreamingFrameworks();
    interceptNetworkRequests();
    monitorMediaElements();
    monitorDOMChanges();

    setInterval(monitorMediaElements, 2000);
  }

  function initialize() {
    console.log('stream-call: Content script initialized at', window.location.href);

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        startDetection();
      });
    } else {
      startDetection();
    }
  }

  initialize();
})();
