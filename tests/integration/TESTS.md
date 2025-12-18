# Integration Test Suite Summary

## Overview
Comprehensive integration tests for stream-call extension validating:
- Stream detection on real webpages
- API calls to httpbin.org
- Cookie header capture
- Request header capture (User-Agent, Referer, etc.)

## Test Files

### 1. `real-stream.js` - Real Stream Page Test
**Purpose:** Validate stream detection on actual streaming website

**Test URL:** https://www.ertecho.gr/radio/trito/ (Greek radio station)

**Execution:**
```bash
npm run test:integration:real
```

**What it tests:**
- ✅ Extension loads without errors
- ✅ Stream detection from live webpage
- ✅ Multiple stream URLs captured
- ✅ No storage API errors
- ⚠️ API calls (requires manual popup interaction)

**Expected output:**
```
✓ Addon installed
✓ Stream detected [1]: https://.../.../playlist.m3u8...
✓ Stream detected [2]: https://.../.../playlist.m3u8...
📊 Test Results:
   Addon installed: ✅
   Stream detections: 5 (unique: 2)
   ...
✅ ALL CRITICAL TESTS PASSED
```

### 2. `httpbin-full.js` - Full Workflow Test
**Purpose:** End-to-end test with Puppeteer controlling Firefox

**Status:** 🚧 Experimental (requires Firefox CDP)

**Execution:**
```bash
npm run test:integration:httpbin
```

**Prerequisites:**
- Firefox with CDP: `firefox --remote-debugging-port=9222`

**What it tests:**
- Stream detection
- Extension options configuration
- API calls to httpbin.org
- Response validation

**Note:** Currently skipped in CI (requires manual setup)

### 3. `test-helper.js` - Configuration Helper
**Purpose:** Generate test configurations and instructions

**Usage:**
```bash
# Generate test config
node tests/integration/test-helper.js --generate

# Show manual setup instructions
node tests/integration/test-helper.js --instructions
```

**Generates:**
- `test-config.json` - httpbin endpoint configuration
- Step-by-step validation instructions

### 4. `validate-response.js` - Response Validator
**Purpose:** Validate httpbin API response structure

**Usage:**
```bash
# Save response from browser console
# Then validate:
node tests/integration/validate-response.js response.json
```

**Validates:**
- ✅ Required headers present (Cookie, User-Agent, Referer)
- ✅ Request body structure (streamUrl, pageUrl, pageTitle, timestamp)
- ✅ Data format correctness (ISO timestamps, valid URLs)

## Quick Test Workflow

### Automated Test
```bash
npm run build
npm run test:integration:real
```
Expected: Stream detection verified automatically (~30s)

### Manual httpbin Validation
```bash
# 1. Build
npm run build

# 2. Get setup instructions
node tests/integration/test-helper.js --instructions

# 3. Run extension
web-ext run --start-url https://www.ertecho.gr/radio/trito/

# 4. Follow instructions:
#    - Configure httpbin endpoint in options
#    - Wait for stream detection
#    - Click "Call API" in popup
#    - Check console for response

# 5. Validate response (optional)
#    - Copy response JSON to file
#    - Run: node tests/integration/validate-response.js response.json
```

## Expected Results

### Stream Detection
- **ERT Τρίτο Πρόγραμμα:** 1-3 unique stream URLs
- **Format:** `.m3u8` (HLS)
- **Detection time:** 3-10 seconds after page load

### httpbin API Response
```json
{
  "headers": {
    "Cookie": "session_id=abc123",        // ✓ includeCookies
    "User-Agent": "Mozilla/5.0...",       // ✓ includePageHeaders
    "Referer": "https://www.ertecho.gr/...",
    "Content-Type": "application/json"
  },
  "json": {
    "streamUrl": "https://.../playlist.m3u8",
    "pageUrl": "https://www.ertecho.gr/radio/trito/",
    "pageTitle": "ΕΡΤ Τρίτο Πρόγραμμα",
    "timestamp": "2025-12-14T23:45:00.000Z"
  }
}
```

## Troubleshooting

### No streams detected
- Wait longer (10-15 seconds)
- Check page loads correctly
- View content script console (F12)

### API call fails
- Verify endpoint URL in options
- Check network tab for request
- Inspect broker script console

### Cookies/headers missing
- Verify checkboxes enabled in endpoint config
- Check page has cookies (Application → Cookies)
- Headers captured on page load only

### Test timeout
- Increase timeout in test script
- Check Firefox version compatibility
- Verify internet connection

## CI/CD Integration

### GitHub Actions Example
```yaml
- name: Run integration tests
  run: |
    npm run build
    npm run test:integration
    npm run test:integration:real
```

### Known Limitations
- Real stream test requires internet connection
- httpbin.org availability required
- Firefox must be installed
- Puppeteer tests require CDP setup (not in CI yet)

## Future Enhancements
- [ ] Selenium WebDriver for popup interaction
- [ ] Mock httpbin server for offline testing
- [ ] Screenshot capture on failure
- [ ] Performance metrics (detection time)
- [ ] Multiple stream sites testing
- [ ] Cookie/header capture verification in automated tests
