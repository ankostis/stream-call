# Logger & Status Bar Plan: Options Page Audit + Real-Time Feedback

**Goal**:
1. Add a filterable in-memory audit log to options page for debugging pattern config, storage, import/export, and API test operations.
2. Add a status bar for real-time form validation and action feedback (persistent blocking errors, transient action confirmations).
3. Keep network & API logs (background/popup) in console only.

---

## Architecture Overview

**Key architectural point**: Logger and StatusBar are designed as reusable UI abstractions to support both desktop (options page) and future mobile (in-page panel) contexts.

Recent updates (Dec 2025):
- Logger categories are now free-form strings (no predefined list).
- StatusBar slots are now free-form strings (no predefined list or mapping).
- StatusBar methods were renamed: `set()` → `post()`, `action()` → `flash()`.
- Transient stacking: later flashes don’t discard earlier; when the latest expires, the previous transient or persistent message is restored.
- Level continues to control visibility priority (error > warn > info) for both persistent and transient messages.

### Logger Utility (`src/logger.ts`)
- Simple class with level methods: `error()`, `warn()`, `info()`, `debug()`
- Each entry: timestamp, level, category (free-form string), message
- In-memory circular buffer (max 100 entries to avoid memory bloat)
- Export to text/JSON for user diagnostics
- Filter by level and category in UI

### Log Categories (Levels: error, warn, info, debug)
- Categories are free-form; use descriptive, consistent strings.
- Suggested conventions:
  - `endpoint-parse`: JSON deserialization & schema validation (storage load, file import)
  - `endpoint-list`: Add/delete/edit list operations
  - `storage`: Load/save to `browser.storage.sync`
  - `import-export`: File import/export operations
  - `api-test`: Test API button actions
  - `form-input`: User input validation in the form UI (real-time, before-save)

### Status Bar
- UI element below the log viewer showing current action/error state
- Two message types:
  - **Persistent**: Blocking errors or warnings on form/endpoint (sticky until cleared by user action)
  - **Transient**: Action confirmations, stats (auto-dismiss after timeout, e.g., 3s)
- Messages rendered with smileys & markdown
- Organized by **slots** (free-form strings for persistent messages). Suggested slots:
  - `form-error`: Form input validation error (blocks save)
  - `endpoint-error`: Endpoint schema/uniqueness error (duplicate name, missing endpoint)
  - `storage-error`: Storage I/O error (load/save to sync)
  - `interpolation-error`: Template interpolation error (missing placeholder in endpoint/body)
  - `last-action`: Info-level action (e.g., "✅ Endpoint saved", "✅ Imported 3 endpoints", "📋 URL copied")
  - `stat`: Statistics/counts (e.g., "📊 3 endpoints loaded", "📊 Export ready")
  - Debug-level messages do **not** appear in status bar (only audit log)
- **Overlay priority**:
  - Highest level wins (error > warn > info)
  - Transients always visible over persistent
  - Latest transient always shown
  - Oldest persistent in highest-level slot shown if no transients
- Also logged to main logger for audit trail

### Options Page Changes
- Add **status bar** above the form (sticky, shows current action/error)
- Add **scrollable log viewer** below (dark theme, monospace, audit trail)
- Filter controls: level checkboxes [Error] [Warn] [Info] [Debug]
- Category checkboxes: [Pattern] [Storage] [Import] [Test] [Form] [Debug]
- Live rendering: append logs as they happen
- [Clear logs] button
- [Export logs] button (download as JSON with timestamps)
- Form inline error badges next to fields (red outline, error icon)
- Hover messages for fields (tooltip-style, tied to form-error slot)

### Network Logs (Out of Scope)
- Background/popup network calls stay in console only
- `callStreamAPI()` errors remain in background console
- Popup `handleCallAPI()` errors show in popup toasts/alerts (not options log)

---

### Task 1.5: Create Status Bar Utility
**File**: `src/status-bar.ts`

