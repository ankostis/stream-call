/**
 * Hover Panel Script (WIP)
 * In-page overlay version of popup for mobile UX testing
 * Loaded in iframe by page.ts, communicates with parent to close
 */
export {};

// This is a minimal stub for now - will be populated with popup.ts logic
console.log('[stream-call] Hover panel loaded (WIP)');

// Close button handler - sends message to parent page to close the iframe
document.getElementById('panel-close')?.addEventListener('click', () => {
  // Since we're in an iframe, send message to parent (page.ts) to close
  window.parent.postMessage({ type: 'CLOSE_HOVER_PANEL' }, '*');
});

// Show a dummy message for testing
const loading = document.getElementById('loading');
if (loading) {
  loading.innerHTML = '<p>✅ Hover panel working!</p><p style="font-size:12px;margin-top:8px;">This is a WIP clone for mobile UX testing.</p>';
}
