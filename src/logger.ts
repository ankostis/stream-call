/**
 * Logger utility for in-memory audit trail with filtering and export.
 *
 * Designed as reusable abstraction for options page and future mobile panels.
 * Maintains circular buffer (max 100 entries) with level/category filtering.
 */
export {};

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';
// Free-form category string; callers should reuse consistent names.
export type LogCategory = string;

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  category: LogCategory;
  message: string;
}

export class Logger {
  private entries: LogEntry[] = [];
  private maxEntries = 100;
  private subscribers: Set<(entries: LogEntry[]) => void> = new Set();

  /**
   * Log a message at the specified level and category
   */
  log(level: LogLevel, category: LogCategory, message: string): void {
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      category,
      message
    };

    // Add to circular buffer
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.shift(); // Drop oldest
    }

    // Console passthrough
    const consoleMsg = `[${level.toUpperCase()}] [${category}] ${message}`;
    switch (level) {
      case 'error':
        console.error(consoleMsg);
        break;
      case 'warn':
        console.warn(consoleMsg);
        break;
      case 'info':
        console.info(consoleMsg);
        break;
      case 'debug':
        console.debug(consoleMsg);
        break;
    }

    // Notify subscribers
    this.notify();
  }

  /**
   * Log an error message
   */
  error(category: LogCategory, message: string): void {
    this.log('error', category, message);
  }

  /**
   * Log a warning message
   */
  warn(category: LogCategory, message: string): void {
    this.log('warn', category, message);
  }

  /**
   * Log an info message
   */
  info(category: LogCategory, message: string): void {
    this.log('info', category, message);
  }

  /**
   * Log a debug message
   */
  debug(category: LogCategory, message: string): void {
    this.log('debug', category, message);
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
      message: entry.message
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
