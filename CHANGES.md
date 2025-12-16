## Changes

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
- docc: README overhaul — updated architecture, logging stats (61 calls), project
  structure
- doc: Test improvements — endpoint.test.ts expanded, template.test.ts merged into
  endpoint
- enh: 2400+ line delta — 24 files changed, 2422 insertions, 900 deletions since
  v0.1.0
- [x] FIX: `GET` requests fail because they include an (empty) body.
- [x] FIX: had duplicate endpoint DEFAULTS.
- [x] Feat: Refactored options UI for mobile-friendly experience:
- [x] Enhanced API validation with real calls and detailed logging
- [x] Logger architecture hardening (required logger, no console.* calls)
- [x] Fix(mobile): options button in popup not quite working:
  opens new tab without switching to it, filling up the tab list.  Reuse tab??
- [x] improve docs
- [ ] prepare for Mozilla extension site submission.
- TODO: transfer popup logs from extension-context -> page's console.
- BUG: popup cannot see responses from fetch-calls.
- BUG: persist popup logs & logbox-expanded choice in popup panel.
- TODO: logging message texts, levels & timeout in status bar
- TODO: improve icons

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
