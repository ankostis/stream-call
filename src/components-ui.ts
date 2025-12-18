/**
 * Shared UI component builders for popup and options panels
 */
export {};

import { Logger, LogLevel, SlotMessage } from './logger';
import { createStatusRenderer, createLogAppender, applyLogFiltering } from './logging-ui';

/**
 * Button configuration
 */
export type ButtonConfig = {
  className: 'btn-primary' | 'btn-secondary' | 'btn-action' | 'btn-test';
  text: string;
  onClick: () => void;
};

/**
 * Create a styled button element
 */
export function createButton(config: ButtonConfig): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = config.className;
  btn.textContent = config.text;
  btn.addEventListener('click', config.onClick);
  return btn;
}

/**
 * Initialize logging infrastructure with UI wiring
 *
 * @param elements - DOM elements for status bar and log viewer
 * @returns Configured logger, statusBar, and appendLog function
 */
export function initLogging(elements: {
  statusBar: HTMLElement;
  statusIcon: HTMLElement;
  statusMsg: HTMLElement;
  logViewer: HTMLElement;
}): {
  logger: Logger;
  appendLog: ReturnType<typeof createLogAppender>;
} {
  const logger = new Logger();

  const renderStatus = createStatusRenderer({
    bar: elements.statusBar,
    icon: elements.statusIcon,
    message: elements.statusMsg
  });

  // Subscribe to status changes (includes slot prefix in monospace)
  logger.subscribeStatus((current) => {
    if (current) {
      renderStatus({
        level: current.level,
        message: `<code>[${current.slot}]</code> ${current.message}`
      });
    } else {
      renderStatus(null);
    }
  });

  const appendLog = createLogAppender(elements.logViewer);
  logger.subscribeLogs((entries) => {
    entries.slice(-1).forEach((e) => appendLog(e.level, e.category as any, e.message));
  });

  return { logger, appendLog };
}
