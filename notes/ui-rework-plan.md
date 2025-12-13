# Options UI Rework Plan: User-Friendly Pattern Editor

## Current State
- **options.html**: Single `<textarea>` with raw JSON
- **options.ts**: Users must manually edit JSON strings with proper escaping
- **Pain points**:
  - Non-technical users struggle with JSON syntax
  - Backslash escaping required for body templates
  - No visual feedback or form validation until save
  - No pattern preview or test before adding

## Proposed Solution: Form-Based Pattern Editor

### 1. UI Structure (options.html)
Replace raw JSON textarea with:
- **List view**: Card-based display of existing patterns
  - Each pattern shows: name, method, endpoint (truncated with tooltip)
  - Edit/Delete buttons per pattern
- **Add Pattern button**: Opens modal with form
- **Edit modal form**: 
  - Name (text)
  - HTTP Method (dropdown: GET/POST/PUT/PATCH)
  - Endpoint URL (text with placeholder hints)
  - Body Template (textarea, optional)
  - Custom Headers (key-value pairs, optional)
  - Include Page Info checkbox
  - Preview/Test button before saving
  - Save/Cancel buttons
- **Optional**: Accordion to show/edit raw JSON as fallback

### 2. Logic Changes (options.ts)
New functions needed:
- `renderPatternsList()`: Display cards from parsed patterns
- `openEditModal(patternId?)`: Open form for new or existing pattern
- `savePattern(formData)`: Convert form data to ApiPattern
- `deletePattern(id)`: Remove pattern with confirmation
- `previewPattern(formData)`: Show templated request before saving
- Migrate from storage-only JSON to in-memory editing, then commit back to storage

### 3. Data Flow
1. Load patterns from storage via `parsePatterns()`
2. Keep in-memory array for editing session
3. Form edits modify in-memory array
4. Save commits entire array back to storage as JSON (existing flow)
5. Reset reverts in-memory state back to storage

### 4. Implementation Strategy
**Phase 1: Core form UI**
- Create modal HTML structure
- Add pattern form with all fields
- Style to match existing extension UI

**Phase 2: Render and edit logic**
- `renderPatternsList()` from parsed patterns
- Form → ApiPattern conversion in `savePattern()`
- Edit modal population from existing pattern

**Phase 3: Validation and preview**
- Form validation (required fields, endpoint URL format)
- Preview button calls `applyTemplate()` to show rendered request
- Display preview modal with formatted endpoint + body

**Phase 4: Polish**
- Add/edit/delete confirmation dialogs
- Keyboard navigation (Esc to close modal)
- Success feedback on pattern save
- Raw JSON fallback for power users

### 5. Benefits
✅ **Reduced friction**: No JSON required for basic users
✅ **Validation**: Catch issues before saving
✅ **Preview**: See templated values before committing
✅ **Discoverability**: All fields visible in form (vs. JSON)
✅ **Backward compatible**: Still stores/loads JSON, just UI improved

### 6. Testing Additions Needed
- Unit: Form input → ApiPattern serialization
- Integration: Full edit cycle (add, modify, delete)
- Edge cases: Escaping in templates, special chars in headers

### 7. Timeline
- **Core form + list rendering**: ~2-3 hours
- **Validation + preview**: ~1 hour
- **Polish + edge cases**: ~1 hour
- **Total estimated**: 4-5 hours of focused work

## Next Steps
1. Create `PatternEditor` interface/types in config.ts
2. Extend options.html with modal structure
3. Implement renderPatternsList() and modal logic
4. Test add/edit/delete flows
5. Add integration test for options UI workflow

