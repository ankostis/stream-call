export {};

import type { LogLevel } from './logger';

// Lightweight UI helpers for rendering StatusBar and Logger output

export function createStatusRenderer(elements: {
  bar: HTMLDivElement;
  message: HTMLSpanElement;
}) {
  return function renderStatus(msg: { level: LogLevel; message: string } | null) {
    const bar = elements.bar;
    if (!msg) {
      bar.style.display = 'none';
      return;
    }
    elements.message.innerHTML = msg.message;
    // Vary background color by level
    if (msg.level === 'error') {
      bar.style.backgroundColor = '#fee';
      bar.style.borderLeftColor = '#b91c1c';
    } else if (msg.level === 'warn') {
      bar.style.backgroundColor = '#fef3c7';
      bar.style.borderLeftColor = '#d97706';
    } else {
      bar.style.backgroundColor = '#dbeafe';
      bar.style.borderLeftColor = '#2563eb';
    }
    bar.style.display = 'block';
  };
}

export function createLogAppender(viewer: HTMLDivElement) {
  return function appendLog(level: 'error'|'warn'|'info'|'debug', category: string, message: string) {
    const empty = viewer.querySelector('.log-empty');
    if (empty) empty.remove();

    // Check if user has scrolled up before adding new content
    const wasAtBottom = viewer.scrollHeight - viewer.scrollTop - viewer.clientHeight < 5;

    const line = viewer.ownerDocument.createElement('div');
    line.textContent = `[${new Date().toISOString()}] ${level.toUpperCase()} ${category}: ${message}`;
    line.dataset.level = level;

    // Apply color by level
    if (level === 'error') {
      line.style.color = '#f87171';
    } else if (level === 'warn') {
      line.style.color = '#fbbf24';
    } else if (level === 'info') {
      line.style.color = '#60a5fa';
    } else {
      line.style.color = '#9ca3af';
    }

    viewer.appendChild(line);

    // Auto-scroll only if user was at bottom
    if (wasAtBottom) {
      viewer.scrollTop = viewer.scrollHeight;
    }
  };
}
export function applyLogFilter(viewer: HTMLDivElement, levels: string[]) {
  const allLines = viewer.querySelectorAll('div:not(.log-empty)');
  allLines.forEach((line) => {
    const text = line.textContent || '';
    const hasMatch = levels.some(level => text.includes(`] ${level.toUpperCase()}`));
    (line as HTMLElement).style.display = hasMatch ? 'block' : 'none';
  });
}

export function applyLogFiltering(
  viewer: HTMLDivElement,
  levelCheckboxes: NodeListOf<HTMLInputElement>
) {
  // Apply filter on checkbox change
  levelCheckboxes.forEach(el => {
    el.addEventListener('change', () => {
      const selectedLevels = Array.from(levelCheckboxes)
        .filter(checkbox => checkbox.checked)
        .map(checkbox => checkbox.value);
      applyLogFilter(viewer, selectedLevels);
    });
  });
}
