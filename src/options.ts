export {};

import { applyTemplate } from './template';
import { Logger } from './logger';
import { StatusBar } from './status-bar';
import { createLogAppender, createStatusRenderer, setupLogFiltering } from './logging-ui';
import { ApiEndpoint, suggestEndpointName, validateEndpoints } from './endpoint';

const DEFAULT_CONFIG = {
  apiEndpoints: JSON.stringify(
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
  name: () => document.getElementById('endpoint-name') as HTMLInputElement,
  method: () => document.getElementById('endpoint-method') as HTMLSelectElement,
  endpoint: () => document.getElementById('endpoint-endpoint') as HTMLInputElement,
  body: () => document.getElementById('endpoint-body') as HTMLTextAreaElement,
  includePage: () => document.getElementById('endpoint-include-page') as HTMLInputElement,
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
      const validated = validateEndpoints((config as Config).apiEndpoints || '[]');
      endpoints = validated.valid ? validated.parsed : [];
      renderList();
    })
    .catch((error) => {
      console.error('Failed to load settings:', error);
      statusBar.post('storage-error', 'error', 'Failed to load settings');
    });
}

function renderList() {
  const list = els.endpointsList();
  const emptyState = els.endpointsEmpty();
  list.innerHTML = '';

  if (endpoints.length === 0) {
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';

  endpoints.forEach((endpoint, index) => {
    const card = document.createElement('div');
    card.className = 'endpoint-card';

    const title = document.createElement('h3');
    title.textContent = endpoint.name;

    const meta = document.createElement('div');
    meta.className = 'endpoint-meta';
    meta.textContent = `${(endpoint.method || 'POST').toUpperCase()} → ${endpoint.endpointTemplate}`;

    const pageInfo = document.createElement('div');
    pageInfo.className = 'endpoint-meta';
    pageInfo.textContent = endpoint.includePageInfo === false ? 'Page info: off' : 'Page info: on';

    const actions = document.createElement('div');
    actions.className = 'endpoint-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'btn-ghost';
    editBtn.textContent = '✏️ Edit';
    editBtn.addEventListener('click', () => openEditor(index));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-secondary btn-danger';
    deleteBtn.textContent = '🗑 Delete';
    deleteBtn.addEventListener('click', () => deleteEndpoint(index));

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
  const endpoint = index === null ? newEndpointDefaults() : endpoints[index];
  fillForm(endpoint);
  els.editorTitle().textContent = index === null ? 'Add API endpoint' : 'Edit API endpoint';
  els.editorCard().style.display = 'block';
  els.preview().style.display = 'none';
}

function closeEditor() {
  editingIndex = null;
  els.editorCard().style.display = 'none';
  els.preview().style.display = 'none';
}

function fillForm(endpoint: ApiEndpoint) {
  els.name().value = endpoint.name || '';
  els.method().value = (endpoint.method || 'POST').toUpperCase();
  els.endpoint().value = endpoint.endpointTemplate || '';
  els.body().value = endpoint.bodyTemplate || '';
  els.includePage().checked = endpoint.includePageInfo !== false;
  setHeadersRows(endpoint.headers);
}

function newEndpointDefaults(): ApiEndpoint {
  return {
    name: '',
    endpointTemplate: '',
    method: 'POST',
    headers: {},
    bodyTemplate: '',
    includePageInfo: true
  };
}

function buildEndpointFromForm(): ApiEndpoint | null {
  const nameRaw = els.name().value.trim();
  const endpoint = els.endpoint().value.trim();
  const method = els.method().value.trim().toUpperCase() || 'POST';
  const bodyTemplate = els.body().value.trim();
  const includePageInfo = els.includePage().checked;

  if (!endpoint) {
    statusBar.post('form-error', 'error', 'Endpoint URL is required');
    logger.error('form-input', 'Endpoint URL missing');
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
    includePageInfo
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
    statusBar.post('endpoint-error', 'error', validated.errorMessage || 'Invalid API endpoint');
    logger.error('endpoint-parse', validated.errorMessage || 'Invalid API endpoint');
    return;
  }

  endpoints = validated.parsed;

  browser.storage.sync
    .set({ apiEndpoints: validated.formatted })
    .then(() => {
      renderList();
      closeEditor();
      statusBar.flash('info', '✅ API endpoint saved', 3000, 'last-action');
      logger.info('endpoint-list', 'API endpoint saved');
    })
    .catch((error) => {
      console.error('Failed to save API endpoint:', error);
      statusBar.post('storage-error', 'error', 'Failed to save API endpoint');
      logger.error('storage', `Failed to save API endpoint: ${error?.message ?? 'Unknown'}`);
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
    statusBar.post('endpoint-error', 'error', validated.errorMessage || 'Failed to delete API endpoint');
    logger.error('endpoint-parse', validated.errorMessage || 'Failed to delete API endpoint');
    return;
  }

  endpoints = validated.parsed;

  browser.storage.sync
    .set({ apiEndpoints: validated.formatted })
    .then(() => {
      renderList();
      closeEditor();
      statusBar.flash('info', 'API endpoint deleted', 3000, 'last-action');
    })
    .catch((error) => {
      console.error('Failed to delete API endpoint:', error);
      statusBar.post('storage-error', 'error', 'Failed to delete API endpoint');
    });
}

function previewEndpoint() {
  const candidate = buildEndpointFromForm();
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
    statusBar.flash('info', 'Preview generated', 2000, 'stat');
    logger.info('api-test', 'Preview generated');
  } catch (error: any) {
    statusBar.post('interpolation-error', 'error', `Interpolation error: ${error?.message ?? 'Invalid placeholder'}`);
    logger.error('api-test', `Interpolation error: ${error?.message ?? 'Invalid placeholder'}`);
  }
}

function testAPI() {
  if (endpoints.length === 0) {
    statusBar.post('endpoint-error', 'error', 'Please add at least one API endpoint first');
    logger.warn('endpoint-list', 'No endpoints to test');
    return;
  }

  const firstEndpoint = endpoints[0];
  statusBar.flash('info', 'Testing API connection...', 2000, 'stat');

  const context = {
    streamUrl: 'https://example.com/test-stream.m3u8',
    timestamp: new Date().toISOString(),
    pageUrl: firstEndpoint.includePageInfo ? 'https://example.com/test-page' : undefined,
    pageTitle: firstEndpoint.includePageInfo ? 'Test Page - stream-call' : undefined
  } as Record<string, unknown>;

  let endpoint: string;
  let body: string | undefined;

  try {
    endpoint = applyTemplate(firstEndpoint.endpointTemplate, context);
    body = firstEndpoint.bodyTemplate
      ? applyTemplate(firstEndpoint.bodyTemplate, context)
      : JSON.stringify(
          firstEndpoint.includePageInfo
            ? context
            : { streamUrl: context.streamUrl, timestamp: context.timestamp }
        );
  } catch (templateError: any) {
    const availableFields = Object.keys(context).filter((k) => context[k] !== undefined).join(', ');
    statusBar.post('interpolation-error', 'error', `❌ Interpolation error: ${templateError?.message ?? 'Invalid placeholder'}. Fields: ${availableFields}.`);
    logger.error('api-test', `Template error: ${templateError?.message ?? 'Invalid placeholder'}; available: ${availableFields}`);
    return;
  }

  const method = (firstEndpoint.method || 'POST').toUpperCase();

  let headers: Record<string, string> | undefined = undefined;
  if (body) {
    headers = { 'Content-Type': 'application/json', ...(firstEndpoint.headers || {}) };
  } else if (firstEndpoint.headers) {
    headers = { ...firstEndpoint.headers };
  }

  fetch(endpoint, {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : body
  })
    .then((response) => {
      if (response.ok) {
        statusBar.flash('info', `✅ API test successful! Status: ${response.status} ${response.statusText}`, 3000, 'last-action');
      } else {
        statusBar.post('interpolation-error', 'warn', `⚠️ API returned status ${response.status}: ${response.statusText}`);
      }
    })
    .catch((error) => {
      console.error('API test error:', error);
      statusBar.post('interpolation-error', 'error', `❌ API test failed: ${error?.message ?? 'Unknown error'}`);
    });
}

function resetSettings() {
  if (!confirm('Reset API endpoints to defaults?')) return;
  const validated = validateEndpoints(DEFAULT_CONFIG.apiEndpoints);
  if (!validated.valid) {
    statusBar.post('endpoint-error', 'error', 'Default config is invalid');
    logger.error('endpoint-parse', 'Default config invalid');
    return;
  }
  endpoints = validated.parsed;
  browser.storage.sync
    .set({ apiEndpoints: validated.formatted })
    .then(() => {
      renderList();
      closeEditor();
      statusBar.flash('info', 'Defaults restored. Ready to save.', 2000, 'stat');
    })
    .catch((error) => {
      console.error('Failed to reset settings:', error);
      statusBar.post('storage-error', 'error', 'Failed to reset settings');
    });
}

function exportEndpoints() {
  if (endpoints.length === 0) {
    statusBar.post('endpoint-error', 'warn', 'No API endpoints to export');
    logger.warn('import-export', 'Export skipped: no endpoints');
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
  statusBar.flash('info', '✅ API endpoints exported', 3000, 'last-action');
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
        statusBar.post('endpoint-error', 'error', `Invalid file: ${validated.errorMessage}`);
        return;
      }

      pendingImportEndpoints = validated.parsed;
      showImportModal();
    } catch (error: any) {
      statusBar.post('endpoint-error', 'error', `Failed to read file: ${error?.message ?? 'Invalid JSON'}`);
    }
  };
  reader.readAsText(file);

  // Reset file input
  input.value = '';
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
    statusBar.post('endpoint-error', 'error', `Invalid endpoints import: ${validated.errorMessage}`);
    return;
  }

  endpoints = validated.parsed;

  browser.storage.sync
    .set({ apiEndpoints: validated.formatted })
    .then(() => {
      renderList();
      closeImportModal();
      statusBar.flash('info', merge ? '✅ Endpoints merged' : '✅ Endpoints replaced', 3000, 'last-action');
    })
    .catch((error) => {
      console.error('Failed to import endpoints:', error);
      statusBar.post('storage-error', 'error', 'Failed to import endpoints');
    });
}