```typescript
export type StatusLevel = 'error' | 'warn' | 'info';
export type StatusSlot = string; // free-form

export interface StatusMessage {
  slot: StatusSlot;
  level: StatusLevel;
  message: string;
  timestamp: Date;
  timeout?: number; // ms; undefined = persistent
  isTransient: boolean;
}

export class StatusBar {
  private persistent: Map<StatusSlot, StatusMessage> = new Map(); // One per slot
  private transientStack: StatusMessage[] = []; // Stacked transients
  private subscribers: Set<(msg: StatusMessage | null) => void> = new Set();
  private timers: Map<StatusMessage, NodeJS.Timeout> = new Map();

  // Persistent message (replaces older in same slot)
  post(slot: StatusSlot, level: StatusLevel, message: string): void

  // Transient message (with optional timeout, default 3000ms) — stacked
  flash(level: StatusLevel, message: string, timeout?: number, slot?: StatusSlot): void

  // Clear slot or all slots, optionally by level
  clear(slot?: StatusSlot, level?: StatusLevel): void

  // Get current visible message (priority: transients > highest level persistent)
  getCurrent(): StatusMessage | null

  // Subscribe to changes
  subscribe(callback: (msg: StatusMessage | null) => void): () => void

  // Also logs to main logger (pass logger instance)
  setLogger(logger: Logger): void
}
```

**Logic**:
- `post(slot, level, message)`: Store in `persistent[slot]`, notify subscribers
- `flash(level, message, timeout, slot)`: Push onto a transient stack, auto-clear after timeout (default 3s), and restore previous transient or persistent message; notify
- `clear(slot)`: Remove from `persistent[slot]` or clear all, notify
- `getCurrent()`:
  - If any transient exists, return the latest (highest priority)
  - Else, find persistent with highest level, return oldest in that level
  - Return null if empty
- **Logging**: Each `set()` and `action()` also calls `logger.info(category, message)` (category derived from slot)

Notes:
- Logging uses slot name as the logger category (free-form).

---

### Task 1.6: Status Bar HTML
**File**: `options.html`

Add status bar above form:

```html
<div id="status-bar" class="status-bar">
  <div class="status-content">
    <span id="status-icon" class="status-icon"></span>
    <span id="status-message" class="status-message"></span>
  </div>
</div>
```

**CSS**:
- Sticky position (top of form card, above editor)
- Level-based colors: red=error, yellow=warn, blue=info
- Show/hide based on current message
- Markdown rendering for smileys (emoji or Unicode)
- Max-width to prevent overflow

---

### Task 2: Create Logger Utility
**File**: `src/logger.ts`

```typescript
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';
export type LogCategory = 'pattern-parsing' | 'pattern-list' | 'storage' | 'import-export' | 'api-test' | 'form-input';

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  category: LogCategory;
  message: string;
}

export class Logger {
  private entries: LogEntry[] = [];
  private maxEntries = 100;
  private subscribers: Set<(entries: LogEntry[]) => void> = new Set();

  log(level: LogLevel, category: LogCategory, message: string): void
  error(category: LogCategory, message: string): void
  warn(category: LogCategory, message: string): void
  info(category: LogCategory, message: string): void
  debug(category: LogCategory, message: string): void

  getAll(): LogEntry[]
  filter(level?: LogLevel[], categories?: LogCategory[]): LogEntry[]
  clear(): void
  subscribe(callback: (entries: LogEntry[]) => void): () => void
  exportJSON(): string
}
```

**Details**:
- Circular buffer: when max entries exceeded, drop oldest
- Subscribers: UI can listen for live updates
- Console passthrough: also log to browser console at same level
- Timestamps in ISO format for sorting/export

---

### Task 2: Update Options HTML
**File**: `options.html`

Add log viewer section:

```html
<div class="card" id="log-card">
  <div class="card-header">
    <h2 class="card-title">Activity Log</h2>
    <div class="card-actions">
      <button id="log-filter-toggle" class="btn-secondary">⚙️ Filter</button>
      <button id="log-export" class="btn-secondary">⬇ Export</button>
      <button id="log-clear" class="btn-secondary">🗑 Clear</button>
    </div>
  </div>

  <!-- Filter panel (hidden by default) -->
  <div id="log-filter-panel" style="display: none;">
    <div class="filter-group">
      <h3>Levels</h3>
      <label><input type="checkbox" class="log-level-filter" value="error" checked /> Error</label>
      <label><input type="checkbox" class="log-level-filter" value="warn" checked /> Warn</label>
      <label><input type="checkbox" class="log-level-filter" value="info" checked /> Info</label>
      <label><input type="checkbox" class="log-level-filter" value="debug" /> Debug</label>
    </div>
    <div class="filter-group">
      <h3>Categories</h3>
      <label><input type="checkbox" class="log-category-filter" value="pattern-parsing" checked /> Pattern Parsing</label>
      <label><input type="checkbox" class="log-category-filter" value="pattern-list" checked /> Pattern List</label>
      <label><input type="checkbox" class="log-category-filter" value="storage" checked /> Storage</label>
      <label><input type="checkbox" class="log-category-filter" value="import-export" checked /> Import/Export</label>
      <label><input type="checkbox" class="log-category-filter" value="api-test" checked /> API Test</label>
      <label><input type="checkbox" class="log-category-filter" value="form-input" checked /> Form Input</label>
    </div>
  </div>

  <!-- Log viewer -->
  <div id="log-viewer" class="log-viewer">
    <div class="log-empty">No logs yet</div>
  </div>
</div>
```

