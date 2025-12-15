## Changes

## v0.1.0 - (2025-12-14) it Works!

- Rough implementation complete.
- Packaged as a Firefox extension zip to install manually.
- Comprised of:
  - page-content script for stream-url detection (page context)
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
