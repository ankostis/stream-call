/**
 * Stream call Content Script
 * Detects streaming media on web pages
 */

(function() {
  'use strict';

  const detectedStreams = new Set();

  // Common streaming patterns to detect
  const STREAM_PATTERNS = [
    // Direct stream URLs
    /\.(m3u8|m3u|pls|asx|ram|mp3|aac|ogg|opus|flac|wav|m4a|wma)(\?.*)?$/i,
    // HLS/DASH streams
    /\/manifest\.(m3u8|mpd)/i,
    // Radio stream protocols
    /^(https?|rtmp|rtsp|mms):\/\/.*(stream|radio|live|cast|audio|podcast)/i,
    // Icecast/Shoutcast
    /\/(listen|stream|;\?|dyn\/)/i,
  ];

  /**
   * Check if a URL is likely a stream
   */
  function isStreamUrl(url) {
    if (!url || typeof url !== 'string') return false;

    try {
      const urlObj = new URL(url, window.location.href);
      const fullUrl = urlObj.href;

      // Check against patterns
      return STREAM_PATTERNS.some(pattern => pattern.test(fullUrl));
    } catch (e) {
      return false;
    }
  }

  /**
   * Determine stream type from URL
   */
  function getStreamType(url) {
    const urlLower = url.toLowerCase();

    if (urlLower.includes('.m3u8') || urlLower.includes('manifest')) {
      return 'HLS';
    }
    if (urlLower.includes('.mpd')) {
      return 'DASH';
    }
    if (urlLower.match(/\.(mp3|aac|ogg)(\?|$)/)) {
      return 'HTTP Audio';
    }
    if (urlLower.includes('rtmp')) {
      return 'RTMP';
    }
    if (urlLower.includes('rtsp')) {
      return 'RTSP';
    }
    if (urlLower.includes('icecast') || urlLower.includes('shoutcast')) {
      return 'Icecast/Shoutcast';
    }

    return 'Stream';
  }

  /**
   * Report detected stream to background script
   */
  function reportStream(url) {
    if (detectedStreams.has(url)) return;

    detectedStreams.add(url);
    console.log('[Stream call] Detected stream:', url);

    browser.runtime.sendMessage({
      type: 'STREAM_DETECTED',
      url: url,
      streamType: getStreamType(url)
    }).catch(err => {
      console.error('[Stream call] Failed to report stream:', err);
    });
  }

  /**
   * Monitor media elements (audio/video)
   */
  function monitorMediaElements() {
    const mediaElements = document.querySelectorAll('audio, video');

    mediaElements.forEach(element => {
      // Check src attribute
      if (element.src && isStreamUrl(element.src)) {
        reportStream(element.src);
      }

      // Check source children
      const sources = element.querySelectorAll('source');
      sources.forEach(source => {
        if (source.src && isStreamUrl(source.src)) {
          reportStream(source.src);
        }
      });

      // Monitor for dynamic src changes
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
    // Override fetch
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
      const url = args[0];
      if (typeof url === 'string' && isStreamUrl(url)) {
        reportStream(url);
      }
      return originalFetch.apply(this, args);
    };

    // Override XMLHttpRequest
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      if (typeof url === 'string' && isStreamUrl(url)) {
        reportStream(url);
      }
      return originalOpen.call(this, method, url, ...rest);
    };
  }

  /**
   * Monitor DOM for new media elements
   */
  function monitorDOMChanges() {
    const observer = new MutationObserver(() => {
      monitorMediaElements();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  /**
   * Check common streaming player frameworks
   */
  function checkStreamingFrameworks() {
    // Check for HLS.js
    if (window.Hls) {
      console.log('[Stream call] HLS.js detected');
    }

    // Check for Video.js
    if (window.videojs) {
      console.log('[Stream call] Video.js detected');
    }

    // Check for JW Player
    if (window.jwplayer) {
      console.log('[Stream call] JW Player detected');
    }

    // Check for Shaka Player
    if (window.shaka) {
      console.log('[Stream call] Shaka Player detected');
    }
  }

  /**
   * Initialize stream detection
   */
  function initialize() {
    console.log('[Stream call] Content script initialized');

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        startDetection();
      });
    } else {
      startDetection();
    }
  }

  function startDetection() {
    checkStreamingFrameworks();
    interceptNetworkRequests();
    monitorMediaElements();
    monitorDOMChanges();

    // Re-scan periodically for dynamically loaded content
    setInterval(monitorMediaElements, 2000);
  }

  // Start
  initialize();

})();
