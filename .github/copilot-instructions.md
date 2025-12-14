# Copilot Instructions for *Stream call*

## Project essentials
- Firefox WebExtension; manifest points to built assets in `dist/` (tsc + copy,
  no bundler). Keep manifest paths in sync with `dist` outputs.
- TypeScript sources in `src/` (`background.ts`, `content.ts`, `popup.ts`,
  `options.ts`); `popup.html` and `options.html` are copied to `dist/`.
- Build: `npm install` then `npm run build` (clean + tsc + copy HTML). Package:
  `npm run build && zip -r stream-call.zip manifest.json dist icons -x
  "icons/generate-icons.html"`.
- APIs: `browser` namespace with `@types/firefox-webext-browser`; no framework/
  bundler.
- Tests: `npm test` (unit, node --test + tsx); `npm run test:integration`
  (web-ext, Firefox, local HTTP server on 9090).
- Templating placeholders for endpoints/bodies: `streamUrl`, `pageUrl`,
  `pageTitle`, `timestamp`.
- **Mobile Firefox Nightly**: Must have good UX on mobile browsers where options UI panels
  cannot float/dock alongside the webpage.

## Architecture principles
- Message-based flow: content -> `STREAM_DETECTED`; popup -> PING + `GET_STREAMS`.
  All cross-component comms via `browser.runtime.sendMessage()`.
- Bounded state: background caps 200 streams/tab (LRU) and cleans on close/nav;
  popup caches endpoints in-memory per session.
- Shared utilities: `config.ts` (parse/validate endpoints), `template.ts` (interpolate placeholders),
  `detect.ts` (detection patterns), `debounce.ts` (throttle). Content imports patterns
  from `detect.ts` instead of duplicating.
- All UI panels (hover-panel & options, Phase 5+) will reuse Logger & StatusBar
  for in-page diagnostics (See `notes/logger-plan.md`).
- Endpoint-first config: Only API endpoints, keyed by unique `name`. Names
  auto-suggested from endpoint host via `suggestEndpointName()`.
- Debounced detection: media scan 1s delay/2s interval; DOM mutation debounce
  500ms.

## Conventions & pitfalls
- **Exception handling**: Follow `notes/exception-handling-policy.md` strictly:
  - DON'T swallow silently exceptions.
  - Avoid early handling of exceptions, prefer to let them bubble to console via logger or statusbar,
  - early handling of exceptions preferable only when fail cause is known or where remedy is possible.
- Type isolation: each TS file `export {}` to avoid globals.
- Endpoint keying: unique `name`; `suggestEndpointName()` derives from hostname;
  `parseEndpoints()` filters dups; `validateEndpoints()` surfaces dups.
- Template errors: handled separately in `callStreamAPI()`/`testAPI()` to
  distinguish placeholder issues from network errors.
- Detection patterns: extend `STREAM_PATTERNS` and `getStreamType()` together;
  DASH before HLS to avoid `.mpd` false HLS matches.
- Static assets: if adding runtime HTML/assets, ensure copy step/manifest puts
  them in `dist/`. Icons via `icons/generate-icons.html`.

## Testing & debugging
- Unit: `npm test` (25 tests: config parsing, template interpolation, detection).
- Integration: `npm run test:integration` (web-ext, serves `tests/test-page.html`
  on :9090; asserts detections and no fatal errors).
- Manual API: use https://httpbin.org/anything to validate templating; tweak
  `DEFAULT_CONFIG` in `src/options.ts` for quick tests.
- Debugging: background via about:debugging > Inspect; content in page console;
  PING handler for popup health checks.

## Quick references
- Build: `npm run build` (clean + tsc + copy HTML)
- Dev load: about:debugging#/runtime/this-firefox -> Load Temporary Add-on ->
  manifest.json (expects `dist/` populated)
- Package: `npm run build && zip -r stream-call.zip manifest.json dist icons -x
  "icons/generate-icons.html"`
- Tests: `npm test`; `npm run test:integration`

## Roadmap context (notes/)
- `ui-rework-plan.md`: Form-based editor (Phase 2), import/export by name (Phase
  3), polish (Phase 4). Phase 1 (ID→name) done.
- `error-handling-audit.md`: Silent error sinks fixed (PING checks, template
  error separation, better UI feedback).

## Ask when unclear
- Confirm target browser (Firefox vs Chrome) before changing APIs or types.
- Verify new permissions/host permissions before adding to manifest.
- If touching shared utilities (`config.ts`, `template.ts`, `detect.ts`), update
  related tests.