**CSS**:
- **Status bar**: Sticky (top), level-based colors (red=error, yellow=warn, blue=info), emoji/smiley rendering, dismissible
- **Log viewer**: Dark theme (monospace) with level-based colors, scrollable (max-height 300px), timestamp on left, category badge, message

---

### Task 3: Update Options Script
**File**: `src/options.ts`

Replace `showAlert()` calls with logger + status bar:
- **Blocking errors** (form validation, endpoint conflicts) → `statusBar.post('form-error', 'error', message)`
- **Action confirmations** (saved, deleted) → `statusBar.flash('info', '✅ Endpoint saved', 3000)`
- **All operations** → also `logger.error()` / `logger.info()` for audit trail

Wire status bar UI:
- Subscribe to status bar changes → render message + icon
- Handle transient timeout → hide after timeout
- Form input blur → validate → `statusBar.set('form-error', 'error', message)` or `statusBar.clear('form-error')`

Example:
```typescript
import { StatusBar } from './status-bar';
import { Logger } from './logger';

const logger = new Logger();
const statusBar = new StatusBar();
statusBar.setLogger(logger);

// Form validation
els.endpoint().addEventListener('blur', () => {
  const url = els.endpoint().value.trim();
  try {
    new URL(url);
    statusBar.clear('form-error');
    logger.info('form-input', 'Endpoint URL is valid');
  } catch {
    statusBar.set('form-error', 'error', '❌ Invalid URL. Must start with http:// or https://');
    logger.error('form-input', 'Invalid endpoint URL format');
  }
});

// Save pattern (success)
async function savePattern() {
  // ... validation ...
  await browser.storage.sync.set({ ... });
  statusBar.action('info', '✅ Pattern saved successfully', 3000);
  logger.info('pattern-parsing', 'Pattern saved to storage');
}

// Save pattern (error)
catch (error) {
  statusBar.set('storage-error', 'error', `❌ Storage failed: ${error?.message}`);
  logger.error('storage', `Failed to save: ${error?.message}`);
}
```

---

### Task 4: Refactor Template Error Messages
**File**: `src/options.ts`

When `applyTemplate()` throws, separate template errors from other errors:

```typescript
try {
  endpoint = applyTemplate(firstPattern.endpointTemplate, context);
} catch (error: any) {
  const available = Object.keys(context).filter(k => context[k] !== undefined).join(', ');
  const message = `🔴 Template error: ${error?.message}. Available: ${available}`;
  statusBar.post('interpolation-error', 'error', message);
  logger.error('api-test', `Template error in endpoint: ${error?.message}; available: ${available}`);
  return;
}
```

---

### Task 5: Storage Error Specificity
**File**: `src/options.ts`

Parse `browser.storage` errors in `loadSettings()` and `savePattern()`:

```typescript
try {
  await browser.storage.sync.get(...);
} catch (error: any) {
  const errorMsg = error?.message || '';
  let message = '❌ Storage error';

  if (errorMsg.includes('quota')) {
    message = '❌ Storage quota exceeded. Delete patterns or clear extension data.';
  } else if (errorMsg.includes('sync')) {
    message = '❌ Sync unavailable. Check browser sync settings.';
  }

  statusBar.post('storage-error', 'error', message);
  logger.error('storage', `Load failed: ${message}`);
}
```

---

## Testing Plan

### Unit Tests

**Logger**:
- Circular buffer: max 100 entries, drop oldest
- Filter by level and category
- Subscribe/notify
- Export JSON format

**Status Bar**:
- `set(slot, level, message)`: stores in persistent, notifies
- `action(level, message, timeout)`: sets transient, auto-clears
- `clear(slot?, level?)`: removes from slot (or all) optionally filtered by level
- **Priority logic** (overlay):
  - Transients always win
  - Highest level persistent visible if no transient
  - Latest transient always shown
  - Old persistent in highest-level slot shown if multiple
- Slot isolation: message in slot A doesn't affect slot B
- Logging integration: messages logged to logger

