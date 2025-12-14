# Exception Handling Policy

## Core Principles

- DON'T swallow exceptions - let them bubble to console via logger/stausbar.
- Handle exception early when fail cause is known or where remedy is possible.

### 1. Don't Swallow Exceptions at the Source
**Default behavior**: Let exceptions bubble up to be consumed by the real caller.
- Exceptions contain critical diagnostic information (stack traces, error types, contexts)
- Swallowing them hides bugs and makes debugging impossible
- Only handle exceptions where you can meaningfully recover

### 2. Exception Handling by Context

#### a) Options Page (with visible logger-box)
- **Rule**: Final exception handler MUST use logging machinery (Logger/StatusBar)
- **Rationale**: Users can see errors and diagnose configuration issues
- **Pattern**:
  ```typescript
  try {
    // risky operation
  } catch (error) {
    statusBar.post(LogLevel.Error, 'category', 'User-friendly message', error);
    // Don't rethrow - error is shown to user via UI
  }
  ```

#### b) Inside Loops
- **Rule**: Catch exceptions, log as warning, continue loop (when it must)
- **Rationale**: One bad item shouldn't break entire batch processing
- **Pattern**:
  ```typescript
  for (const item of items) {
    try {
      processItem(item);
    } catch (error) {
      logger.post(LogLevel.Warn, 'category', 'Failed to process item:', item, error);
      // Continue with next item
    }
  }
  ```

#### c) Background/Popup (no driving UI)
- **Rule**: Let exceptions bubble up to console
- **Rationale**: Browser DevTools is the diagnostic interface
- **Pattern**:
  ```typescript
  async function operation() {
    // No try-catch unless you can meaningfully recover
    const result = await riskyOperation(); // Let it throw
    return result;
  }
  ```

#### d) Known Recoverable Errors
- **Rule**: Handle locally only if:
  1. You know the cause
  2. You can recover gracefully
  3. Functionality is not affected
- **Examples**:
  - Invalid URL → return false (detection check)
  - JSON parse error → provide validation message (config validation)
  - Empty storage on first run → use defaults

### 3. Anti-Patterns to Avoid

❌ **Silent swallowing**:
```typescript
try {
  await riskyOperation();
} catch (error) {
  // Nothing - error disappears!
}
```

❌ **Generic error messages without context**:
```typescript
catch (error) {
  statusBar.post(LogLevel.Error, 'error', 'Failed to load settings'); // No error details!
}
```

❌ **Catching when you can't recover**:
```typescript
try {
  const required = await fetchRequired();
  return processRequired(required);
} catch (error) {
  console.error('Failed:', error);
  return null; // What should caller do with null?
}
```

### 4. Good Patterns

✅ **Options page with user feedback**:
```typescript
browser.storage.sync.get(DEFAULT_CONFIG)
  .then((config) => {
    // Process config
  })
  .catch((error) => {
    statusBar.post(LogLevel.Error, 'storage-error', 'Failed to load settings', error);
    // Error shown to user, they can investigate
  });
```

✅ **Known recoverable case**:
```typescript
function isStreamUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return PATTERNS.some(p => p.test(urlObj.href));
  } catch {
    return false; // Invalid URL is expected case, not an error
  }
}
```

✅ **Bubble up with context**:
```typescript
async function parseConfig(json: string): Promise<Config> {
  try {
    return JSON.parse(json);
  } catch (error) {
    throw new Error(`Invalid config JSON: ${error.message}`);
    // Rethrow with added context
  }
}
```

### 5. Implementation Checklist

When reviewing exception handling:

1. ☐ Is this a known recoverable case? (e.g., invalid URL check)
   - YES → Handle locally, return safe value
   - NO → Continue to #2

2. ☐ Are we in a loop processing multiple items?
   - YES → Catch, log warning, continue
   - NO → Continue to #3

3. ☐ Is this the options page with visible logger?
   - YES → Catch at top level, use statusBar.post()
   - NO → Continue to #4

4. ☐ Can we meaningfully recover from this error?
   - YES → Handle and recover
   - NO → Let it bubble up to console

## Examples from Codebase

### Good: Detection with expected failures
```typescript
export function isStreamUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return PATTERNS.some(p => p.test(urlObj.href));
  } catch {
    return false; // Invalid URL is not exceptional
  }
}
```

### Good: Options page error with user feedback
```typescript
function testAPI() {
  fetch(endpoint, { method, headers, body })
    .then((response) => {
      if (response.ok) {
        statusBar.flash(LogLevel.Info, 'last-action', 3000, '✅ Success');
      } else {
        statusBar.post(LogLevel.Warn, 'api-error', `API returned ${response.status}`);
      }
    })
    .catch((error) => {
      statusBar.post(LogLevel.Error, 'api-error', 'API test failed', error);
    });
}
```

### Bad: Swallowing in background without recourse
```typescript
// DON'T DO THIS
try {
  const important = await fetchImportantData();
  processImportantData(important);
} catch (error) {
  console.error('Failed:', error);
  // Now what? User has no idea this failed!
}
```

## Migration Guide

When refactoring existing code:

1. Identify all try-catch blocks
2. For each catch block:
   - Is the error shown to the user? (options page)
   - Is this inside a loop? (add warning log)
   - Is this a known safe failure? (e.g., URL validation)
   - Otherwise: Remove try-catch, let it bubble

3. Test that:
   - Options page shows errors in logger-box
   - Console shows uncaught errors with full stacks
   - Known safe failures don't spam console
