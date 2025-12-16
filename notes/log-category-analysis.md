# Log Category Analysis

**Status**: ✅ Unified and validated (as of 2025-12-16)

## Summary

- **10 categories** used consistently by both Logger (audit trail) and StatusBar (UI feedback)
- **61 total logging calls** across all components (21 Logger, 40 StatusBar)
- **14 legacy console calls** in endpoint.ts (13) and hover-panel.ts (1) - to be migrated
- **Categories are domain-specific** (what), **levels are severity-specific** (how important)
- All logger calls verified for correct API usage
- No duplicate statusBar+logger pairs (cleaned up 4 in popup.ts)

## Category Usage

| Category  | Count | Status | Description |
|-----------|-------|--------|-------------|
| endpoint  |   15 | ✅ | Endpoint operations (config/validation/save/delete) |
| apicall   |   10 | ✅ | API call operations (HTTP requests/responses/testing) |
| storage   |    9 | ✅ | Storage operations (load/save/reset/export/import/initialization) |
| popup     |    7 | ✅ | Popup component operations (initialization/refresh/UI actions) |
| page      |    6 | ✅ | Page script operations (stream detection/player detection/UI injection) |
| background|    6 | ✅ | Background worker operations (stream management/tab lifecycle/initialization) |
| messaging |    5 | ✅ | Cross-component message passing (GET_STREAMS/CALL_API/PING) |
| stat      |    3 | ✅ | General status/progress messages |
| interpolation| 2 | ✅ | Template placeholder interpolation |
| clipboard |    2 | ✅ | Clipboard copy operations |

## Breakdown by Component

| Component | Logger Calls | StatusBar Calls | Total |
|-----------|:------------:|:---------------:|:-----:|
| options.ts |      0      |       27        |   27  |
| popup.ts   |      5      |       13        |   18  |
| background.ts |   10     |        0        |   10  |
| page.ts    |      6      |        0        |    6  |
| **Total**  |   **21**    |     **40**      | **61**|

**Note**: Each execution context (background, page, popup, options) has its own isolated Logger instance with separate circular buffers.

## Consolidation History

**Phase 1**: Removed redundant `-error`/`-warning` suffixes (28+ occurrences)
- ❌ Before: `endpoint-error`, `storage-error`, `api-error`
- ✅ After: `endpoint`, `storage`, `apicall` (level specified separately via `LogLevel`)

**Phase 2**: Consolidated component-specific categories
- `config`, `form` → `endpoint`
- `api`, `api-status`, `api-call` → `apicall`
- `init`, `refresh`, `ui-action` → `popup`
- `stream-detection`, `player-detection`, `ui-injection`, `initialization` → `page`
- `storage-info` → `storage`
- `last-action` → distributed to domain categories

**Phase 3**: Added Logger to background.ts
- New `background` category for worker operations
- Expanded `messaging` for cross-context communication

**Phase 4**: Fixed Logger API bugs in page.ts
- ❌ Before: `logger.info(LogLevel.Info, 'page', 'msg')` - wrong signature
- ✅ After: `logger.info('page', 'msg')` - convenience methods already know their level

**Phase 5**: Removed duplicate logging in popup.ts (4 pairs)
- StatusBar with `setLogger()` already logs internally, so consecutive statusBar+logger calls are redundant
- Consolidated by merging variable details (URL, endpoint, response) into statusBar messages
- **Removed**: 4 redundant logger calls (debug×2, info×2) → down from 25 to 21 total logger calls

**Rationale**:
- Categories describe **domain** (what you're logging about)
- Levels describe **severity** (how important it is)
- No hyphens for consistency
- Same categories for Logger and StatusBar

## API Patterns

### Logger (Audit Trail)
```typescript
// Convenience methods (level implicit)
logger.debug('category', 'message', ...args)
logger.info('category', 'message', ...args)
logger.warn('category', 'message', ...args)
logger.error('category', 'message', ...args)

// Generic method (level explicit)
logger.log(LogLevel.Info, 'category', 'message', ...args)
```

### StatusBar (UI Feedback)
```typescript
// Persistent message (stays until replaced/cleared)
statusBar.post(LogLevel.Error, 'category', 'message', optionalError)

// Transient message (auto-clears after timeout)
statusBar.flash(LogLevel.Info, 'category', 3000, 'message')
```

## Legacy Console Calls (To Migrate)

**endpoint.ts (13 calls)**:
- `openEndpointInTab()`: 4 calls (1 log, 3 error)
- `callEndpointAPI()`: 9 calls (3 log, 1 warn, 5 error)

**hover-panel.ts (1 call)**:
- WIP stub: 1 log

These predate Logger/StatusBar infrastructure (introduced Dec 10-15, 2025). Should be migrated to proper logging.

## Validation

✅ All logger calls verified for correct API usage
✅ No instances of `logger.method(LogLevel.XXX, 'category', ...)` pattern found
✅ All 95 unit tests pass
✅ Integration tests pass
⚠️ 14 legacy console calls remain (not using Logger/StatusBar)
