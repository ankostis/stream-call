export {};

import type { StatusBar, StatusMessage, LogLevel } from './logger';

// Lightweight UI helpers for rendering StatusBar and Logger output

export function createStatusRenderer(elements: {
  bar: HTMLDivElement;
  icon: HTMLSpanElement;
  message: HTMLSpanElement;
}) {
  return function renderStatus(msg: { level: LogLevel; message: string } | null) {
    const bar = elements.bar;
    if (!msg) {
      bar.style.display = 'none';
      return;
    }
    elements.message.textContent = msg.message;
    elements.icon.textContent = msg.level === 'error' ? '❌' : msg.level === 'warn' ? '⚠️' : 'ℹ️';
    bar.style.borderLeftColor = msg.level === 'error' ? '#b91c1c' : msg.level === 'warn' ? '#d97706' : '#2563eb';
    bar.style.display = 'block';
  };
}

export function createLogAppender(viewer: HTMLDivElement) {
  return function appendLog(level: 'error'|'warn'|'info'|'debug', category: string, message: string) {
    const empty = viewer.querySelector('.log-empty');
    if (empty) empty.remove();
    const line = viewer.ownerDocument.createElement('div');
    line.textContent = `[${new Date().toISOString()}] ${level.toUpperCase()} ${category}: ${message}`;
    viewer.appendChild(line);
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
