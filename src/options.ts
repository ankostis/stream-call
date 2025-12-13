export {};

import { applyTemplate } from './template';
import { ApiPattern, suggestPatternName, validatePatterns } from './config';

const DEFAULT_CONFIG = {
  apiPatterns: JSON.stringify(
    [
      {
        name: 'example.com GET',
        endpointTemplate: 'https://api.example.com/record?url={{streamUrl}}&time={{timestamp}}',
        method: 'GET',
        includePageInfo: false
      },
      {
        name: 'example.com JSON POST',
        endpointTemplate: 'https://api.example.com/stream',
        method: 'POST',
        bodyTemplate:
          '{"streamUrl":"{{streamUrl}}","timestamp":"{{timestamp}}","pageUrl":"{{pageUrl}}","pageTitle":"{{pageTitle}}"}',
        includePageInfo: true
      },
      {
        name: 'Echo httpbin.org',
        endpointTemplate: 'https://httpbin.org/anything',
        method: 'POST',
        headers: { 'X-Test': 'stream-call' },
        bodyTemplate:
          '{"url":"{{streamUrl}}","title":"{{pageTitle}}","page":"{{pageUrl}}","time":"{{timestamp}}"}',
        includePageInfo: true
      }
    ],
    null,
    2
  )
} as const;

type Config = typeof DEFAULT_CONFIG;

let patterns: ApiPattern[] = [];
let editingIndex: number | null = null;
let pendingImportPatterns: ApiPattern[] = [];

const els = {
  alert: () => document.getElementById('alert'),
  patternsList: () => document.getElementById('patterns-list') as HTMLDivElement,
  patternsEmpty: () => document.getElementById('patterns-empty') as HTMLDivElement,
  editorCard: () => document.getElementById('editor-card') as HTMLDivElement,
  editorTitle: () => document.getElementById('editor-title') as HTMLHeadingElement,
  name: () => document.getElementById('pattern-name') as HTMLInputElement,
  method: () => document.getElementById('pattern-method') as HTMLSelectElement,
  endpoint: () => document.getElementById('pattern-endpoint') as HTMLInputElement,
  body: () => document.getElementById('pattern-body') as HTMLTextAreaElement,
  includePage: () => document.getElementById('pattern-include-page') as HTMLInputElement,
  headersRows: () => document.getElementById('headers-rows') as HTMLDivElement,
  preview: () => document.getElementById('preview') as HTMLDivElement
};

function showAlert(message: string, type: 'info' | 'success' | 'error' = 'info') {
  const alert = els.alert();
  if (!alert) return;

  alert.textContent = message;
  alert.className = `alert ${type}`;
  alert.style.display = 'block';

  if (type === 'success') {
    setTimeout(() => {
      alert.style.display = 'none';
    }, 5000);
  }
}

function addHeaderRow(key = '', value = '') {
  const row = document.createElement('div');
  row.className = 'header-row';

  const keyInput = document.createElement('input');
  keyInput.type = 'text';
  keyInput.placeholder = 'Header name';
  keyInput.value = key;

  const valueInput = document.createElement('input');
  valueInput.type = 'text';
  valueInput.placeholder = 'Header value';
  valueInput.value = value;

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'btn-secondary btn-danger';
  removeBtn.textContent = '✖';
  removeBtn.addEventListener('click', () => row.remove());

  row.appendChild(keyInput);
  row.appendChild(valueInput);
  row.appendChild(removeBtn);
  els.headersRows().appendChild(row);
}

function setHeadersRows(headers?: Record<string, string>) {
  els.headersRows().innerHTML = '';
  const entries = headers ? Object.entries(headers) : [];
  if (entries.length === 0) {
    addHeaderRow();
    return;
  }
  entries.forEach(([key, value]) => addHeaderRow(key, value));
}

function loadSettings() {
  browser.storage.sync
    .get(DEFAULT_CONFIG)
    .then((config) => {
      const validated = validatePatterns((config as Config).apiPatterns || '[]');
      patterns = validated.valid ? validated.parsed : [];
      renderList();
    })
    .catch((error) => {
      console.error('Failed to load settings:', error);
      showAlert('Failed to load settings', 'error');
    });
}

