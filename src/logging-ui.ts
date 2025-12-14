export {};

import type { StatusBar, StatusLevel } from './status-bar';

// Lightweight UI helpers for rendering StatusBar and Logger output

export function createStatusRenderer(elements: {
  bar: HTMLDivElement;
  icon: HTMLSpanElement;
  message: HTMLSpanElement;
}) {
  return function renderStatus(msg: { level: StatusLevel; message: string } | null) {
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
    const line = document.createElement('div');
    line.textContent = `[${new Date().toISOString()}] ${level.toUpperCase()} ${category}: ${message}`;
    viewer.appendChild(line);
  };
}