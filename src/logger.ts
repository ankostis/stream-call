/**
 * Logger utility for in-memory audit trail with filtering and export.
 *
 * Designed as reusable abstraction for options page and future mobile panels.
 * Maintains circular buffer (max 100 entries) with level/category filtering.
 */
export {};

export enum LogLevel {
  Error = 'error',
  Warn = 'warn',
  Info = 'info',
  Debug = 'debug'
}
// Free-form category string; callers should reuse consistent names.
export type LogCategory = string;

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  category: LogCategory;
  message: string; // UI-friendly, formatted string
  args: unknown[]; // Raw arguments as passed by callers
}

function formatArg(arg: unknown): string {
  if (arg instanceof Error) {
    return `${arg.name}: ${arg.message}`;
  }
  if (typeof arg === 'object' && arg !== null) {
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }
  return String(arg);
}

function formatArgs(args: unknown[]): string {
  if (args.length === 0) return '';
  return args.map(formatArg).join(' ');
}

export class Logger {
  private entries: LogEntry[] = [];
  private maxEntries = 100;
  private subscribers: Set<(entries: LogEntry[]) => void> = new Set();

  /**
   * Log a message at the specified level and category
   */
  log(level: LogLevel, category: LogCategory, ...msg: unknown[]): void {
    const message = formatArgs(msg);
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      category,
      message,
      args: msg
    };

    // Add to circular buffer
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.shift(); // Drop oldest
    }

    // Console passthrough
    const consoleMethods: Record<LogLevel, (...args: any[]) => void> = {
      [LogLevel.Error]: console.error,
      [LogLevel.Warn]: console.warn,
      [LogLevel.Info]: console.info,
      [LogLevel.Debug]: console.debug
    };
    consoleMethods[level](`[${category}]`, ...(msg.length > 0 ? msg : [message]));

    // Notify subscribers
    this.notify();
  }

  /**
   * Log an error message
   */
  error(category: LogCategory, ...msg: unknown[]): void {
    this.log(LogLevel.Error, category, ...msg);
  }

  /**
   * Log a warning message
   */
  warn(category: LogCategory, ...msg: unknown[]): void {
    this.log(LogLevel.Warn, category, ...msg);
  }

  /**
   * Log an info message
   */
  info(category: LogCategory, ...msg: unknown[]): void {
    this.log(LogLevel.Info, category, ...msg);
  }

  /**
   * Log a debug message
   */
  debug(category: LogCategory, ...msg: unknown[]): void {
    this.log(LogLevel.Debug, category, ...msg);
  }

  /**
   * Get all log entries
   */
  getAll(): LogEntry[] {
    return [...this.entries];
  }

  /**
   * Filter log entries by level and/or category
   */
  filter(levels?: LogLevel[], categories?: LogCategory[]): LogEntry[] {
    return this.entries.filter((entry) => {
      const levelMatch = !levels || levels.length === 0 || levels.includes(entry.level);
      const categoryMatch = !categories || categories.length === 0 || categories.includes(entry.category);
      return levelMatch && categoryMatch;
    });
  }

  /**
   * Clear all log entries
   */
  clear(): void {
    this.entries = [];
    this.notify();
  }

  /**
   * Subscribe to log updates
   */
  subscribe(callback: (entries: LogEntry[]) => void): () => void {
    this.subscribers.add(callback);
    // Return unsubscribe function
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * Export logs as JSON string
   */
  exportJSON(): string {
    const exportData = this.entries.map((entry) => ({
      timestamp: entry.timestamp.toISOString(),
      level: entry.level,
      category: entry.category,
      message: entry.message,
      args: entry.args.map(formatArg)
    }));
    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Notify all subscribers
   */
  private notify(): void {
    this.subscribers.forEach((callback) => callback([...this.entries]));
  }
}
