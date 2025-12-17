/**
 * Shared UI component builders for popup and options panels
 */
export {};

import { Logger, StatusBar, LogLevel } from './logger';
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
  statusBar: StatusBar;
  appendLog: ReturnType<typeof createLogAppender>;
} {
  const logger = new Logger();
  const statusBar = new StatusBar();
  statusBar.setLogger(logger);

  const renderStatus = createStatusRenderer({
    bar: elements.statusBar,
    icon: elements.statusIcon,
    message: elements.statusMsg
  });

  statusBar.subscribe((current) =>
    renderStatus(current ? { level: current.level, message: current.message } : null)
  );

  const appendLog = createLogAppender(elements.logViewer);
  logger.subscribe((entries) => {
    entries.slice(-1).forEach((e) => appendLog(e.level, e.category as any, e.message));
  });

  return { logger, statusBar, appendLog };
}
