# Integration Testing (Firefox)

This setup uses `web-ext` to run the extension in Firefox with the local test page.

## Prerequisites
- Firefox installed
- Node.js (>= 18)
- Run `npm install`

## Test Suites

### 1. Stream Detection Test (`run.js`)
```bash
npm run build
npm run test:integration
```
This launches Firefox via `web-ext` and runs automated assertions by parsing
console output. It navigates to `tests/test-page.html`.

**What is asserted automatically:**
- At least one stream detection log (from content/background) is observed.
- No fatal errors are found in `web-ext` stderr output.

### 2. Options CRUD Test (`options-crud.js`)
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

## Manual checks (optional)
- Streams detected from:
  - `<audio src="...mp3">`
  - `<video><source src="...m3u8"></video>`
  - `fetch('...mpd')` and XHR `open('.../stream')`
- The popup lists detected streams and allows `Call API`.

## Tips
- Open Web Console (F12) on the test page to see content logs.
- Open `about:debugging` > This Firefox > Inspect background to see background logs.
- Update `DEFAULT_CONFIG` in `src/options.ts` for quick httpbin tests.
- Set `headless: true` in `options-crud.js` for CI environments; `false` for debugging.
