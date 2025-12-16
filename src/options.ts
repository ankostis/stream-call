/**
 * stream-call options Script to define & CRUD endpoints (extension-context)
 */
export {};

import { Logger, LogLevel, StatusBar } from './logger';
import { createLogAppender, createStatusRenderer, applyLogFiltering } from './logging-ui';
import { applyTemplate, ApiEndpoint, suggestEndpointName, validateEndpoints, DEFAULT_CONFIG, getBuiltInEndpoints, callEndpointAPI } from './endpoint';

type Config = typeof DEFAULT_CONFIG;

let endpoints: ApiEndpoint[] = [];
let editingIndex: number | null = null;
let pendingImportEndpoints: ApiEndpoint[] = [];

const els = {
  alert: () => document.getElementById('alert'),
  statusBar: () => document.getElementById('status-bar') as HTMLDivElement,
  statusIcon: () => document.getElementById('status-icon') as HTMLSpanElement,
  statusMsg: () => document.getElementById('status-message') as HTMLSpanElement,
  endpointsList: () => document.getElementById('endpoints-list') as HTMLDivElement,
  endpointsEmpty: () => document.getElementById('endpoints-empty') as HTMLDivElement,
  editorCard: () => document.getElementById('editor-card') as HTMLDivElement,
  editorTitle: () => document.getElementById('editor-title') as HTMLHeadingElement,
  saveBtn: () => document.getElementById('save-endpoint-btn') as HTMLButtonElement,
  saveNewBtn: () => document.getElementById('save-new-btn') as HTMLButtonElement,
  name: () => document.getElementById('endpoint-name') as HTMLInputElement,
  method: () => document.getElementById('endpoint-method') as HTMLSelectElement,
  endpoint: () => document.getElementById('endpoint-endpoint') as HTMLInputElement,
  body: () => document.getElementById('endpoint-body') as HTMLTextAreaElement,
  includeCookies: () => document.getElementById('endpoint-include-cookies') as HTMLInputElement,
  includeHeaders: () => document.getElementById('endpoint-include-headers') as HTMLInputElement,
  headersRows: () => document.getElementById('headers-rows') as HTMLDivElement,
  preview: () => document.getElementById('preview') as HTMLDivElement,
  logViewer: () => document.getElementById('log-viewer') as HTMLDivElement,
  logClear: () => document.getElementById('log-clear') as HTMLButtonElement,
  logExport: () => document.getElementById('log-export') as HTMLButtonElement
};

// Logging utilities
const logger = new Logger();
const statusBar = new StatusBar();
statusBar.setLogger(logger);

// UI helpers
const renderStatus = createStatusRenderer({
  bar: els.statusBar(),
  icon: els.statusIcon(),
  message: els.statusMsg()
});
statusBar.subscribe((current) => renderStatus(current ? { level: current.level, message: current.message } : null));

const appendLog = createLogAppender(els.logViewer());
logger.subscribe((entries) => {
  entries.slice(-1).forEach((e) => appendLog(e.level, e.category as any, e.message));
});

// Remove showAlert indirection: callers should use statusBar/logger directly.

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
  entries.forEach(([key, value]) => addHeaderRow(key, value));
}

function loadSettings() {
  browser.storage.sync
    .get(DEFAULT_CONFIG)
    .then((config) => {
      const validated = validateEndpoints((config as Config).apiEndpoints || '[]');
      endpoints = validated.valid ? validated.parsed : [];
      renderList();
      if (endpoints.length === 0) {
        statusBar.post(LogLevel.Info, 'storage', 'No API endpoints configured yet. Add your first endpoint below.');
      }
    })
    .catch((error) => {
      // Actual storage errors (not empty storage on first run)
      statusBar.post(LogLevel.Error, 'storage', 'Failed to access browser storage', error);
    });
}

