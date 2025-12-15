# Testing Stream call on Mobile Firefox

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

This creates `stream-call-mobile.zip` (~100KB) in the project root.

### 2. Transfer to Mobile Device

**Option A: Direct USB transfer**
```bash
# Connect phone via USB, enable File Transfer mode
adb push stream-call-mobile.zip /sdcard/Download/
```

**Option B: Cloud storage**
- Upload `stream-call-mobile.zip` to Google Drive / Dropbox / etc
- Download on mobile device

**Option C: Local web server**
```bash
# On desktop (in project directory)
python3 -m http.server 8080

# On mobile Firefox, navigate to:
http://<your-desktop-ip>:8080/stream-call-mobile.zip
```

### 3. Enable Remote Debugging

**On mobile device:**
1. Open Firefox Nightly
2. Settings → About Firefox Nightly → Tap logo 5× (enables debug menu)
3. Settings → Advanced → Remote debugging via USB → Enable

**On desktop:**
1. Open Firefox
2. Navigate to `about:debugging#/setup`
3. Enable "USB Devices"
4. Connect phone via USB
5. Click your device name in sidebar
6. Accept debug connection prompt on phone

### 4. Install Extension (Temporary)

**Method A: Via about:debugging (Desktop)**
1. In Firefox desktop `about:debugging` → Your Device
2. Click "Load Temporary Add-on"
3. Navigate to the .zip file on your phone's storage
4. Extension installs on mobile Firefox

**Method B: Via about:debugging (Mobile)**
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
- Check USB debugging is enabled on both devices
- Verify phone is in File Transfer mode
- Try Method B (direct install on phone)

**Floating button not visible:**
- Check console: `about:debugging` → mobile device → Inspect content script
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

## Desktop Testing (Faster Iteration)

Before packaging for mobile, test on desktop:
```bash
npm run build
npx web-ext run
```

- Resize browser window to 400px width to simulate mobile
- Use Firefox Responsive Design Mode (Ctrl+Shift+M)
- Test hover panel interactions

## Next Steps

After mobile testing confirms hover panel UX is superior:
1. Merge popup.ts logic into content.ts (single context)
2. Remove browser_action popup
3. Move endpoint CRUD to new browser_action (settings)
4. Update manifest: remove popup, keep browser_action for settings
5. Simplify architecture (no cross-context messaging for UI)

## Notes

- **Signed extensions** (for release) require Mozilla AMO approval
- **Temporary extensions** (for dev) work only in Nightly/Developer Edition
- **about:debugging** is your friend for remote inspection
- **console.log** messages appear in desktop Firefox when debugging mobile

## References

- [WebExtensions on Android](https://extensionworkshop.com/documentation/develop/developing-extensions-for-firefox-for-android/)
- [Remote Debugging](https://firefox-source-docs.mozilla.org/devtools-user/about_colon_debugging/index.html)
- [ADB Setup](https://developer.android.com/tools/adb)