**Example test**:
```typescript
// Persistent message in form-error slot
statusBar.set('form-error', 'error', 'Name already exists');
assert(statusBar.getCurrent()?.message === 'Name already exists');

// Transient overrides (higher priority)
statusBar.action('info', '✅ Saved', 3000);
assert(statusBar.getCurrent()?.message === '✅ Saved');

// After timeout, back to persistent
// (async test, wait 3100ms)
// assert(statusBar.getCurrent()?.message === 'Name already exists');

// Clear slot
statusBar.clear('form-error');
assert(statusBar.getCurrent() === null);
```

### Integration Tests

- Options page loads, status bar empty
- User types invalid endpoint → form-error appears in status bar
- User corrects endpoint → form-error clears
- User clicks save → action transient appears ("✅ Pattern saved"), fades after 3s
- Log viewer shows all operations
- Filter by level/category works

### Manual QA

- Status bar displays correctly styled (colors, emoji)
- Form inline error badges appear on invalid input
- Hover messages show field-level tips
- Log export downloads JSON with all entries
- Multiple patterns: conflicts show per-pattern errors

---

## Implementation Sequence

1. Create `src/logger.ts` with Logger class
2. Create `src/status-bar.ts` with StatusBar class
3. Add unit tests for logger and status bar
4. Update `options.html` with status bar + log viewer + CSS
5. Update `src/options.ts` to use logger + status bar
6. Add form-level error badges and hover messages
7. Enhance error messages in template operations (Task 4)
8. Add storage error parsing (Task 5)
9. Integration test and manual QA

---

## Timeline

- Logger + StatusBar utilities: 1 hour
- Unit tests: 45 min
- HTML + CSS: 30 min
- options.ts integration: 1 hour
- Form error badges + hover: 30 min
- Error message enhancements: 30 min
- Testing + polish: 45 min
- **Total**: ~5 hours

---

### Task 3: Update Options Script
**File**: `src/options.ts`

```typescript
import { Logger } from './logger';

const logger = new Logger();

// Before:
// showAlert('Pattern saved', 'success');
// After:
logger.info('pattern-parsing', 'Pattern saved');

// Before:
// showAlert('Failed to save pattern', 'error');
// After:
logger.error('storage', 'Failed to save pattern to sync storage');

// Before:
// showAlert(`Template error: ${error?.message}`, 'error');
// After:
logger.error('api-test', `Template error: Missing placeholder "pageUrl" in endpoint`);
```

Wire log UI:
- Subscribe to logger updates → render live in log viewer
- Filter buttons → filter and re-render
- Clear → `logger.clear()` and re-render
- Export → `logger.exportJSON()` → download

---

### Task 4: Refactor Template Error Messages
**File**: `src/template.ts` or enhance in `src/options.ts`

When `applyTemplate()` throws, catch and provide context:

```typescript
try {
  endpoint = applyTemplate(firstPattern.endpointTemplate, context);
} catch (error: any) {
  const available = Object.keys(context).filter(k => context[k] !== undefined).join(', ');
  const message = `Template error in endpoint: "${error?.message}". Available placeholders: ${available}`;
  logger.error('api-test', message);
  return;
}
```

---

### Task 5: Storage Error Specificity
**File**: `src/options.ts`

In `loadSettings()` and `savePattern()`, parse `browser.storage` errors:

```typescript
try {
  await browser.storage.sync.get(...);
} catch (error: any) {
  const errorMsg = error?.message || '';
  let details = 'Unknown storage error';

  if (errorMsg.includes('quota')) {
    details = 'Storage quota exceeded. Delete some patterns or clear extension data.';
  } else if (errorMsg.includes('sync')) {
    details = 'Sync service unavailable. Check browser sync settings.';
  }

  logger.error('storage', `Load failed: ${details}`);
}
```

---

## Sub-Task: Bundler vs No-Bundler

### Current Setup (No Bundler)
- TypeScript → tsc → JavaScript in `dist/`
- HTML/JSON copied as-is
- Simple manifest with direct file references
- Pros:
  - Fast builds (plain tsc)
  - Easy to debug (source maps, no minification)
  - No webpack/rollup complexity
  - Straightforward manifest updates