function renderList() {
  const list = els.endpointsList();
  const emptyState = els.endpointsEmpty();
  list.innerHTML = '';

  if (endpoints.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  endpoints.forEach((endpoint, index) => {
    const item = document.createElement('div');
    item.className = 'endpoint-item';
    if (endpoint.active === false) item.classList.add('inactive');

    // Header row: active checkbox + name + actions
    const header = document.createElement('div');
    header.className = 'endpoint-header';

    const activeCheckbox = document.createElement('input');
    activeCheckbox.type = 'checkbox';
    activeCheckbox.className = 'endpoint-active';
    activeCheckbox.checked = endpoint.active !== false;
    activeCheckbox.title = 'Active (shown in popup)';
    activeCheckbox.addEventListener('change', () => toggleEndpointActive(index));

    const name = document.createElement('span');
    name.className = 'endpoint-name';
    name.textContent = endpoint.name;
    name.title = 'Click to edit';
    name.style.cursor = 'pointer';
    name.addEventListener('click', () => openEditor(index));

    const actionsSpan = document.createElement('span');
    actionsSpan.className = 'endpoint-actions';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-icon btn-danger';
    deleteBtn.textContent = '🗑️';
    deleteBtn.title = 'Delete';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteEndpoint(index);
    });

    actionsSpan.appendChild(deleteBtn);

    header.appendChild(activeCheckbox);
    header.appendChild(name);
    header.appendChild(actionsSpan);

    // Summary row: method + url + headers count + flags
    const summary = document.createElement('div');
    summary.className = 'endpoint-summary';
    const method = (endpoint.method || 'POST').toUpperCase();
    const headersCount = endpoint.headers ? Object.keys(endpoint.headers).length : 0;
    const flags = [];
    if (endpoint.includeCookies) flags.push('🍪');
    if (endpoint.includePageHeaders) flags.push('📋');
    if (endpoint.bodyTemplate) flags.push('📄');
    const flagsStr = flags.length ? ` ${flags.join(' ')}` : '';
    summary.textContent = `${method} → ${endpoint.endpointTemplate}${headersCount > 0 ? ` [${headersCount} headers]` : ''}${flagsStr}`;
    summary.title = `${method} ${endpoint.endpointTemplate}`;

    item.appendChild(header);
    item.appendChild(summary);
    list.appendChild(item);
  });
}

function toggleEndpointActive(index: number) {
  endpoints[index].active = !endpoints[index].active;
  const validated = validateEndpoints(JSON.stringify(endpoints));
  if (!validated.valid) {
    statusBar.post(LogLevel.Error, 'endpoint', 'Failed to update endpoint state');
    return;
  }
  browser.storage.sync
    .set({ apiEndpoints: validated.formatted })
    .then(() => {
      renderList();
      statusBar.flash(LogLevel.Info, 'endpoint', 1000, endpoints[index].active ? '✅ Activated' : '⏸️ Deactivated');
    })
    .catch((error) => {
      statusBar.post(LogLevel.Error, 'storage', 'Failed to save endpoint state', error);
    });
}

function openEditor(index: number | null) {
  editingIndex = index;
  const endpoint = index === null ? newEndpointDefaults() : endpoints[index];
  fillForm(endpoint);

  if (index === null) {
    els.editorTitle().textContent = 'Add API endpoint';
    els.saveBtn().textContent = '💾 Save';
    els.saveNewBtn().style.display = 'none';
  } else {
    els.editorTitle().textContent = 'Edit API endpoint';
    els.saveBtn().textContent = '💾 Save';
    els.saveNewBtn().style.display = 'inline-block';
  }
}

function closeEditor() {
  editingIndex = null;
  fillForm(newEndpointDefaults());
  els.editorTitle().textContent = 'Add API endpoint';
  els.saveBtn().textContent = '💾 Save';
  els.saveNewBtn().style.display = 'none';
}

function fillForm(endpoint: ApiEndpoint) {
  els.name().value = endpoint.name || '';
  els.method().value = (endpoint.method || 'POST').toUpperCase();
  els.endpoint().value = endpoint.endpointTemplate || '';
  els.body().value = endpoint.bodyTemplate || '';
  els.includeCookies().checked = endpoint.includeCookies === true;
  els.includeHeaders().checked = endpoint.includePageHeaders === true;
  setHeadersRows(endpoint.headers);
}

