## Changes

## v0.4.1 - (2025-12-24) lost close hover button fix

- Fix(ui) Show/hide hover-pane button no longer moves outside screen panel, it remains fixed in its original position instead.

## v0.4.0 - (2025-12-23) GUI beauty, Hover pane

- FEAT: Hover pane now works (opt-in from preferences).
- FEAT(apicall) POST/PUT/etc can open new Tab (not just GET).
- Fix(ui) fixes for mobile
- feat(ui) consistent API-calling buttons in popup vs options; added preview in popup.
- Feat(endp) add "Description" field.
- Feat: UI work on shared components (eg actiontbuttons)
- Refact(ui) extract DOM-builders for common UIs across `popup.ts` - `options.ts`
- Refact(endp) Unified API/UI calling, 6% bundle size improvements.
- Refct(broker) dropped needless messaging from same exec context.
- Refact(log) Merge Logger/StatusBar as LIFO stack, much simpler & lighter.
- Feat: rework log, status & emoji icons.
- Refact: renames to denote structure:
  - rename `background.ts` -> `broker.ts`
  - denote Pane UIs with `-pane` suffix.

## v0.3.0 - (2025-12-16) GUI also works ok now

- Feat(ui) Consistent API call action buttons (Call, Open, Preview) in popup & options UIs
- FIX(ui) Touch-friendly UI & hints, improved look & feel of options page.
- feat(ui) Don't jerk when adding endpoint in options page.
- refact(ui) css units from px -> rem for scalable UI
- doc: consistent project description across README, UI & manifest paraphernalia
- feat(build) "About" section get its version from extension's Manifest.
- feat(build) include version in zip fname when packaging the extension.
- drop(broker) minor messaging dead code
- chore: my project coordinates in `manifest.json`
- [ ] TODO/Enh(API): support POST for "Open in Tab" button with dynamic `<form>` submission.
- [ ] TODO/FEAT: hover panel full implementation (WIP since v0.1.0)

## v0.2.0 - (2025-12-15) FIXED and ENHANCED

- FEAT: Dual call modes — "Open in Tab" (simple GET) vs "Call API" (full HTTP with
  POST/headers/body)
- FEAT: Options page complete overhaul — responsive 2-column UI, CRUD editor,
  import/export (file/URL/Gist), active toggles, validate/call testing, inline help,
  integrated log viewer
- refact: Endpoint module extraction — merged `template.ts` into `endpoint.ts`,
  centralized API logic, eliminated duplicate DEFAULT_CONFIG
- refact/fix: Logger, separate category/slot from levels, no naked console calls,
  eliminated duplicate.
- Feat: Popup master-detail pattern — compact scrollable list + single detail panel,
  saves 60% vertical space
- FIX: Hover panel still WIP but  for mobile — in-page iframe overlay with toggle button, clone of
  popup UI
- fix: Tab reuse logic — query existing tabs before creating new ones, prevents mobile
  tab bloat
- refact: Content → Page rename — `content.ts` → `page.ts` throughout codebase
- fix: GET/HEAD body exclusion — fixed "Request cannot have a body" errors
- fix: Demo endpoint for HTTPBin → HTTPBingo — updated dead test endpoint to working alternative
- doc: Mobile testing docs — comprehensive `MOBILE_TESTING.md` with Firefox Nightly
  setup
- cod: Copilot instructions — enhanced with logging rules, git workflow, testing
  conventions
- doc: README overhaul — updated architecture, logging stats (61 calls), project
  structure
- doc: Test improvements — endpoint.test.ts expanded, template.test.ts merged into
  endpoint
- enh: 2400+ line delta — 24 files changed, 2422 insertions, 900 deletions since
  v0.1.0
- FIX: `GET` requests fail because they include an (empty) body.
- FIX: had duplicate endpoint DEFAULTS.
- Feat: Refactored options UI for mobile-friendly experience:
- Enhanced API validation with real calls and detailed logging
- Logger architecture hardening (required logger, no console.* calls)
- Fix(mobile): options button in popup not quite working:
  opens new tab without switching to it, filling up the tab list.  Reuse tab??
- doc: improve README.
- [ ] TODO/CHORE: prepare for Mozilla extension site submission.
- [ ] TODO: transfer popup logs from extension-context -> page's console.
- [ ] TODO/BUG: popup cannot see responses from fetch-calls.
- [ ] TODO/BUG: persist popup logs & logbox-expanded choice in popup panel.
- [x] TODO: logging message texts, levels & timeout in status bar
- [ ] TODO: improve icons

## v0.1.0 - (2025-12-14) it almost Works

- Rough implementation complete.
- Packaged as a Firefox extension zip to install manually.
- Comprised of:
  - page script for stream-url detection (page context)
  - extension-popup panel with detected stream list & call button (extension context)
  - options-page with endpoint config editor (extension context)
  - communication between contexts via `browser.runtime.sendMessage()`
  - logbox & statusbar in both popup & options
- Package contents:

  | Size  | File |
  |-------|------|
  |  1314 | manifest.json |
  |     0 | dist/ |
  | 10149 | dist/background.js |
  | 32133 | dist/options.js |
  | 20866 | dist/popup.js |
  | 17308 | dist/options.html |
  |  9527 | dist/hover-panel.html |
  |   535 | dist/hover-panel.js |
  | 11230 | dist/content.js |
  | 11015 | dist/popup.html |
  |     0 | icons/ |
  |   568 | icons/icon-16.png |
  |  1252 | icons/icon-32.png |
  |  4207 | icons/icon-96.png |
  |  1959 | icons/icon-48.png |
  |  5809 | icons/icon-128.png |
  | **137399** | **17 files** |

- NOTE: it contains a dummy hover-panel expandable with a hover button bottom-right of the page,
 to check implementation on mobile firefox: not working yet
- BUG: `GET` requests fail because they include an (empty) body.

## v0.0.0 - (2025-12-12) initial commit

- Scaffolding for Firefox extension and stated project coal to copilot (Claude Sonnet 4.5).
- Stated goal: an extension that captures audio/video streams from pages (radio, podcasts, etc.) and send them to a specified endpoint(s).
