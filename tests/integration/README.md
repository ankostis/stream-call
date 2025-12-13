# Integration Testing (Firefox)

This setup uses `web-ext` to run the extension in Firefox with the local test page.

## Prerequisites
- Firefox installed
- Node.js (>= 18)
- Run `npm install`

## Run
```bash
npm run build
npm run test:integration
```
This launches Firefox via `web-ext` and runs automated assertions by parsing
console output. It navigates to `tests/test-page.html`.

## What is asserted automatically
- At least one stream detection log (from content/background) is observed.
- No fatal errors are found in `web-ext` stderr output.

## Manual checks (optional)
- Streams detected from:
  - `<audio src="...mp3">`
  - `<video><source src="...m3u8"></video>`
  - `fetch('...mpd')` and XHR `open('.../stream')`
- The popup lists detected streams and allows `Call API`.

## Tips
- Open Web Console (F12) on the test page to see content logs.
- Open `about:debugging` > This Firefox > Inspect background to see background logs.
- Update `DEFAULT_CONFIG` patterns in `src/options.ts` for quick httpbin tests.
