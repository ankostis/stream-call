# Integration Testing (Firefox)

This setup uses `web-ext` to run the extension in Firefox with various test scenarios.

## Prerequisites
- Firefox installed
- Node.js (>= 18)
- Run `npm install` (includes puppeteer, chai, web-ext)
- Build extension: `npm run build`

## Test Suites

### 1. Local Test Page (`run.js`)
```bash
npm run test:integration
```
Launches Firefox with local `tests/test-page.html` (static HTML with test streams).

**Validates:**
- ✅ Extension loads without errors
- ✅ Stream detection from static HTML elements
- ✅ No storage API errors (requires explicit addon ID)

### 2. Real Stream Page (`real-stream.js`)
```bash
npm run test:integration:real
```
Launches Firefox with actual stream page: https://www.ertecho.gr/radio/trito/

**Validates:**
- ✅ Extension loads without errors
- ✅ Stream detection from real webpage (HLS/DASH)
- ✅ Unique stream URLs captured
- ⚠️ API calls (requires manual popup interaction)
- ℹ️ Cookie/header capture (info only, requires endpoint config)

**Expected streams:**
- Greek radio station (ERT Third Programme)
- Typically HLS (.m3u8) streams
- May detect multiple quality variants

### 3. Full Workflow with httpbin (`httpbin-full.js`)
```bash
npm run test:integration:httpbin
```
**Status:** 🚧 Experimental (requires Firefox CDP)

Uses Puppeteer to control Firefox and validate full API workflow.

**Prerequisites:**
- Firefox with CDP: `firefox --remote-debugging-port=9222`
- Or web-ext with custom Firefox binary

**Validates:**
- Stream detection on real page
- Endpoint configuration
- API calls to httpbin.org
- Cookie header capture
- Request header capture
- Full request/response validation

**Note:** Currently skipped in CI (requires manual CDP setup).

### 4. Options CRUD Test (`options-crud.js`)
```bash
npm run build
npm run test:integration:options
```
This uses Puppeteer to load options.html via file:// with mocked browser.storage API and test basic endpoint CRUD operations.

**Current Status:**
✅ **Working Tests (5 passing):**
- Initial state (endpoint count)
- Create endpoint (DOM manipulation)
- Verify endpoint in list
- Log filtering UI (show/hide by level)

⚠️ **Limitations (file:// context):**
- options.ts script doesn't fully initialize due to missing WebExtension APIs
- Manual DOM manipulation used instead of actual button clicks
- Logger/StatusBar integration not tested (requires full extension context)
- Edit/Delete buttons not rendered (script event listeners not attached)
- Duplicate prevention logic not tested (validation in script)

**To Run Full Integration Test:**
For complete testing, the extension must be loaded via web-ext or installed in Firefox:
```bash
web-ext run --start-url "about:debugging#/runtime/this-firefox"
# Then manually navigate to extension options page
```

**Future Improvements:**
- Use web-ext with Puppeteer to connect to real Firefox instance
- Use Selenium WebDriver with Firefox extension loading
- Add API mocking at fetch/XHR level for realistic testing

## Manual Testing with httpbin

### Quick Start
```bash
# 1. Generate test config
node tests/integration/test-helper.js --generate

# 2. Build and run extension
npm run build
web-ext run --start-url https://www.ertecho.gr/radio/trito/

# 3. Follow setup instructions
node tests/integration/test-helper.js --instructions
```

### Step-by-Step Validation

**1. Configure httpbin endpoint:**
- Open extension options (click icon → Options)
- Add endpoint:
  - Name: `httpbin Test`
  - URL: `https://httpbin.org/anything`
  - Method: `POST`
  - ☑ Include page cookies
  - ☑ Include page headers
- Save

**2. Test on real stream page:**
```bash
# Visit stream page (or use web-ext --start-url)
https://www.ertecho.gr/radio/trito/
```

**3. Verify stream detection:**
- Badge shows stream count (e.g., "2")
- Click extension icon → popup shows detected streams
- Streams typically: `.m3u8` (HLS) format

**4. Make API call:**
- In popup, click "📞 Call API" for any stream
- Check browser console for response

**5. Validate httpbin response:**
Expected response structure:
```json
{
  "headers": {
    "Cookie": "session_id=...",      // ✓ if includeCookies enabled
    "User-Agent": "Mozilla/5.0...",  // ✓ if includePageHeaders enabled
    "Accept": "application/json",
    "Referer": "https://www.ertecho.gr/...",
    "Content-Type": "application/json"
  },
  "json": {
    "streamUrl": "https://.../stream.m3u8",
    "pageUrl": "https://www.ertecho.gr/radio/trito/",
    "pageTitle": "ΕΡΤ Τρίτο Πρόγραμμα",
    "timestamp": "2025-12-14T...",
    "test": "stream-call-integration"
  }
}
```

**Success criteria:**
- ✅ `headers.Cookie` present (if page has cookies)
- ✅ `headers.User-Agent` present (from page request)
- ✅ `headers.Referer` matches page URL
- ✅ `json.streamUrl` is detected stream URL
- ✅ `json.pageUrl` matches current page
- ✅ `json.pageTitle` is page title

## Debugging Tips

### View Extension Logs
- **Content script:** F12 on webpage → Console
- **Background script:** `about:debugging` → This Firefox → Inspect
- **Popup:** F12 on popup window

### Common Issues

**No streams detected:**
- Check content script console for errors
- Verify page actually loads streams (network tab)
- Try waiting 10-15 seconds for dynamic content

**API call fails:**
- Check network tab for request
- Verify endpoint URL is correct
- Check background script console for errors

**Cookies/headers not sent:**
- Verify checkboxes are enabled in endpoint config
- Check page actually has cookies (Application → Cookies)
- Headers captured on main_frame load only

### Test Shortcuts
```bash
# Quick integration test suite
npm run build && npm run test:integration

# Real stream test (30s timeout)
npm run test:integration:real

# Options CRUD only
npm run test:integration:options

# Manual testing
web-ext run --start-url https://www.ertecho.gr/radio/trito/
```