function renderList() {
  const list = els.patternsList();
  const emptyState = els.patternsEmpty();
  list.innerHTML = '';

  if (patterns.length === 0) {
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';

  patterns.forEach((pattern, index) => {
    const card = document.createElement('div');
    card.className = 'pattern-card';

    const title = document.createElement('h3');
    title.textContent = pattern.name;

    const meta = document.createElement('div');
    meta.className = 'pattern-meta';
    meta.textContent = `${(pattern.method || 'POST').toUpperCase()} → ${pattern.endpointTemplate}`;

    const pageInfo = document.createElement('div');
    pageInfo.className = 'pattern-meta';
    pageInfo.textContent = pattern.includePageInfo === false ? 'Page info: off' : 'Page info: on';

    const actions = document.createElement('div');
    actions.className = 'pattern-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'btn-ghost';
    editBtn.textContent = '✏️ Edit';
    editBtn.addEventListener('click', () => openEditor(index));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-secondary btn-danger';
    deleteBtn.textContent = '🗑 Delete';
    deleteBtn.addEventListener('click', () => deletePattern(index));

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);

    card.appendChild(title);
    card.appendChild(meta);
    card.appendChild(pageInfo);
    card.appendChild(actions);
    list.appendChild(card);
  });
}

function openEditor(index: number | null) {
  editingIndex = index;
  const pattern = index === null ? newPatternDefaults() : patterns[index];
  fillForm(pattern);
  els.editorTitle().textContent = index === null ? 'Add pattern' : 'Edit pattern';
  els.editorCard().style.display = 'block';
  els.preview().style.display = 'none';
}

function closeEditor() {
  editingIndex = null;
  els.editorCard().style.display = 'none';
  els.preview().style.display = 'none';
}

function fillForm(pattern: ApiPattern) {
  els.name().value = pattern.name || '';
  els.method().value = (pattern.method || 'POST').toUpperCase();
  els.endpoint().value = pattern.endpointTemplate || '';
  els.body().value = pattern.bodyTemplate || '';
  els.includePage().checked = pattern.includePageInfo !== false;
  setHeadersRows(pattern.headers);
}

function newPatternDefaults(): ApiPattern {
  return {
    name: '',
    endpointTemplate: '',
    method: 'POST',
    headers: {},
    bodyTemplate: '',
    includePageInfo: true
  };
}

function buildPatternFromForm(): ApiPattern | null {
  const nameRaw = els.name().value.trim();
  const endpoint = els.endpoint().value.trim();
  const method = els.method().value.trim().toUpperCase() || 'POST';
  const bodyTemplate = els.body().value.trim();
  const includePageInfo = els.includePage().checked;

  if (!endpoint) {
    showAlert('Endpoint URL is required', 'error');
    return null;
  }

  const headers: Record<string, string> = {};
  els.headersRows()
    .querySelectorAll('.header-row')
    .forEach((row) => {
      const [keyInput, valueInput] = Array.from(row.querySelectorAll('input')) as [
        HTMLInputElement,
        HTMLInputElement
      ];
      const key = keyInput.value.trim();
      const value = valueInput.value.trim();
      if (key) {
        headers[key] = value;
      }
    });

  const pattern: ApiPattern = {
    name: nameRaw || suggestPatternName(endpoint),
    endpointTemplate: endpoint,
    method,
    headers: Object.keys(headers).length ? headers : undefined,
    bodyTemplate: bodyTemplate || undefined,
    includePageInfo
  };

  return pattern;
}

function savePattern() {
  const candidate = buildPatternFromForm();
  if (!candidate) return;

  const updated = [...patterns];
  if (editingIndex === null) {
    updated.push(candidate);
  } else {
    updated[editingIndex] = candidate;
  }

  const validated = validatePatterns(JSON.stringify(updated));
  if (!validated.valid) {
    showAlert(validated.errorMessage || 'Invalid pattern', 'error');
    return;
  }

  patterns = validated.parsed;

  browser.storage.sync
    .set({ apiPatterns: validated.formatted })
    .then(() => {
      renderList();
      closeEditor();
      showAlert('✅ Pattern saved', 'success');
    })
    .catch((error) => {
      console.error('Failed to save pattern:', error);
      showAlert('Failed to save pattern', 'error');
    });
}

