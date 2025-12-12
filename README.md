# 🎵 Stream call

A Firefox browser extension that detects streaming media (podcasts, radio stations, live streams) on web pages and sends the stream URLs to a configurable HTTP API endpoint.

## Features

- 🔍 **Automatic Stream Detection** - Detects HLS, DASH, MP3, AAC, OGG, RTMP, RTSP, Icecast, Shoutcast, and more
- 📡 **HTTP API Integration** - Send detected stream URLs to your own API endpoint
- ⚙️ **Fully Configurable** - Set custom API endpoint, HTTP method, and headers
- 🎯 **Clean UI** - Simple popup interface showing all detected streams
- 📋 **Copy URLs** - Quick copy stream URLs to clipboard
- 🔔 **Badge Notifications** - Shows number of detected streams on the extension icon

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
5. Navigate to the extension folder and select the `manifest.json` file (expects built assets in `dist/`)
6. Generate icons by opening `icons/generate-icons.html` in a browser and downloading them (only needed if you change the icon)

### For Production

Build and package (includes dist + manifest + icons):
```bash
npm run build
zip -r stream-call.zip manifest.json dist icons -x "icons/generate-icons.html"
```

Then submit to [Firefox Add-ons](https://addons.mozilla.org/).

## Usage

### 1. Configure the API Endpoint

1. Click the Stream call icon in your Firefox toolbar
2. Click the "⚙️ Options" button
3. Either set a single API endpoint URL (e.g., `https://your-server.com/api/stream`) **or** define API patterns (JSON array) that can template the stream URL into the endpoint/body.
4. Optionally configure:
  - HTTP method (POST, PUT, PATCH)
  - Custom headers (JSON format)
  - Whether to include page information
  - API patterns with `{{placeholders}}` for `streamUrl`, `pageUrl`, `pageTitle`, `timestamp`
5. Click "💾 Save Settings"
6. Click "🧪 Test API" to verify the connection

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

The extension sends the following JSON payload to your API endpoint:

```json
{
  "streamUrl": "https://stream.example.com/audio.m3u8",
  "timestamp": "2025-12-12T10:30:00.000Z",
  "pageUrl": "https://www.example.com/listen",
  "pageTitle": "Example Radio Station"
}
```

**Note:** `pageUrl` and `pageTitle` are only included if enabled in options.

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
    ├── manifest.json          # Extension manifest (references built assets in dist/)
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
    ├── options.html           # Source options page UI (copied to dist/ on build)
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

## Privacy

Stream call:
- Only sends data to **your configured API endpoint**
- Does not collect or transmit data to any third parties
- Stores configuration locally in Firefox sync storage
- Does not track browsing history

## License

GPLv3 License - See LICENSE file for details.

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

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
