# Error Handling Audit: Silent Error Consumption

## Goal
Identify places where errors are caught and consumed silently without propagating to UI callers that can inform users. This improves debuggability and observability for a young extension.

---

## Silent Error Sinks Found

### 1. **Content Script: Stream Reporting** (`src/content.ts`)
**Location:** [src/content.ts](src/content.ts#L69-L71)

**Issue:** `.catch()` silently logs errors when `browser.runtime.sendMessage()` fails during `STREAM_DETECTED` reporting.

```ts
browser.runtime
  .sendMessage({
    type: 'STREAM_DETECTED',
    url,
    streamType: getStreamType(url)
  })
  .then(() => { /* relay to test handler */ })
  .catch((err) => {
    console.error('stream-call: Failed to report stream:', err);
  });
```

**Impact:**
- Stream detection errors on the content script side are invisible to the UI.
- Background worker never learns about failed detections, so popup doesn't know streams were missed.
- If `browser.runtime` is unavailable or the background worker crashes, users get no feedback.

**UI Caller That Could Benefit:**
- [popup.ts](src/popup.ts#L62-L96): `loadStreams()` displays detected streams; if an error happened upstream, it silently shows fewer streams than actually existed.
- Badge count updates miss failed reports silently.

**Recommended Fix:**
- Keep logging but consider adding a counter or flag to the page context so popup/background can query "how many reports failed?" on next sync.
- Or: Periodically send a heartbeat/status from content script to background with failure counts, which popup can display as a diagnostic warning.

---

### 2. **Content Script: Media Element Monitoring** (`src/content.ts`)

**Location:** [src/content.ts](src/content.ts#L90-L107)

**Issue:** `try/catch` in `monitorMediaElements()` silently catches URL parsing errors in `isStreamUrl()` without surfacing them.

```ts
mediaElements.forEach((element) => {
  if (element.src && isStreamUrl(element.src)) {  // isStreamUrl has try-catch internally
    reportStream(element.src);
  }
  // ...
});
```

**Impact:**
- If `isStreamUrl()` throws (e.g., malformed `data:` URLs, exotic protocols), the error is swallowed and that element is skipped silently.
- Users browsing pages with edge-case media elements won't know why some weren't detected.

**UI Caller That Could Benefit:**
- [popup.ts](src/popup.ts#L62-L96): Could show a diagnostic message like "⚠️ Failed to analyze X elements" if upstream errors occurred.

**Recommended Fix:**
- Collect error counts in the content script and include them in the `STREAM_DETECTED` message metadata or a separate diagnostic message.
- Background aggregates these errors and popup displays a footer note if any were encountered.

---

### 3. **Background: Stream API Fetch** (`src/background.ts`)

**Location:** [src/background.ts](src/background.ts#L148-L210)

**Issue:** Network errors in `callStreamAPI()` are caught and returned as `{ success: false, error }`, but **`buildContext()` is not wrapped and doesn't validate input before being passed to `applyTemplate()`.**

```ts
async function callStreamAPI({ ... }) {
  try {
    const patterns = parsePatterns(config.apiPatterns);  // ✅ wrapped
    // ...
    const requestContext = buildContext({ streamUrl, pageUrl, pageTitle });  // ❌ NOT wrapped!
    const endpoint = applyTemplate(selectedPattern.endpointTemplate, requestContext);
    // ...
  } catch (error: any) {
    return { success: false, error: error?.message ?? 'Unknown error' };
  }
}
```

**Impact:**
- If `buildContext()` fails (shouldn't, but defensive coding), the error message might be generic or missing context.
- `applyTemplate()` can throw if a placeholder is missing and `onMissing: 'throw'` is set, but the error is caught generically without distinguishing it from network errors.
- Users see "Unknown error" instead of "Missing placeholder: streamUrl in endpoint template".

**UI Caller That Could Benefit:**
- [popup.ts](src/popup.ts#L220): `handleCallAPI()` displays `response?.error` generically; more granular errors would help users debug misconfigured patterns.

**Recommended Fix:**
- Wrap `applyTemplate()` separately with a specific error handler that distinguishes template errors from network errors.
- Return error codes or types (e.g., `ERROR_TEMPLATE`, `ERROR_NETWORK`, `ERROR_PATTERN_MISSING`) so UI can provide context-aware messages.

---

### 4. **Options Page: Validation on Save** (`src/options.ts`)

**Location:** [src/options.ts](src/options.ts#L47-L52)

**Issue:** `loadSettings()` catches storage read errors silently and falls back without indicating what went wrong.

```ts
async function loadSettings() {
  try {
    const config = (await browser.storage.sync.get(DEFAULT_CONFIG)) as Config;
    (document.getElementById('api-patterns') as HTMLTextAreaElement).value = config.apiPatterns;
  } catch (error) {
    console.error('Failed to load settings:', error);
    showAlert('Failed to load settings', 'error');  // ✅ Shows to user
  }
}
```

**Impact:**
- Alert is shown, but the underlying error (e.g., quota exceeded, corrupted storage) is not surfaced.
- Users can't distinguish "corrupted sync" from "no patterns set yet".

**UI Caller That Could Benefit:**
- [options.ts](src/options.ts#L154-L170): `showAlert()` could accept error details to explain what went wrong (e.g., "Storage quota exceeded" vs "Network error reading sync storage").

**Recommended Fix:**
- Parse the error in the catch block and provide a more specific message to `showAlert()`.

---

### 5. **Options Page: Test API with Missing Context** (`src/options.ts`)

**Location:** [src/options.ts](src/options.ts#L89-L137)

**Issue:** Template interpolation errors in `testAPI()` are caught generically. If `applyTemplate()` throws due to missing placeholders, it's caught but the user only sees the generic error.

```ts
try {
  const endpoint = applyTemplate(firstPattern.endpointTemplate, context);
  const body = firstPattern.bodyTemplate
    ? applyTemplate(firstPattern.bodyTemplate, context)
    : JSON.stringify({ /* ... */ });
  const response = await fetch(endpoint, { method, headers, body });
} catch (error: any) {
  console.error('API test error:', error);
  showAlert(`❌ API test failed: ${error?.message ?? 'Unknown error'}`, 'error');
}
```

**Impact:**
- If a pattern has `{{pageTitle}}` but `includePageInfo: false`, the template will try to use an undefined value, and the error message might say "Missing placeholder" but doesn't clarify *which* placeholder or *why*.
- Test feedback isn't actionable; user can't easily fix the pattern.

**UI Caller That Could Benefit:**
- User in options page trying to debug why test fails; error context should include which placeholder was missing and how to fix the pattern.

**Recommended Fix:**
- Enhance `applyTemplate()` error messages to include template context (the template string + missing key).
- Catch template errors separately and provide a preview of what would be rendered with available placeholders.

---

### 6. **Popup: GET_STREAMS Message Failure** (`src/popup.ts`)

**Location:** [src/popup.ts](src/popup.ts#L67-L96)

**Issue:** `loadStreams()` catches the response generically. If `browser.runtime.sendMessage()` to the background worker fails, the catch shows "Failed to load streams" but users don't know if the background worker is dead, the tab is in a bad state, or the message timed out.

```ts
async function loadStreams() {
  if (currentTabId === null) return;

  try {
    const response = await browser.runtime.sendMessage({
      type: 'GET_STREAMS',
      tabId: currentTabId
    });
    // ...
  } catch (error) {
    console.error('Failed to load streams:', error);
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'none';
    const emptyState = document.getElementById('empty-state');
    if (emptyState) emptyState.style.display = 'block';  // Silently shows "no streams" instead of "connection error"
  }
}
```

**Impact:**
- User sees empty state and assumes no streams were detected, but the real issue might be a background worker crash or a message timeout.
- Debugging is hard: is the extension broken, or were there genuinely no streams?

**UI Caller That Could Benefit:**
- Popup UI could show a diagnostic banner: "⚠️ Unable to communicate with background worker. Try refreshing the page." instead of silent empty state.

**Recommended Fix:**
- Enhance error handling to distinguish message failures from "no streams detected" and show appropriate UI.
- Add a PING handler that popup can query to verify background worker is alive.

---

### 7. **Popup: Document Element Safety** (`src/popup.ts`)

**Location:** [src/popup.ts](src/popup.ts#L15-L40)

**Issue:** Accessing DOM elements like `document.getElementById()` doesn't fail if elements don't exist; they just return `null`. The code has defensive `?.` chaining, but if HTML structure changes, initialization silently fails in places like:

```ts
document.getElementById('refresh-btn')?.addEventListener('click', handleRefresh);
document.getElementById('options-btn')?.addEventListener('click', handleOptions);
```

**Impact:**
- If popup.html is malformed or out of sync with the JS, buttons won't work silently.
- Hard to debug: user clicks button, nothing happens, no error message.

**UI Caller That Could Benefit:**
- Popup should validate DOM structure on init and show a warning if elements are missing.

**Recommended Fix:**
- Add a check at the start of `initialize()`: ensure required elements exist, or show an error message.

---

### 8. **Detect Utility: URL Parsing** (`src/detect.ts`)

**Location:** [src/detect.ts](src/detect.ts#L13-L18)

**Issue:** `isStreamUrl()` silently catches URL parsing errors and returns `false`, which is correct for "not a URL" but doesn't distinguish malformed URLs from non-stream URLs.

```ts
export function isStreamUrl(url: string | null | undefined, base?: string): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    const urlObj = new URL(url, base ?? 'http://localhost');
    const fullUrl = urlObj.href;
    return STREAM_PATTERNS.some((pattern) => pattern.test(fullUrl));
  } catch (e) {
    return false;  // Silent: could be "invalid URL" or "not a URL"
  }
}
```

**Impact:**
- Content script relies on this; if a URL is malformed (e.g., `data:` blob with binary data), it's silently rejected without logging why.
- Harder to add heuristics for edge cases later.

**UI Caller That Could Benefit:**
- Diagnostic mode: popup could show "X URLs rejected as invalid" if `isStreamUrl()` tracked a counter.

**Recommended Fix:**
- Optionally add a `logger` callback or stats collector to `isStreamUrl()` so content script can track rejection reasons without breaking the function.

---

## Summary Table

| Error Sink | Location | Severity | UI Benefit | Fix Approach |
|---|---|---|---|---|
| Stream report failure | content.ts:69–71 | Medium | loadStreams() UI | Heartbeat + failure counter |
| Media element parsing | content.ts | Low | Pop-up diagnostic | Aggregate error counts |
| Template interpolation context | background.ts:148–210 | Medium | popup error display | Wrap applyTemplate() separately; error codes |
| Storage read errors | options.ts:47–52 | Low | Specific error messages | Parse error type in catch |
| Template in test | options.ts:89–137 | Medium | Test feedback clarity | Enhanced error context in applyTemplate() |
| GET_STREAMS failure | popup.ts:67–96 | High | Diagnostic banner | Add PING handler; distinguish error types |
| DOM element safety | popup.ts:15–40 | Low | Initialization validation | Check element existence on init |
| URL parsing edges | detect.ts:13–18 | Low | Stats/diagnostics | Optional logger/counter |

---

## Immediate Actionable Fixes (Highest ROI)

1. **[HIGH] GET_STREAMS failure → Add PING handler**
   - Background responds to `PING` message with status.
   - Popup uses PING to verify connection before assuming "no streams".
   - **File:** `src/background.ts`, `src/popup.ts`

2. **[MEDIUM] Template errors → Separate catch for applyTemplate()**
   - Wrap `applyTemplate()` in its own try-catch with context.
   - Return template-specific error codes.
   - **File:** `src/background.ts` (callStreamAPI function)

3. **[MEDIUM] Test API errors → Enhanced error context**
   - When `applyTemplate()` throws in `testAPI()`, show which placeholder is missing and suggest a fix.
   - **File:** `src/options.ts` (testAPI function)

4. **[LOW] Storage errors → Specific error messages**
   - Parse `error?.message` in `loadSettings()` catch to provide context.
   - **File:** `src/options.ts` (loadSettings function)

---

## Notes for Future Debugging
- All errors currently flow through one catch block per function, making it hard to pinpoint the actual failure source.
- Adding diagnostic modes (e.g., `DEBUG` flag in storage) could enable verbose logging without cluttering normal mode.
- Consider adding a "Diagnostics" panel in options to show error logs and stats since last extension load.