function wireEvents() {
  document.getElementById('add-endpoint-btn')?.addEventListener('click', () => openEditor(null));
  document.getElementById('save-endpoint-btn')?.addEventListener('click', saveEndpoint);
  document.getElementById('cancel-edit-btn')?.addEventListener('click', closeEditor);
  document.getElementById('preview-btn')?.addEventListener('click', previewEndpoint);
  document.getElementById('add-header-row')?.addEventListener('click', () => addHeaderRow());
  document.getElementById('test-btn')?.addEventListener('click', testAPI);
  document.getElementById('reset-btn')?.addEventListener('click', resetSettings);
  document.getElementById('export-btn')?.addEventListener('click', exportEndpoints);
  document.getElementById('import-btn')?.addEventListener('click', () => {
    (document.getElementById('import-file-input') as HTMLInputElement).click();
  });
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
  const logFilterToggle = document.getElementById('log-filter-toggle');
  const logFilterPanel = document.getElementById('log-filter-panel') as HTMLDivElement;
  const levelCheckboxes = document.querySelectorAll('.log-level-filter') as NodeListOf<HTMLInputElement>;

  if (logFilterToggle && logFilterPanel) {
    setupLogFiltering(els.logViewer(), logFilterPanel, logFilterToggle, levelCheckboxes);
  }

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
