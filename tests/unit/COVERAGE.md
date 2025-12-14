# Unit Test Coverage: Would it have caught the bug?

## Yes! Here's the proof:

### The Bug
**File:** `src/background.ts` lines 54-62

**Buggy Code:**
```typescript
if (message.type === 'STREAM_DETECTED') {
  const tabId = sender.tab?.id;
  if (tabId === undefined) {
    return { success: false, error: 'No tab context...' };
    tabStreams.set(tabId, []);  // ❌ WRONG: Inside error block!
  }
  
  const streams = tabStreams.get(tabId)!;  // ❌ Crashes! undefined
  const exists = streams.some(...);        // ❌ Error: can't access "some"
}
```

### The Test That Would Catch It

**File:** `tests/unit/background.test.ts`

```typescript
test('STREAM_DETECTED: initializes stream array on first detection', async () => {
  tabStreams.clear();

  const message = {
    type: 'STREAM_DETECTED',
    url: 'https://example.com/stream.m3u8',
    streamType: 'HLS',
  };

  const sender = {
    tab: { id: 1, url: 'https://example.com', title: 'Test' },
  };

  const result = await handleMessage(message, sender);
  
  // ❌ WOULD FAIL WITH BUGGY CODE:
  // TypeError: can't access property "some", streams is undefined
  assert.equal(result.success, true);
  assert.equal(tabStreams.get(1)!.length, 1);  // ❌ Would throw
});
```

### What Happens With Buggy Code

1. **Test runs** with fresh state (`tabStreams.clear()`)
2. **Message sent** with valid `tabId: 1`
3. **Bug triggers:**
   - `tabId !== undefined`, so skips error return
   - But `tabStreams.set()` was inside the if block!
   - `tabStreams.get(1)` returns `undefined`
   - `streams.some()` crashes: **"can't access property 'some'"**
4. **Test fails** with same error user saw! ✅

### Current Test Coverage

**Before (87 tests):**
- ❌ No background.ts tests
- ❌ Message handler logic untested
- ❌ Stream storage untested

**After (96 tests):**
- ✅ 9 new background.ts tests
- ✅ Message handler logic covered
- ✅ Stream initialization tested
- ✅ Duplicate detection tested
- ✅ Error cases tested

### Test Commands

```bash
# Run all tests (including new background tests)
npm test

# Tests now verify:
✓ STREAM_DETECTED: initializes stream array on first detection
✓ STREAM_DETECTED: adds stream to existing array
✓ STREAM_DETECTED: prevents duplicate streams
✓ STREAM_DETECTED: handles missing tab context
✓ GET_STREAMS: returns streams for tab
✓ GET_STREAMS: returns empty array for unknown tab
✓ CLEAR_STREAMS: removes streams for tab
✓ PING: responds with pong
✓ STREAM_DETECTED: captures page context
```

### Key Takeaway

**Yes, a unit test would have caught this bug!** The test would have failed with the exact same error message the user saw:

```
Error: can't access property "some", streams is undefined
```

This is why comprehensive unit test coverage is important—it catches bugs before they reach users.

### Test Coverage Gap Closed

The bug existed because:
1. Background script had no unit tests
2. Message handlers were untested
3. State initialization logic was untested

Now with `background.test.ts`:
- ✅ All message handlers tested
- ✅ State initialization verified
- ✅ Error cases covered
- ✅ Integration between handlers validated

**Lesson:** Always test message handlers and stateful logic!