function deletePattern(index: number) {
  const pattern = patterns[index];
  if (!pattern) return;

  if (!confirm(`Delete pattern "${pattern.name}"?`)) {
    return;
  }

  const updated = patterns.filter((_, i) => i !== index);
  const validated = validatePatterns(JSON.stringify(updated));
  if (!validated.valid) {
    showAlert(validated.errorMessage || 'Failed to delete pattern', 'error');
    return;
  }

  patterns = validated.parsed;

  browser.storage.sync
    .set({ apiPatterns: validated.formatted })
    .then(() => {
      renderList();
      closeEditor();
      showAlert('Pattern deleted', 'success');
    })
    .catch((error) => {
      console.error('Failed to delete pattern:', error);
      showAlert('Failed to delete pattern', 'error');
    });
}

function previewPattern() {
  const candidate = buildPatternFromForm();
  if (!candidate) return;

  const context = {
    streamUrl: 'https://example.com/stream.m3u8',
    timestamp: new Date().toISOString(),
    pageUrl: candidate.includePageInfo ? 'https://example.com/page' : undefined,
    pageTitle: candidate.includePageInfo ? 'Example page' : undefined
  } as Record<string, unknown>;

  try {
    const endpoint = applyTemplate(candidate.endpointTemplate, context);
    const body = candidate.bodyTemplate
      ? applyTemplate(candidate.bodyTemplate, context)
      : JSON.stringify(
          candidate.includePageInfo
            ? context
            : { streamUrl: context.streamUrl, timestamp: context.timestamp },
          null,
          2
        );

    els.preview().style.display = 'block';
    els.preview().textContent = `Endpoint: ${endpoint}\nMethod: ${(candidate.method || 'POST').toUpperCase()}\n\nHeaders: ${JSON.stringify(
      candidate.headers || {},
      null,
      2
    )}\n\nBody:\n${body}`;
    showAlert('Preview generated', 'info');
  } catch (error: any) {
    showAlert(`Interpolation error: ${error?.message ?? 'Invalid placeholder'}`, 'error');
  }
}

function testAPI() {
  if (patterns.length === 0) {
    showAlert('Please add at least one pattern first', 'error');
    return;
  }

  const firstPattern = patterns[0];
  showAlert('Testing API connection...', 'info');

  const context = {
    streamUrl: 'https://example.com/test-stream.m3u8',
    timestamp: new Date().toISOString(),
    pageUrl: firstPattern.includePageInfo ? 'https://example.com/test-page' : undefined,
    pageTitle: firstPattern.includePageInfo ? 'Test Page - stream-call' : undefined
  } as Record<string, unknown>;

  let endpoint: string;
  let body: string | undefined;

  try {
    endpoint = applyTemplate(firstPattern.endpointTemplate, context);
    body = firstPattern.bodyTemplate
      ? applyTemplate(firstPattern.bodyTemplate, context)
      : JSON.stringify(
          firstPattern.includePageInfo
            ? context
            : { streamUrl: context.streamUrl, timestamp: context.timestamp }
        );
  } catch (templateError: any) {
    const availableFields = Object.keys(context).filter((k) => context[k] !== undefined).join(', ');
    showAlert(
      `❌ Interpolation error: ${templateError?.message ?? 'Invalid placeholder'}. Fields: ${availableFields}.`,
      'error'
    );
    return;
  }

  const method = (firstPattern.method || 'POST').toUpperCase();

  let headers: Record<string, string> | undefined = undefined;
  if (body) {
    headers = { 'Content-Type': 'application/json', ...(firstPattern.headers || {}) };
  } else if (firstPattern.headers) {
    headers = { ...firstPattern.headers };
  }

  fetch(endpoint, {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : body
  })
    .then((response) => {
      if (response.ok) {
        showAlert(`✅ API test successful! Status: ${response.status} ${response.statusText}`, 'success');
      } else {
        showAlert(`⚠️ API returned status ${response.status}: ${response.statusText}`, 'error');
      }
    })
    .catch((error) => {
      console.error('API test error:', error);
      showAlert(`❌ API test failed: ${error?.message ?? 'Unknown error'}`, 'error');
    });
}

function resetSettings() {
  if (!confirm('Reset patterns to defaults?')) return;
  const validated = validatePatterns(DEFAULT_CONFIG.apiPatterns);
  if (!validated.valid) {
    showAlert('Default config is invalid', 'error');
    return;
  }
  patterns = validated.parsed;
  browser.storage.sync
    .set({ apiPatterns: validated.formatted })
    .then(() => {
      renderList();
      closeEditor();
      showAlert('Defaults restored. Ready to save.', 'info');
    })
    .catch((error) => {
      console.error('Failed to reset settings:', error);
      showAlert('Failed to reset settings', 'error');
    });
}

