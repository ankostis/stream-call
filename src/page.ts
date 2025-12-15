/**
 * stream-call Content Script (page-context)
 * Detects streaming media on web pages
 */
import { isStreamUrl as isStreamUrlShared, getStreamType as getStreamTypeShared } from './detect';
import { debounce } from './debounce';
import { Logger, LogLevel } from './logger';
// Module content script (no exports needed)

(() => {
  'use strict';

  const logger = new Logger();
  const detectedStreams = new Set<string>();

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
    logger.info(LogLevel.Info, 'page', 'Detected stream:', url);

    // Inject hover panel on first stream detection
    if (detectedStreams.size === 1) {
      injectHoverPanel();
    }

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
        // Message send can fail during page navigation/unload - this is expected
        logger.warn(LogLevel.Warn, 'page', `Failed to report stream '${url}' to background worker`, err);
        // In a future enhancement, could track failure count and surface via a UI overlay.
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
    const debouncedMonitor = debounce(() => {
      monitorMediaElements();
    }, 500);

    const observer = new MutationObserver(() => {
      debouncedMonitor();
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

    const frameworks = [
      { name: 'HLS.js', key: 'Hls' },
      { name: 'Video.js', key: 'videojs' },
      { name: 'JW Player', key: 'jwplayer' },
      { name: 'Shaka Player', key: 'shaka' }
    ];

    const detected = frameworks.filter(fw => anyWindow[fw.key]).map(fw => fw.name);
    if (detected.length > 0) {
      logger.debug(LogLevel.Debug, 'page', `Frameworks detected: ${detected.join(', ')}`);
    }
  }

  function startDetection() {
    checkStreamingFrameworks();
    interceptNetworkRequests();
    monitorMediaElements();
    monitorDOMChanges();

    // Debounce periodic media element scan (2s interval, 1s delay)
    const debouncedMediaScan = debounce(() => {
      monitorMediaElements();
    }, 1000);

    setInterval(() => {
      debouncedMediaScan();
    }, 2000);
  }

  /**
   * Inject hover panel (WIP for mobile testing) - only called after streams detected
   */
  function injectHoverPanel() {
    // Only inject once
    if (document.getElementById('stream-call-toggle-btn')) return;

    const iframe = document.createElement('iframe');
    iframe.id = 'stream-call-hover-frame';
    iframe.src = browser.runtime.getURL('dist/hover-panel.html');
    iframe.style.cssText = `
      position: fixed;
      top: 0;
      right: 0;
      width: 400px;
      max-width: 90vw;
      height: 100vh;
      border: none;
      z-index: 999999;
      transform: translateX(100%);
      transition: transform 0.3s ease-in-out;
      box-shadow: -4px 0 12px rgba(0,0,0,0.3);
    `;

    document.body.appendChild(iframe);
    logger.debug(LogLevel.Debug, 'page', 'Hover panel iframe injected');

    // Listen for close message from iframe
    window.addEventListener('message', (event) => {
      if (event.data.type === 'CLOSE_HOVER_PANEL') {
        iframe.style.transform = 'translateX(100%)';
      }
    });

    // Add toggle button
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'stream-call-toggle-btn';
    toggleBtn.innerHTML = '🎵';
    toggleBtn.title = 'Toggle Stream call panel (WIP)';
    toggleBtn.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      font-size: 24px;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
      z-index: 999998;
      transition: all 0.2s;
    `;

    toggleBtn.addEventListener('click', () => {
      const isVisible = iframe.style.transform === 'translateX(0px)';
      iframe.style.transform = isVisible ? 'translateX(100%)' : 'translateX(0px)';
    });

    toggleBtn.addEventListener('mouseenter', () => {
      toggleBtn.style.transform = 'scale(1.1)';
      toggleBtn.style.boxShadow = '0 6px 16px rgba(102, 126, 234, 0.5)';
    });

    toggleBtn.addEventListener('mouseleave', () => {
      toggleBtn.style.transform = 'scale(1)';
      toggleBtn.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
    });

    document.body.appendChild(toggleBtn);
    logger.debug(LogLevel.Debug, 'page', 'Toggle button added');
  }

  function initialize() {
    logger.info(LogLevel.Info, 'page', 'Page script initialized at', window.location.href);

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        startDetection();
        // Hover panel will be injected automatically when first stream is detected
      });
    } else {
      startDetection();
      // Hover panel will be injected automatically when first stream is detected
    }
  }

  initialize();
})();