function newEndpointDefaults(): ApiEndpoint {
  return {
    name: '',
    endpointTemplate: '',
    method: 'POST',
    headers: {},
    bodyTemplate: '',
    includeCookies: false,
    includePageHeaders: false
  };
}

function buildEndpointFromForm(): ApiEndpoint | null {
  const nameRaw = els.name().value.trim();
  const endpoint = els.endpoint().value.trim();
  const method = els.method().value.trim().toUpperCase() || 'POST';
  const bodyTemplate = els.body().value.trim();
  const includeCookies = els.includeCookies().checked;
  const includePageHeaders = els.includeHeaders().checked;

  if (!endpoint) {
    statusBar.post(LogLevel.Error, 'endpoint', 'Endpoint URL is required');
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

  const apiEndpoint: ApiEndpoint = {
    name: nameRaw || suggestEndpointName(endpoint),
    endpointTemplate: endpoint,
    method,
    headers: Object.keys(headers).length ? headers : undefined,
    bodyTemplate: bodyTemplate || undefined,
    includeCookies,
    includePageHeaders,
    active: editingIndex !== null ? endpoints[editingIndex].active : true
  };

  return apiEndpoint;
}

function saveEndpoint() {
  const candidate = buildEndpointFromForm();
  if (!candidate) return;

  const updated = [...endpoints];
  if (editingIndex === null) {
    updated.push(candidate);
  } else {
    updated[editingIndex] = candidate;
  }

  const validated = validateEndpoints(JSON.stringify(updated));
  if (!validated.valid) {
    statusBar.post(LogLevel.Error, 'endpoint', validated.errorMessage || 'Invalid API endpoint');
    return;
  }

  endpoints = validated.parsed;

  browser.storage.sync
    .set({ apiEndpoints: validated.formatted })
    .then(() => {
      renderList();
      statusBar.flash(LogLevel.Info, 'endpoint', 3000, '✅ Saved');
    })
    .catch((error) => {
      statusBar.post(LogLevel.Error, 'storage', 'Failed to save API endpoint', error);
    });
}

function saveAsNew() {
  if (editingIndex === null) {
    // If not editing, just use regular save
    saveEndpoint();
    return;
  }

  const candidate = buildEndpointFromForm();
  if (!candidate) return;

  // Generate unique name by appending counter
  let baseName = candidate.name || 'endpoint';
  let newName = baseName;
  let counter = 2;
  const existingNames = new Set(endpoints.map(e => e.name));

  while (existingNames.has(newName)) {
    newName = `${baseName}-${counter}`;
    counter++;
  }

  candidate.name = newName;
  const updated = [...endpoints, candidate];

  const validated = validateEndpoints(JSON.stringify(updated));
  if (!validated.valid) {
    statusBar.post(LogLevel.Error, 'endpoint', validated.errorMessage || 'Invalid API endpoint');
    return;
  }

  endpoints = validated.parsed;

  browser.storage.sync
    .set({ apiEndpoints: validated.formatted })
    .then(() => {
      renderList();
      statusBar.flash(LogLevel.Info, 'endpoint', 3000, `✅ Saved as "${newName}"`);
    })
    .catch((error) => {
      statusBar.post(LogLevel.Error, 'storage', 'Failed to save API endpoint', error);
    });
}

function deleteEndpoint(index: number) {
  const endpoint = endpoints[index];
  if (!endpoint) return;

  if (!confirm(`Delete API endpoint "${endpoint.name}"?`)) {
    return;
  }

  const updated = endpoints.filter((_, i) => i !== index);
  const validated = validateEndpoints(JSON.stringify(updated));
  if (!validated.valid) {
    statusBar.post(LogLevel.Error, 'endpoint', validated.errorMessage || 'Failed to delete API endpoint');
    return;
  }

  endpoints = validated.parsed;

  browser.storage.sync
    .set({ apiEndpoints: validated.formatted })
    .then(() => {
      renderList();
      closeEditor();
      statusBar.flash(LogLevel.Info, 'endpoint', 3000, 'API endpoint deleted');
    })
    .catch((error) => {
      statusBar.post(LogLevel.Error, 'storage', 'Failed to delete API endpoint', error);
    });
}

function previewEndpoint() {
  const candidate = buildEndpointFromForm();
  if (!candidate) return;

  const context = {
    streamUrl: 'https://example.com/stream.m3u8',
    timestamp: new Date().toISOString(),
    pageUrl: 'https://example.com/page',
    pageTitle: 'Example page'
  } as Record<string, unknown>;

  try {
    const endpoint = applyTemplate(candidate.endpointTemplate, context);
    const body = candidate.bodyTemplate
      ? applyTemplate(candidate.bodyTemplate, context)
      : JSON.stringify(context, null, 2);

    els.preview().textContent = `Endpoint: ${endpoint}\nMethod: ${(candidate.method || 'POST').toUpperCase()}\n\nHeaders: ${JSON.stringify(
      candidate.headers || {},
      null,
      2
    )}\n\nBody:\n${body}`;
    statusBar.flash(LogLevel.Info, 'stat', 2000, 'Preview generated');
  } catch (error: any) {
    statusBar.post(LogLevel.Error, 'interpolation', `Interpolation error: ${error?.message ?? 'Invalid placeholder'}`, error);
    els.preview().textContent = `Error: ${error?.message ?? 'Invalid placeholder'}`;
  }
}

async function testAPI() {
  // Get current form endpoint or first in list
  const candidate = buildEndpointFromForm();
  if (!candidate) {
    statusBar.post(LogLevel.Error, 'endpoint', 'Invalid endpoint configuration');
    return;
  }

  const context = {
    streamUrl: 'https://example.com/test-stream.m3u8',
    timestamp: Date.now(),
    pageUrl: 'https://example.com/test-page',
    pageTitle: 'Test Page - stream-call'
  } as Record<string, unknown>;

  statusBar.post(LogLevel.Info, 'apicall', `Validating endpoint "${candidate.name}"...`);
  logger.info('apicall', `Validating endpoint: ${candidate.name}`, { endpoint: candidate });

  const result = await callEndpointAPI({
    streamUrl: context.streamUrl as string,
    pageUrl: context.pageUrl as string,
    pageTitle: context.pageTitle as string,
    endpointName: candidate.name,
    apiEndpoints: [candidate],
    logger
  });

  if (result.success) {
    statusBar.flash(LogLevel.Info, 'apicall', 5000, `✅ Success: ${result.message}`);
    logger.info('apicall', `Validation successful: ${candidate.name}`, { response: result.response });
  } else {
    statusBar.post(LogLevel.Error, 'apicall', `❌ Failed: ${result.error}`);
    logger.error('apicall', `Validation failed: ${candidate.name}`, { error: result.error });
  }
}

function resetBuiltIns() {
  if (!confirm('Reset built-in blueprints to defaults? (User-defined endpoints will be preserved)')) return;

  const builtIns = getBuiltInEndpoints();
  const builtInNames = new Set(builtIns.map(e => e.name));
  const userEndpoints = endpoints.filter(e => !builtInNames.has(e.name));
  const merged = [...builtIns, ...userEndpoints];

  const validated = validateEndpoints(JSON.stringify(merged));
  if (!validated.valid) {
    statusBar.post(LogLevel.Error, 'endpoint', 'Failed to validate merged endpoints');
    return;
  }

  browser.storage.sync
    .set({ apiEndpoints: validated.formatted })
    .then(() => {
      loadSettings();
      closeEditor();
      statusBar.flash(LogLevel.Info, 'stat', 2000, `✅ Built-in blueprints restored (${builtIns.length} built-ins, ${userEndpoints.length} user endpoints preserved)`);
    })
    .catch((error) => {
      statusBar.post(LogLevel.Error, 'storage', 'Failed to reset built-ins', error);
    });
}

function clearAllEndpoints() {
  if (!confirm('Remove ALL endpoints? This cannot be undone.')) return;

  browser.storage.sync
    .set({ apiEndpoints: '[]' })
    .then(() => {
      loadSettings();
      closeEditor();
      statusBar.flash(LogLevel.Info, 'stat', 2000, '✅ All endpoints cleared');
    })
    .catch((error) => {
      statusBar.post(LogLevel.Error, 'storage', 'Failed to clear endpoints', error);
    });
}

function exportEndpoints() {
  if (endpoints.length === 0) {
    statusBar.post(LogLevel.Warn, 'endpoint', 'No API endpoints to export');
    return;
  }

  const json = JSON.stringify(endpoints, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `stream-call-endpoints-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  statusBar.flash(LogLevel.Info, 'storage', 3000, '✅ API endpoints exported');
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
      const validated = validateEndpoints(JSON.stringify(parsed));

      if (!validated.valid) {
        statusBar.post(LogLevel.Error, 'endpoint', `Invalid file: ${validated.errorMessage}`);
        return;
      }

      pendingImportEndpoints = validated.parsed;
      showImportModal();
    } catch (error: any) {
      statusBar.post(LogLevel.Error, 'endpoint', `Failed to read file: ${error?.message ?? 'Invalid JSON'}`);
    }
  };
  reader.readAsText(file);

  // Reset file input
  input.value = '';
}

function showImportUrlModal() {
  const modal = document.getElementById('import-url-modal') as HTMLDivElement;
  const input = document.getElementById('import-url-input') as HTMLInputElement;
  input.value = '';
  modal.style.display = 'flex';
  input.focus();
}

function hideImportUrlModal() {
  const modal = document.getElementById('import-url-modal') as HTMLDivElement;
  modal.style.display = 'none';
}

function convertGistUrl(url: string): string {
  // Convert GitHub gist URLs to raw format
  // https://gist.github.com/user/abc123 -> https://gist.githubusercontent.com/user/abc123/raw/
  // https://gist.github.com/user/abc123/def456 -> https://gist.githubusercontent.com/user/abc123/raw/def456/
  const gistMatch = url.match(/^https?:\/\/gist\.github\.com\/([^\/]+)\/([a-f0-9]+)(?:\/([a-f0-9]+))?/);
  if (gistMatch) {
    const [, user, gistId, revision] = gistMatch;
    return revision
      ? `https://gist.githubusercontent.com/${user}/${gistId}/raw/${revision}/`
      : `https://gist.githubusercontent.com/${user}/${gistId}/raw/`;
  }
  return url;
}

async function fetchFromUrl() {
  const input = document.getElementById('import-url-input') as HTMLInputElement;
  const url = input.value.trim();

  if (!url) {
    statusBar.post(LogLevel.Error, 'import', 'URL is required');
    return;
  }

  // Validate URL format
  try {
    new URL(url);
  } catch {
    statusBar.post(LogLevel.Error, 'import', 'Invalid URL format');
    return;
  }

  const fetchUrl = convertGistUrl(url);
  statusBar.post(LogLevel.Info, 'import', `Fetching from ${fetchUrl}...`);

  try {
    const response = await fetch(fetchUrl);
    if (!response.ok) {
      statusBar.post(LogLevel.Error, 'import', `Failed to fetch: ${response.status} ${response.statusText}`);
      return;
    }

    const content = await response.text();
    const parsed = JSON.parse(content);
    const validated = validateEndpoints(JSON.stringify(parsed));

    if (!validated.valid) {
      statusBar.post(LogLevel.Error, 'import', `Invalid JSON: ${validated.errorMessage}`);
      return;
    }

    pendingImportEndpoints = validated.parsed;
    hideImportUrlModal();
    showImportModal();
    statusBar.flash(LogLevel.Info, 'import', 2000, `✅ Fetched ${validated.parsed.length} endpoint(s)`);
  } catch (error: any) {
    statusBar.post(LogLevel.Error, 'import', `Failed to fetch or parse JSON: ${error?.message ?? 'Unknown error'}`, error);
  }
}

function showImportModal() {
  const modal = document.getElementById('import-modal') as HTMLDivElement;
  const preview = document.getElementById('import-preview') as HTMLDivElement;

  const dupes = pendingImportEndpoints.filter((p) => endpoints.some((existing) => existing.name === p.name));
  const newEndpoints = pendingImportEndpoints.filter((p) => !endpoints.some((existing) => existing.name === p.name));

  let previewText = `Importing ${pendingImportEndpoints.length} endpoint(s):\n\n`;
  if (newEndpoints.length > 0) {
    previewText += `New endpoints:\n${newEndpoints.map((p) => `  • ${p.name}`).join('\n')}\n\n`;
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
  pendingImportEndpoints = [];
}

function performImport(merge: boolean) {
  const updated = merge
    ? [
        ...endpoints.filter((p) => !pendingImportEndpoints.some((imported) => imported.name === p.name)),
        ...pendingImportEndpoints
      ]
    : pendingImportEndpoints;

  const validated = validateEndpoints(JSON.stringify(updated));
  if (!validated.valid) {
    statusBar.post(LogLevel.Error, 'endpoint', `Invalid endpoints import: ${validated.errorMessage}`);
    return;
  }

  endpoints = validated.parsed;

  browser.storage.sync
    .set({ apiEndpoints: validated.formatted })
    .then(() => {
      renderList();
      closeImportModal();
      statusBar.flash(LogLevel.Info, 'storage', 3000, merge ? '✅ Endpoints merged' : '✅ Endpoints replaced');
    })
    .catch((error) => {
      statusBar.post(LogLevel.Error, 'storage', 'Failed to import endpoints', error);
    });
}

function wireEvents() {
  document.getElementById('save-endpoint-btn')?.addEventListener('click', saveEndpoint);
  document.getElementById('save-new-btn')?.addEventListener('click', saveAsNew);
  document.getElementById('clear-edit-btn')?.addEventListener('click', closeEditor);
  document.getElementById('preview-btn')?.addEventListener('click', previewEndpoint);
  document.getElementById('add-header-row')?.addEventListener('click', () => addHeaderRow());
  document.getElementById('call-btn')?.addEventListener('click', testAPI);
  document.getElementById('reset-btn')?.addEventListener('click', resetBuiltIns);
  document.getElementById('clear-all-btn')?.addEventListener('click', clearAllEndpoints);
  document.getElementById('export-btn')?.addEventListener('click', exportEndpoints);
  document.getElementById('import-file-btn')?.addEventListener('click', () => {
    (document.getElementById('import-file-input') as HTMLInputElement).click();
  });
  document.getElementById('import-url-btn')?.addEventListener('click', showImportUrlModal);
  document.getElementById('import-url-cancel-btn')?.addEventListener('click', hideImportUrlModal);
  document.getElementById('import-url-fetch-btn')?.addEventListener('click', fetchFromUrl);
  document.getElementById('import-file-input')?.addEventListener('change', handleFileSelect);
  document.getElementById('import-merge-btn')?.addEventListener('click', () => performImport(true));
  document.getElementById('import-replace-btn')?.addEventListener('click', () => performImport(false));
  document.getElementById('import-cancel-btn')?.addEventListener('click', closeImportModal);
  els.endpoint().addEventListener('blur', () => {
    if (!els.name().value.trim() && els.endpoint().value.trim()) {
      els.name().value = suggestEndpointName(els.endpoint().value.trim());
    }
  });
}

function initialize() {
  loadSettings();
  wireEvents();
  setHeadersRows();

  // Wire log viewer controls using reusable helpers
  const logViewer = els.logViewer();
  const levelCheckboxes = document.querySelectorAll('.log-level-filter') as NodeListOf<HTMLInputElement>;

  // Wire log filtering (filters always visible in header)
  applyLogFiltering(logViewer, levelCheckboxes);

  els.logClear()?.addEventListener('click', () => {
    logger.clear();
    const viewer = els.logViewer();
    viewer.innerHTML = '<div class="log-empty">No logs yet</div>';
  });

  els.logExport()?.addEventListener('click', () => {
    const json = logger.exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `stream-call-logs-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  });
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', initialize);
}