function exportPatterns() {
  if (patterns.length === 0) {
    showAlert('No patterns to export', 'error');
    return;
  }

  const json = JSON.stringify(patterns, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `stream-call-patterns-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showAlert('✅ Patterns exported', 'success');
}

function handleFileSelect(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const content = event.target?.result as string;
      const parsed = JSON.parse(content);
      const validated = validatePatterns(JSON.stringify(parsed));

      if (!validated.valid) {
        showAlert(`Invalid file: ${validated.errorMessage}`, 'error');
        return;
      }

      pendingImportPatterns = validated.parsed;
      showImportModal();
    } catch (error: any) {
      showAlert(`Failed to read file: ${error?.message ?? 'Invalid JSON'}`, 'error');
    }
  };
  reader.readAsText(file);

  // Reset file input
  input.value = '';
}

function showImportModal() {
  const modal = document.getElementById('import-modal') as HTMLDivElement;
  const preview = document.getElementById('import-preview') as HTMLDivElement;

  const dupes = pendingImportPatterns.filter((p) => patterns.some((existing) => existing.name === p.name));
  const newPatterns = pendingImportPatterns.filter((p) => !patterns.some((existing) => existing.name === p.name));

  let previewText = `Importing ${pendingImportPatterns.length} pattern(s):\n\n`;
  if (newPatterns.length > 0) {
    previewText += `New patterns:\n${newPatterns.map((p) => `  • ${p.name}`).join('\n')}\n\n`;
  }
  if (dupes.length > 0) {
    previewText += `Duplicate names (will be updated if merging):\n${dupes.map((p) => `  • ${p.name}`).join('\n')}`;
  }

  preview.textContent = previewText;
  modal.style.display = 'flex';
}

function closeImportModal() {
  const modal = document.getElementById('import-modal') as HTMLDivElement;
  modal.style.display = 'none';
  pendingImportPatterns = [];
}

function performImport(merge: boolean) {
  const updated = merge
    ? [
        ...patterns.filter((p) => !pendingImportPatterns.some((imported) => imported.name === p.name)),
        ...pendingImportPatterns
      ]
    : pendingImportPatterns;

  const validated = validatePatterns(JSON.stringify(updated));
  if (!validated.valid) {
    showAlert(`Invalid import: ${validated.errorMessage}`, 'error');
    return;
  }

  patterns = validated.parsed;

  browser.storage.sync
    .set({ apiPatterns: validated.formatted })
    .then(() => {
      renderList();
      closeImportModal();
      showAlert(merge ? '✅ Patterns merged' : '✅ Patterns replaced', 'success');
    })
    .catch((error) => {
      console.error('Failed to import patterns:', error);
      showAlert('Failed to import patterns', 'error');
    });
}

function wireEvents() {
  document.getElementById('add-pattern-btn')?.addEventListener('click', () => openEditor(null));
  document.getElementById('save-pattern-btn')?.addEventListener('click', savePattern);
  document.getElementById('cancel-edit-btn')?.addEventListener('click', closeEditor);
  document.getElementById('preview-btn')?.addEventListener('click', previewPattern);
  document.getElementById('add-header-row')?.addEventListener('click', () => addHeaderRow());
  document.getElementById('test-btn')?.addEventListener('click', testAPI);
  document.getElementById('reset-btn')?.addEventListener('click', resetSettings);
  document.getElementById('export-btn')?.addEventListener('click', exportPatterns);
  document.getElementById('import-btn')?.addEventListener('click', () => {
    (document.getElementById('import-file-input') as HTMLInputElement).click();
  });
  document.getElementById('import-file-input')?.addEventListener('change', handleFileSelect);
  document.getElementById('import-merge-btn')?.addEventListener('click', () => performImport(true));
  document.getElementById('import-replace-btn')?.addEventListener('click', () => performImport(false));
  document.getElementById('import-cancel-btn')?.addEventListener('click', closeImportModal);
  els.endpoint().addEventListener('blur', () => {
    if (!els.name().value.trim() && els.endpoint().value.trim()) {
      els.name().value = suggestPatternName(els.endpoint().value.trim());
    }
  });
}

function initialize() {
  loadSettings();
  wireEvents();
  setHeadersRows();
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', initialize);
}
