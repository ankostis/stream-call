/**
 * Hover Panel Script (WIP)
 * In-page overlay version of popup for mobile UX testing
 * Injected by content.ts, uses same logic as popup.ts
 */
export {};

// This is a minimal stub for now - will be populated with popup.ts logic
console.log('[stream-call] Hover panel loaded (WIP)');

// Close button handler
document.getElementById('panel-close')?.addEventListener('click', () => {
  const panel = document.getElementById('stream-call-hover-panel');
  if (panel) {
    panel.classList.remove('visible');
  }
});

// Show a dummy message for testing
const loading = document.getElementById('loading');
if (loading) {
  loading.innerHTML = '<p>✅ Hover panel working!</p><p style="font-size:12px;margin-top:8px;">This is a WIP clone for mobile UX testing.</p>';
}