- Cons:
  - No tree-shaking; all imports are included
  - No CSS/asset bundling (HTML still copied, not inlined)
  - No lazy loading or code splitting
  - Harder to add npm libraries (they're imported via `node_modules` at runtime)

### With Bundler (Vite/esbuild)
- TypeScript → Vite/esbuild → single or multiple bundles
- HTML inlined, CSS processed, assets optimized
- Manifest updated to point to bundle outputs
- Pros:
  - Tree-shaking: unused code eliminated
  - Can import npm libraries that expect a module system (lodash, date-fns, etc.)
  - Minified output (smaller extension size)
  - CSS can be imported in JS and bundled
  - Better source map support
- Cons:
  - Slower builds
  - Requires additional config (vite.config.ts)
  - Harder to debug minified code in production
  - Extension size might be smaller but build complexity increases
  - May introduce unexpected side effects if library assumes browser globals

### Decision for This Project

**Recommendation: Stay with no-bundler for now.**

Rationale:
- Logger is lightweight (< 1KB) and doesn't need external deps
- Current setup is fast and maintainable
- No performance bottleneck yet (extension is small)
- If future features need lodash/moment, can add them to `package.json` and import directly; tsc will include them

- **Defer bundler** until:
  - Extension size becomes a concern (> 500KB)
  - Need complex npm libraries that don't work with plain imports
  - Build speed becomes a bottleneck
  - Want to minify for production distribution

---

## File Summary

**New files**:
- `src/logger.ts`: Logger class with circular buffer, filtering, subscription
- `src/status-bar.ts`: StatusBar class with persistent/transient messages, slots, priority overlay

**Modified files**:
- `options.html`: Add status bar (sticky, above form), log viewer (below form), CSS styling
- `src/options.ts`: Replace showAlert with logger + statusBar, wire UI events, form validation
- `src/template.ts` (if needed): Enhanced error messages for template interpolation

**Test files** (new):
- `tests/unit/logger.test.ts`: Logger circular buffer, filter, subscribe
- `tests/unit/status-bar.test.ts`: StatusBar persistent/transient, priority, slots, timeout

---

## Mobile Firefox Nightly Support: Architecture Note

**Significant constraint**: This extension must also work on **mobile Firefox Nightly**, where options UI panels cannot float/dock alongside the webpage.

**Current approach (Phase 4)**:
- Status bar & log viewer live in the **options page** (separate UI context)
- Works well on desktop (options in one window, webpage in another)

**Future (Phase 5+)**: For API calls or diagnostics to happen **while the original page is still visible** (mobile scenario):
- Will need a **separate UI panel/hover/modal** that appears in the webpage context (not options)
- This panel can reuse StatusBar + Logger utilities
- Requires messaging between content script and background to relay status/logs

**Implication**: Logger and StatusBar are designed as **reusable UI abstractions**, not tied to the options page. This allows them to be instantiated in multiple contexts (options page, future mobile UI panel, etc.).

---

## Logging Pattern Analysis (Codebase Scan)

**Scanned files**: `src/background.ts`, `src/content.ts`, `src/popup.ts`, `src/options.ts`

### Discovered Logging Categories by Context

**Background Service Worker** (`src/background.ts`):
- `Stream detected` (info) - Stream captured from content script
- `API call failed` (error) - Network/fetch failure or template error
- Background worker loaded (debug)

**Content Script** (`src/content.ts`):
- `Detected stream` (info) - URL found via media element or player library
- `Failed to report stream to background` (error) - Message passing failure
- `HLS.js/Video.js/JW Player/Shaka Player detected` (debug) - Player library identification

**Popup** (`src/popup.ts`):
- `Failed to load streams` (error) - GET_STREAMS message failed or parsing error
- `API call error` (error) - CALL_API message failed
- `Copy error` (error) - Clipboard write failure
- Initialization error (error)

**Options Page** (`src/options.ts`):
- `Failed to load settings` (error) - Storage read failure
- `Failed to save pattern` (error) - Storage write failure
- `Failed to delete pattern` (error) - Storage write failure
- `API test error` (error) - Template or network failure during test
- `Failed to import patterns` (error) - File read or validation failure
- `Failed to reset settings` (error) - Storage write failure

### Status Bar Slots: Verified & Added

**Discovered during scan**:
1. ✅ `form-error` - Form validation errors
2. ✅ `template-error` - Pattern conflicts (duplicate names, missing fields)
3. ✅ `storage-error` - Storage read/write failures
4. ✅ `last-action` - Action confirmations (save, import, copy, test)
5. ✅ `stat` - Counts and stats (patterns loaded, imported count)
6. **NEW** `interpolation-error` - Template interpolation failures in endpoint/body

**Why `interpolation-error` is separate from `template-error`**:
- Occurs at **test/call time**, not at edit time
- Indicates a **runtime template issue** (missing placeholder in context)
- User can see available placeholders and fix the template live
- Distinguishes "pattern config wrong" (template-error) from "template doesn't work with this stream URL" (interpolation-error)
