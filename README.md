# 🎵 *Stream call*

A Firefox browser extension that detects streaming media (podcasts, radio
stations, live streams) on web pages and sends the stream URLs to a configurable
HTTP API endpoint.

**Platform**: Works on desktop Firefox and mobile Firefox Nightly (future: dedicated mobile UI panel for API calls while viewing the webpage).

## Features

- 🔍 **Automatic Stream Detection** - Detects HLS, DASH, MP3, AAC, OGG, RTMP,
  RTSP, Icecast, Shoutcast, and more
- 📡 **HTTP API Integration** - Send detected stream URLs to your own API
  endpoint
- ⚙️ **Fully Configurable** - Set custom API endpoint, HTTP method, and headers
- 🎯 **Clean UI** - Simple popup interface showing all detected streams
- 📋 **Copy URLs** - Quick copy stream URLs to clipboard
- 🔔 **Badge Notifications** - Shows number of detected streams on the
  extension icon

## Installation

### From Source (Development)

1. Clone or download this repository (folder slug: `stream-call`)
2. Install deps (TypeScript build):
  ```bash
  npm install
  npm run build
  ```
3. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
4. Click "Load Temporary Add-on"
5. Navigate to the extension folder and select the `manifest.json` file
  (expects built assets in `dist/`)
6. Generate icons by opening `icons/generate-icons.html` in a browser and
  downloading them (only needed if you change the icon)

### For Production

Build and package (includes dist + manifest + icons):
```bash
npm run build
zip -r stream-call.zip manifest.json dist icons -x "icons/generate-icons.html"
```

