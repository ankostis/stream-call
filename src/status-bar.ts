/**
 * Status Bar utility for persistent and transient UI feedback.
 *
 * Designed as reusable abstraction for options page and future mobile panels.
 * Manages slot-based persistent messages and transient action notifications
 * with priority overlay logic (transient > highest level persistent).
 */
export {};

import type { Logger, LogLevel } from './logger';

// Free-form slot string; callers should reuse consistent names.
export type StatusSlot = string;

export interface StatusMessage {
  slot: StatusSlot;
  level: LogLevel;
  message: string;
  messageArgs?: unknown[];
  timestamp: Date;
  timeout?: number; // ms; undefined = persistent
  isTransient: boolean;
}

function formatArgs(args: unknown[]): string {
  if (!args || args.length === 0) return '';
  return args
    .map((arg) => {
      if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
      if (typeof arg === 'object' && arg !== null) {
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    })
    .join(' ');
}

export class StatusBar {
  private persistent: Map<StatusSlot, StatusMessage> = new Map();
  // Stack of transient messages; last pushed has focus. On expiry, revert to previous.
  private transients: StatusMessage[] = [];
  private transientTimers: Map<StatusMessage, ReturnType<typeof setTimeout>> = new Map();
  private subscribers: Set<(msg: StatusMessage | null) => void> = new Set();
  private logger: Logger | null = null;

  /**
   * Post persistent message in a slot (replaces older in same slot)
   */
  post(level: LogLevel, slot: StatusSlot, ...msg: unknown[]): void {
    const message = formatArgs(msg);
    const statusMsg: StatusMessage = {
      slot,
      level,
      message,
      messageArgs: msg,
      timestamp: new Date(),
      isTransient: false
    };

    this.persistent.set(slot, statusMsg);
    this.logMessage(statusMsg);
    this.notify();
  }

  /**
   * Flash a transient message (default timeout 3000ms). Uses stacking behavior.
   */
  flash(level: LogLevel, slot: StatusSlot, timeout: number = 3000, ...msg: unknown[]): void {
    const formatted = formatArgs(msg);
    const statusMsg: StatusMessage = {
      slot,
      level,
      message: formatted,
      messageArgs: msg,
      timestamp: new Date(),
      timeout,
      isTransient: true
    };

    this.transients.push(statusMsg);
    this.logMessage(statusMsg);
    this.notify();

    if (timeout > 0) {
      const timer = setTimeout(() => {
        // Remove this transient
        const idx = this.transients.indexOf(statusMsg);
        if (idx !== -1) this.transients.splice(idx, 1);
        const t = this.transientTimers.get(statusMsg);
        if (t) {
          clearTimeout(t);
          this.transientTimers.delete(statusMsg);
        }
        // Notify to reveal previous transient or persistent
        this.notify();
      }, timeout);
      this.transientTimers.set(statusMsg, timer);
    }
  }

  /**
   * Clear slot or all slots, optionally by level
   */
  clear(slot?: StatusSlot, level?: LogLevel): void {
    if (!slot) {
      // Clear all slots (optionally filtered by level)
      if (level) {
        for (const [key, msg] of this.persistent.entries()) {
          if (msg.level === level) {
            this.persistent.delete(key);
          }
        }
      } else {
        this.persistent.clear();
      }
    } else {
      // Clear specific slot (optionally filtered by level)
      const msg = this.persistent.get(slot);
      if (msg && (!level || msg.level === level)) {
        this.persistent.delete(slot);
      }
    }

    this.notify();
  }

  /**
   * Get current visible message (priority: latest transient > highest level persistent)
   */
  getCurrent(): StatusMessage | null {
    // Latest transient wins
    if (this.transients.length > 0) {
      return this.transients[this.transients.length - 1];
    }

    // Find highest level persistent
    const levels: StatusLevel[] = ['error', 'warn', 'info'];
    for (const level of levels) {
      const messagesAtLevel = Array.from(this.persistent.values()).filter((msg) => msg.level === level);
      if (messagesAtLevel.length > 0) {
        // Return oldest in this level
        return messagesAtLevel.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())[0];
      }
    }

    return null;
  }

  /**
   * Subscribe to status bar changes
   */
  subscribe(callback: (msg: StatusMessage | null) => void): () => void {
    this.subscribers.add(callback);
    // Return unsubscribe function
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * Set logger instance for audit trail
   */
  setLogger(logger: Logger): void {
    this.logger = logger;
  }

  /**
   * Log message to logger if available
   */
  private logMessage(msg: StatusMessage): void {
    if (!this.logger) return;

    const category = msg.slot; // Use slot string directly as category
    const logLevel = msg.level; // error/warn/info affects visibility and logging
    const args = msg.messageArgs && msg.messageArgs.length > 0 ? msg.messageArgs : [msg.message];
    this.logger.log(logLevel, category, ...args);
  }

  /**
   * Notify all subscribers
   */
  private notify(): void {
    const current = this.getCurrent();
    this.subscribers.forEach((callback) => callback(current));
  }
}
