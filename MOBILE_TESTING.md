# Testing Stream call on Mobile Firefox

## Quick Start

1. **Package ready**: `stream-call-mobile.zip` (48KB) in project root
2. **Transfer to mobile**: USB, cloud, or local server (see below)
3. **Install in Firefox Nightly**: Method A (remote debug) or B (direct install)
4. **Test both UIs**: Browser action (🎵 icon) vs Hover panel (🎵 button on page)

## Prerequisites

**Firefox Nightly for Android** (required for unsigned extensions):
- Download from Google Play Store or APK from mozilla.org
- Regular Firefox for Android doesn't support temporary extensions

## Installation Steps

### 1. Package the Extension

```bash
cd /path/to/stream-call
npm run build
zip -r stream-call-mobile.zip manifest.json dist icons -x "icons/generate-icons.html"
```

This creates `stream-call-mobile.zip` (48KB) in the project root.

### 2. Transfer to Mobile Device

#### Option A: Direct USB transfer
```bash
# Connect phone via USB, enable File Transfer mode
adb push stream-call-mobile.zip /sdcard/Download/
```

#### Option B: Cloud storage
- Upload `stream-call-mobile.zip` to Google Drive / Dropbox / Telegram / etc
- Download on mobile device

#### Option C: Local web server
```bash
# Start server (serves on port 9090)
npx serve -l 9090

# On mobile Firefox, navigate to:
http://<your-desktop-ip>:9090/stream-call-mobile.zip
```

### 3. Enable Firefox Debugging

1. Open Firefox Nightly
2. Settings → About Firefox Nightly → Tap logo 5× (enables debug menu)

> 💡 Note: you'd have to redo this step every time the browser restarts.


### 4. Install Extension (Temporary)

#### Method A: Direct Install
1. On mobile Firefox Nightly, navigate to `about:config` and set `xpinstall.signatures.required` → false
2. From Firefox settings select "Install extension from file" (needs "Firefox Debugging", see above).
3. Navigate to the .zip file location and tap to install
#### Method B: Via about:debugging (Mobile)
1. On mobile Firefox Nightly, navigate to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select `stream-call-mobile.zip` from Downloads
4. Grant permissions


## Testing the Hover Panel

### On Mobile:
1. Navigate to a page with streaming media (e.g., test-page.html hosted locally)
2. Look for floating 🎵 button in bottom-right corner
3. Tap button → panel slides in from right edge
4. Compare UX with browser action popup:
   - Browser action: Tap menu → Extensions → Stream call
   - Hover panel: Tap floating button

### What to Test:

**Hover Panel (new):**
- [ ] Floating button visible and accessible
- [ ] Panel slides in/out smoothly
- [ ] Panel width responsive (90vw max on narrow screens)
- [ ] Close button (×) works
- [ ] Stream list scrollable
- [ ] Action buttons accessible
- [ ] Statusbar doesn't overlap content

**Browser Action (original):**
- [ ] Opens in popup context
- [ ] Fixed 400×600 size
- [ ] May be constrained by browser UI

**Expected Differences:**
- Hover panel: Full screen height, slides over content
- Browser action: Small popup, separate context

## Troubleshooting

**Extension doesn't appear:**
- Check USB debugging is enabled on mobile device
- Verify remote debugging via USB is enabled in Firefox Nightly settings
- Try Method B (direct install on phone)

**Floating button not visible:**
- Check console: `about:debugging#/runtime/this-firefox` on mobile
- Verify `content.js` loaded successfully
- Try refreshing the page

**Panel doesn't slide in:**
- Check for JavaScript errors in content script console
- Verify `hover-panel.html` is in web_accessible_resources

**Permission errors:**
- Ensure manifest.json has all required permissions
- Check host_permissions includes `<all_urls>`

## Uninstalling

Temporary extensions auto-remove on browser restart. To remove manually:
1. Firefox menu → Add-ons
2. Find "Stream call"
3. Remove

## Testing Checklist

Compare both UIs on mobile and report:

- [ ] **Hover panel** feels more natural on mobile?
- [ ] **Browser action** popup works better?
- [ ] Which is easier to access during video playback?
- [ ] Panel sliding animation smooth (300ms)?
- [ ] Statusbar positioning correct in both?
- [ ] Log viewer usable in both contexts?

## Next Steps After Testing

**If hover panel wins:**
1. Merge popup.ts + page.ts → `page-actions.ts` (single file)
2. Remove browser_action popup
3. Move endpoint CRUD to new browser_action (settings icon)
4. Update manifest: remove popup, keep browser_action for settings only
5. Simplify: no cross-context messaging for UI

**If browser action wins:**
- Keep current architecture
- Remove hover-panel code
- Focus on improving popup mobile responsiveness

**Hybrid approach:**
- Detect platform: desktop = popup, mobile = hover panel
- Keep both implementations

## Notes

- **Signed extensions** (for release) require Mozilla AMO approval
- **Temporary extensions** (for dev) work only in Nightly/Developer Edition
- **about:debugging** on mobile shows extension status and console logs
- Navigate to `about:debugging#/runtime/this-firefox` on mobile to inspect

## References

- [WebExtensions on Android](https://extensionworkshop.com/documentation/develop/developing-extensions-for-firefox-for-android/)
- [Remote Debugging](https://firefox-source-docs.mozilla.org/devtools-user/about_colon_debugging/index.html)
- [ADB Setup](https://developer.android.com/tools/adb)