Then submit to [Firefox Add-ons](https://addons.mozilla.org/).

## Testing

### Unit-like checks (templating)

- Install deps and run the TypeScript tests:
  ```bash
  npm install
  npm test
  ```
- Covers placeholder interpolation, missing-key handling, and `url`/`json`
  filters.

### Manual/API checks (external mock: httpbin)

- Use `https://httpbin.org` endpoints to validate responses without running a
  local server.
  - Echo body/headers/query: `https://httpbin.org/anything`
  - Force status: `https://httpbin.org/status/500`
  - Add latency: `https://httpbin.org/delay/3`
- Example pattern for echo testing:
  ```json
  [{
    "id": "echo-httpbin",
    "name": "Echo httpbin",
    "endpointTemplate": "https://httpbin.org/anything",
    "method": "POST",
    "headers": {"X-Test": "stream-call"},
    "bodyTemplate": "{\"url\":\"{{streamUrl}}\",\"title\":\"{{pageTitle}}\"}",
    "includePageInfo": true
  }]
  ```
- Inspect the httpbin JSON response (`args`, `headers`, `json`, `data`) to
  confirm placeholders are filled as expected.

## Usage

### 1. Configure API Endpoints

1. Click the *Stream call* icon in your Firefox toolbar
2. Click the "⚙️ Options" button
3. Define one or more API endpoints as a JSON array
4. Click "💾 Save Settings"
5. Click "🧪 Test API" to verify the connection

#### Simple JSON POST Example

```json
[{
  "id": "my-api",
  "name": "My API",
  "endpointTemplate": "https://api.example.com/stream",
  "method": "POST",
  "headers": {"Authorization": "Bearer YOUR_TOKEN"},
  "bodyTemplate": "{\"url\":\"{{streamUrl}}\",\"timestamp\":\"{{timestamp}}\"}",
  "includePageInfo": true
}]
```

#### URL Parameter GET Example

```json
[{
  "id": "simple-get",
  "name": "Simple GET",
  "endpointTemplate": "https://api.example.com/notify?url={{streamUrl}}&page={{pageUrl}}",
  "method": "GET"
}]
```

#### Available Placeholders

- `{{streamUrl}}` - The detected stream URL
- `{{pageUrl}}` - The webpage URL where the stream was found
- `{{pageTitle}}` - The webpage title
- `{{timestamp}}` - Current timestamp in ISO format

#### Endpoint Fields

- **id** (required): Unique identifier
- **name** (required): Display name shown in popup
- **endpointTemplate** (required): API URL (supports placeholders)
- **method** (optional): HTTP method (defaults to POST)
- **headers** (optional): Custom headers object
- **bodyTemplate** (optional): Request body template (supports placeholders)
- **includePageInfo** (optional): Include page URL/title in context (defaults
  to false)

### 2. Detect Streams

1. Navigate to any website with streaming media (e.g., online radio, podcast player)
2. The extension will automatically detect streams
3. A badge will appear on the extension icon showing the number of detected streams
4. Click the extension icon to view all detected streams

### 3. Send Streams to API

1. Click the "📤 Call API" button next to any detected stream
2. The stream URL will be sent to your configured endpoint
3. You'll see a success or error notification

## API Payload Format

The payload sent to your API endpoint depends on your endpoint configuration:

- If you use `bodyTemplate`, the extension sends that template with placeholders
  replaced
- If you omit `bodyTemplate` (for GET requests), placeholders in the URL are
  replaced
- `pageUrl` and `pageTitle` are available when `includePageInfo: true` in the
  pattern

**Example with bodyTemplate:**
```json
{
  "url": "https://stream.example.com/audio.m3u8",
  "timestamp": "2025-12-12T10:30:00.000Z",
  "pageUrl": "https://www.example.com/listen",
  "pageTitle": "Example Radio Station"
}
```

## API Example (Node.js/Express)

Here's a simple API server example:

```javascript
const express = require('express');
const app = express();

app.use(express.json());

app.post('/api/stream', (req, res) => {
  const { streamUrl, pageUrl, pageTitle, timestamp } = req.body;

  console.log('Stream detected:', {
    stream-call/
    ├── manifest.json          # Extension manifest (references built assets in
    │                          # dist/)
    ├── src/                   # TypeScript sources
    │   ├── background.ts      # Background service worker
    │   ├── content.ts         # Content script for stream detection
    │   ├── popup.ts           # Popup logic
    │   └── options.ts         # Options page logic
    ├── dist/                  # Built JS + copied HTML after `npm run build`
    │   ├── background.js
    │   ├── content.js
    │   ├── popup.js
    │   ├── popup.html
    │   ├── options.js
    │   └── options.html
    ├── popup.html             # Source popup UI (copied to dist/ on build)
    ├── options.html           # Source options page UI (copied to dist/ on
    │                          # build)
    ├── icons/                 # Extension icons
    │   ├── icon-16.png
    │   ├── icon-32.png
    │   ├── icon-48.png
    │   ├── icon-128.png
    │   └── generate-icons.html
    ├── package.json           # Build scripts and dev deps
    ├── tsconfig.json          # TypeScript config
    └── README.md             # This file
```

## Supported Stream Types

- **HLS** - HTTP Live Streaming (.m3u8)
- **DASH** - Dynamic Adaptive Streaming over HTTP (.mpd)
- **HTTP Audio** - Direct audio files (MP3, AAC, OGG, FLAC, WAV, M4A, WMA)
- **RTMP** - Real-Time Messaging Protocol
- **RTSP** - Real-Time Streaming Protocol
- **Icecast/Shoutcast** - Internet radio streaming protocols
- **Playlist formats** - M3U, PLS, ASX

## Development

### Project Structure

```
stream-call/
├── manifest.json          # Extension manifest
├── background.js          # Background service worker
├── content.js            # Content script for stream detection
├── popup.html            # Popup UI
├── popup.js              # Popup logic
├── options.html          # Options page UI
├── options.js            # Options page logic
├── icons/                # Extension icons
│   ├── icon-16.png
│   ├── icon-32.png
│   ├── icon-48.png
│   ├── icon-128.png
│   └── generate-icons.html
└── README.md            # This file
```

### Testing

1. Open `about:debugging#/runtime/this-firefox`
2. Load the extension
3. Visit test sites like:
   - BBC iPlayer Radio
   - TuneIn Radio
   - Any podcast website
   - YouTube (some streams may be detected)

### Debug Console

- **Background script:** about:debugging > Inspect
- **Content script:** Browser console (F12) on the webpage
- **Popup:** Right-click extension icon > Inspect

## Inspiration

This extension was inspired by:
- **stream-recorder** - For stream detection techniques
- **stream-bypass** - For handling various streaming protocols

## Permissions

The extension requires the following permissions:

- `storage` - To save API configuration
- `activeTab` - To access the current tab information
- `webRequest` - To monitor network requests for streams
- `<all_urls>` - To detect streams on any website

## Architecture & Terminology

The extension architecture revolves around five core concepts that work together in a message-driven flow:

| Concept | 🎯 What | 📍 Where | 🔧 Purpose |
|---------|---------|----------|------------|
| **Detection Patterns** | Regex for stream URLs | `STREAM_PATTERNS` in `detect.ts` | • Match streaming media URLs<br>• Built-in, not user-configurable<br>• Tested via `content.test.ts` |
| **Streams & Types** | Detected URLs + metadata + classification | `StreamInfo` in `background.ts` | • Store detected media per tab<br>• Typed as HLS, DASH, MP3, RTMP, etc.<br>• Include page context + timestamp |
| **API Endpoints** | User-configured HTTP targets | `storage.sync.apiEndpoints`, `config.ts` | • Webhooks/APIs for detected streams<br>• Support templating<br>• Fully customizable |
| **Interpolation Templates** | Placeholder strings | Endpoint/body templates | • Dynamic value insertion<br>• `{{streamUrl}}`, `{{pageUrl}}`, `{{pageTitle}}`, `{{timestamp}}` |
| **Runtime Messages** | Cross-component IPC | `RuntimeMessage` type | • `STREAM_DETECTED`, `GET_STREAMS`<br>• `CALL_API`, `PING`, `CLEAR_STREAMS` |

### 2. **Detection Patterns**
- **What**: Regular expression patterns (`STREAM_PATTERNS`) that match known streaming media URLs
- **Where**: Defined in `src/detect.ts` (separate from `content.ts` for modularity, reuse, and stateless testability)
- **Purpose**: Content script uses them to identify stream URLs (HLS, DASH, MP3, RTMP, Icecast, etc.)
- **Examples**: `/\.(m3u8|mpd)/i`, `/rtmp:/`, `/icecast|shoutcast/i`
- **Not configurable by users** — built-in to the extension
- **Testing**: Validated via `tests/unit/content.test.ts` (detection patterns and stream type classification)

### 1. **Streams & Stream Types**
- **What**: Detected media URLs with metadata (`StreamInfo`) and classification labels
- **Where**: `StreamInfo` type in `src/background.ts`; `getStreamType()` in `src/detect.ts`
- **Purpose**: Store detected streaming resources with type (HLS, DASH, HTTP Audio, RTMP, Icecast/Shoutcast), page context, and timestamp
- **Examples**: `{ url: "https://example.com/live.m3u8", type: "HLS", pageUrl: "...", timestamp: 1234567890 }`

### 3. **API Endpoints**
- **What**: HTTP targets where detected stream URLs are sent
- **Where**: Configured in options page, stored as JSON in `browser.storage.sync.apiEndpoints`
- **Structure**: Name, URL template, HTTP method, headers, optional body template
- **Purpose**: Each endpoint is a webhook/API target the user defines (e.g., their own webhook, httpbin for testing)
- **Examples**:
  ```json
  {
    "name": "My API",
    "endpointTemplate": "https://api.example.com/stream",
    "method": "POST",
    "bodyTemplate": "{\"url\":\"{{streamUrl}}\",\"timestamp\":\"{{timestamp}}\"}"
  }
  ```
- **Fully customizable by users** in the options page

### 4. **Interpolation Templates**
- **What**: Strings in `endpointTemplate` and `bodyTemplate` that contain placeholders like `{{streamUrl}}`
- **Where**: Defined as endpoint field values; processed by `src/template.ts`
- **Purpose**: Allow dynamic values (stream URL, page title, timestamp) to be inserted at API call time
- **Available placeholders**: `{{streamUrl}}`, `{{pageUrl}}`, `{{pageTitle}}`, `{{timestamp}}`
- **Error handling**: "Interpolation error" occurs when a placeholder is undefined or malformed
- **Examples**:
  - Endpoint template: `https://api.example.com/notify?url={{streamUrl}}`
  - Body template: `{"stream":"{{streamUrl}}","detected":"{{timestamp}}"}`

### 5. **Runtime Messages**
- **What**: Cross-component communication protocol via `browser.runtime.sendMessage()`
- **Where**: `RuntimeMessage` type in `src/background.ts`
- **Purpose**: Message-passing between content scripts, background worker, and popup
- **Message Types**:
  - `STREAM_DETECTED` (content → background): Reports newly detected stream URL with type
  - `GET_STREAMS` (popup → background): Requests all streams for current tab
  - `CALL_API` (popup → background): Triggers API call with stream data to configured endpoint
  - `PING` (popup → background): Health check to verify background worker is alive
  - `CLEAR_STREAMS` (popup → background): Clears stored streams for a tab

### Message Flow

The extension uses a message-driven architecture via `browser.runtime.sendMessage()`:

```
┌─────────────┐  STREAM_DETECTED   ┌────────────────┐  GET_STREAMS    ┌────────┐
│   Content   ├───────────────────>│   Background   │<────────────────┤ Popup  │
│   Script    │                    │     Worker     │                 │   UI   │
│ (detect.ts) │                    │ (background.ts)│─── Stores ───>  │        │
└─────────────┘                    └────────┬───────┘                 └────┬───┘
                                            │                               │
                                            │ CALL_API (triggered by user)  │
                                            │<──────────────────────────────┘
                                            │
                                            ▼
                                  ┌─────────────────┐
                                  │  API Endpoint   │
                                  │ (user-configured)│
                                  └─────────────────┘
```

**Message Types:**
- `STREAM_DETECTED` (content → background): Reports a newly detected stream URL with its type
- `GET_STREAMS` (popup → background): Requests all streams for the current tab
- `CALL_API` (popup → background): Triggers an API call with stream data to a configured endpoint
- `PING` (popup → background): Health check to verify background worker is alive
- `CLEAR_STREAMS` (popup → background): Clears stored streams for a tab

### Execution Flow

1. **Detection** (content script) → Scans page for stream URLs using detection patterns
2. **Storage** (background worker) → Stores detected streams per tab (max 200), updates badge
3. **Display** (popup UI) → Fetches and shows streams for the active tab
4. **Configuration** (options page) → User defines API endpoints with interpolation templates
5. **Invocation** (background worker) → Interpolates templates and calls configured endpoints on user action

## Privacy

*Stream call*:
- Only sends data to **your configured API endpoint**
- Does not track browsing history, neither collect or transmit data to 3rd parties
- Stores configuration locally in Firefox sync storage

## Mobile Firefox Nightly Support

**Current**: Extension works on desktop Firefox and mobile Firefox Nightly, with options page accessed separately from the webpage.

**Future (Phase 5+)**: A dedicated UI panel will allow API calls and diagnostics while viewing the original webpage on mobile (via injected content script UI), reusing the same Logger and StatusBar components.

## License

GPLv3 License - See LICENSE file for details.

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request
5. AI vibe-coding endorsed only with elaborate commit message (and notes/*).

## Support

For issues, questions, or suggestions:
- Open an issue on GitHub
- Check existing issues for solutions

## Changelog

### Version 1.0.0 (2025-12-12)
- Initial release
- Stream detection for common formats
- Configurable HTTP API integration
- Popup interface with stream list
- Options page for configuration
- Copy to clipboard functionality
- Badge notifications

---

Made with ❤️ for the streaming community
