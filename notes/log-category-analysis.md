# Log Category Analysis

**Status**: ✅ Validated (2025-12-23)

## Categories

| Category  | Count | Description |
|-----------|-------|-------------|
| apicall   | 22    | API call operations (HTTP requests/responses) |
| endpoint  | 17    | Endpoint CRUD (save/delete/toggle/preview) |
| storage   | 13    | Storage operations (load/save/export/import) |
| broker    | 8     | Background worker operations |
| messaging | 8     | Cross-component message passing |
| page      | 7     | Page script (stream detection) |
| hover     | 5     | Hover panel operations |
| popup     | 4     | Popup operations (init/refresh) |
| clipboard | 4     | Clipboard copy operations |

## Guidelines

- **Categories** = domain (what), **Levels** = severity (how important)
- **Emoji prefixing**: Logger auto-adds ❌ (error), ⚠️ (warn), ℹ️ (info) unless message already has emoji
- **Status bar**: Concise (<80 chars), excludes Debug level, no response bodies
- **Transient (infoFlash)**: Clipboard copy, navigation, form cleanup messages
- **Persistent (info)**: Final action results (saves, API calls, errors)
- **Response bodies**: Full JSON in debug logs, not status bar
- **Icons in messages**: Emojis come from message text (logger methods), not UI rendering

## Timeout Usage (Legitimate)

1. `popup.ts:208` - Delayed nav to options (2s) - UX for guided setup
2. `endpoint.ts:462` - Form cleanup (100ms) - Technical requirement
3. `page.ts:182` - Stream detection interval (2s) - Core feature

