/**
 * stream-call options Script to define & CRUD endpoints (extension-context)
 */
export {};

import { LogLevel } from './logger';
import { applyLogFiltering } from './logging-ui';
import { initLogging } from './components-ui';
import { ApiEndpoint, suggestEndpointName, validateEndpoints, DEFAULT_CONFIG, getBuiltInEndpoints, callEndpoint, previewCall } from './endpoint';

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
  logViewer: () => document.getElementById('log-viewer') as HTMLDivElement,
  logClear: () => document.getElementById('log-clear') as HTMLButtonElement,
  logExport: () => document.getElementById('log-export') as HTMLButtonElement,
  enableHoverPanel: () => document.getElementById('enable-hover-panel') as HTMLInputElement,
  aboutVersion: () => document.getElementById('about-version') as HTMLElement
};

// Initialize logging infrastructure
const logging = initLogging({
  statusBar: els.statusBar(),
  statusIcon: els.statusIcon(),
  statusMsg: els.statusMsg(),
  logViewer: els.logViewer()
});
const logger = logging.logger;
const statusBar = logging.statusBar;
const appendLog = logging.appendLog;

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
      els.enableHoverPanel().checked = (config as Config).enableHoverPanel ?? false;
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
    list.classList.add('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  list.classList.remove('hidden');

  endpoints.forEach((endpoint, index) => {
    const item = document.createElement('div');
    item.className = 'endpoint-item';
    if (endpoint.active === false) item.classList.add('inactive');
    if (editingIndex === index) item.classList.add('selected');
    item.style.cursor = 'pointer';
    item.title = 'Click to edit';

    // Make entire item clickable
    item.addEventListener('click', (e) => {
      // Don't trigger if clicking on interactive elements
      const target = e.target as HTMLElement;
      if (target.tagName === 'BUTTON' || target.tagName === 'INPUT') {
        return;
      }
      openEditor(index);
    });

    // Content wrapper for header + summary
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'endpoint-content';

    // Header row: active checkbox + name
    const header = document.createElement('div');
    header.className = 'endpoint-header';

    const activeCheckbox = document.createElement('input');
    activeCheckbox.type = 'checkbox';
    activeCheckbox.className = 'endpoint-active';
    activeCheckbox.checked = endpoint.active !== false;
    activeCheckbox.title = 'Active (shown in popup)';
    activeCheckbox.addEventListener('change', (e) => {
      e.stopPropagation();
      toggleEndpointActive(index);
    });

    const name = document.createElement('span');
    name.className = 'endpoint-name';
    name.textContent = endpoint.name;

    header.appendChild(activeCheckbox);
    header.appendChild(name);

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

    contentWrapper.appendChild(header);
    contentWrapper.appendChild(summary);

    // Actions span with delete button (spans full height)
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

    item.appendChild(contentWrapper);
    item.appendChild(actionsSpan);
    list.appendChild(item);
  });
}

function toggleEndpointActive(index: number) {
  const currentState = endpoints[index].active !== false; // undefined or true = active
  endpoints[index].active = !currentState;
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

  renderList(); // Update selected state in UI
}

function closeEditor() {
  editingIndex = null;
  fillForm(newEndpointDefaults());
  els.editorTitle().textContent = 'Add API endpoint';
  els.saveBtn().textContent = '💾 Save';
  els.saveNewBtn().style.display = 'none';
  renderList(); // Clear selected state in UI
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

function handlePreview() {
  const candidate = buildEndpointFromForm();
  if (!candidate) return;

  const context = {
    streamUrl: 'https://example.com/stream.m3u8',
    timestamp: new Date().toISOString(),
    pageUrl: 'https://example.com/page',
    pageTitle: 'Example page'
  } as Record<string, unknown>;

  statusBar.flash(LogLevel.Info, 'options', 2000, 'Generating preview:');
  previewCall(candidate, context, logger);
}

/**
 * Handle endpoint action with test data (call API or open in tab)
 */
async function handleCallEndpoint(mode: 'fetch' | 'tab') {
  // Get current form endpoint
  const candidate = buildEndpointFromForm();
  if (!candidate) {
    statusBar.post(LogLevel.Error, 'endpoint', 'Invalid endpoint configuration');
    return;
  }

  const testUrl = 'https://example.com/test-stream.m3u8';
  const pageUrl = 'https://example.com/test-page';
  const pageTitle = 'Test Page - stream-call';

  const action = mode === 'fetch' ? 'Validating endpoint' : 'Opening in tab';
  statusBar.post(LogLevel.Info, 'apicall', `${action}: ${candidate.name} → ${testUrl}`);
  logger.info('apicall', `${action}: ${candidate.name}`, { endpoint: candidate });

  // Direct call (options runs in extension context)
  const response = await callEndpoint({
    mode,
    streamUrl: testUrl,
    pageUrl,
    pageTitle,
    endpointName: candidate.name,
    apiEndpoints: [candidate],
    logger
  });

  if (response.success) {
    const successMsg = mode === 'fetch' ? `✅ Success: ${response.message}` : `✅ Opened in new tab: ${response.details || testUrl}`;
    statusBar.flash(LogLevel.Info, 'apicall', 3000, successMsg);
    logger.info('apicall', `${action} successful: ${candidate.name}`, { response: mode === 'fetch' ? response.response : response.details });
  } else {
    statusBar.post(LogLevel.Error, 'apicall', `❌ Failed: ${response.error}`);
    logger.error('apicall', `${action} failed: ${candidate.name}`, { error: response.error });
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
  document.getElementById('preview-btn')?.addEventListener('click', handlePreview);
  document.getElementById('add-header-row')?.addEventListener('click', () => addHeaderRow());
  document.getElementById('call-btn')?.addEventListener('click', () => handleCallEndpoint('fetch'));
  document.getElementById('open-tab-btn')?.addEventListener('click', () => handleCallEndpoint('tab'));
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
  // Display version from manifest
  const manifest = browser.runtime.getManifest();
  els.aboutVersion().textContent = `Version ${manifest.version}`;

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

  // Settings checkbox
  els.enableHoverPanel().addEventListener('change', () => {
    browser.storage.sync.set({ enableHoverPanel: els.enableHoverPanel().checked })
      .then(() => {
        const status = els.enableHoverPanel().checked ? 'enabled' : 'disabled';
        statusBar.post(LogLevel.Info, 'storage', `Hover panel ${status}`);
      })
      .catch((err) => {
        logger.error('storage', 'Failed to save hover panel setting:', err);
      });
  });

  // Make help icons tappable on mobile - toggle tooltip on click/tap
  document.querySelectorAll('.help-icon').forEach((icon) => {
    icon.addEventListener('click', (e) => {
      e.stopPropagation();
      const el = e.target as HTMLElement;
      const wasShowing = el.classList.contains('show-tooltip');

      // Hide all other tooltips
      document.querySelectorAll('.help-icon.show-tooltip').forEach((other) => {
        if (other !== el) other.classList.remove('show-tooltip');
      });

      // Toggle this one
      el.classList.toggle('show-tooltip', !wasShowing);
    });
  });

  // Hide tooltips when clicking elsewhere
  document.addEventListener('click', () => {
    document.querySelectorAll('.help-icon.show-tooltip').forEach((icon) => {
      icon.classList.remove('show-tooltip');
    });
  });

  // Make template placeholder codes selectable on tap
  document.querySelectorAll('.template-help code').forEach((code) => {
    code.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
  });
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', initialize);
}
