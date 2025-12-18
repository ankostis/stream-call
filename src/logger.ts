/**
 * Logger: Unified logging and status management
 *
 * API Overview:
 * =============
 *
 * PERSISTENT STATUS (add to ring + set slot, stays until cleared):
 *   logger.error(slot, ...msg)
 *   logger.warn(slot, ...msg)
 *   logger.info(slot, ...msg)
 *   logger.debug(slot, ...msg)
 *
 * TRANSIENT STATUS (add to ring + set slot, auto-expires after timeout):
 *   logger.errorFlash(timeout, slot, ...msg)
 *   logger.warnFlash(timeout, slot, ...msg)
 *   logger.infoFlash(timeout, slot, ...msg)
 *
 * QUERY:
 *   logger.transientMsg()            → Current visible message (highest priority)
 *   logger.filterLogs(levels, cats)  → Filter ring buffer entries
 *   logger.exportJSON()              → Export ring as JSON
 *
 * MANAGEMENT:
 *   logger.clearSlot(slot?, level?)  → Clear slot(s)
 *   logger.clearLogs()               → Clear ring buffer
 *
 * SUBSCRIPTIONS:
 *   logger.subscribeLogs(callback)   → Notified on ring changes
 *   logger.subscribeStatus(callback) → Notified on status changes (including expirations)
 *
 * DATA:
 *   logger.logsRing  → Public access to ring buffer (LogEntry[])
 *
 * ARCHITECTURE:
 * - Single timer for all expirations (not per-message)
 * - Slots are private (one message per slot, latest wins)
 * - Status messages embedded in SlotMessage (expireTimestamp field)
 * - Display priority: level first (error > warn > info > debug), then most recent
 * - Transient = has expireTimestamp, persistent = no expireTimestamp
 */
export {};

export enum LogLevel {
  Error = 'error',
  Warn = 'warn',
  Info = 'info',
  Debug = 'debug'
}

export type LogCategory = string;

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  category: LogCategory;
  message: string;
  args: unknown[];
}

export interface SlotMessage {
  slot: string;
  level: LogLevel;
  message: string;
  messageArgs?: unknown[];
  timestamp: Date;
  expireTimestamp?: Date;  // undefined = persistent, Date = transient (auto-clear)
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
  public logsRing: LogEntry[] = [];
  private maxEntries = 100;
  private slots = new Map<string, SlotMessage>();
  private expirationTimer: ReturnType<typeof setTimeout> | null = null;
  private logSubscribers = new Set<(entries: LogEntry[]) => void>();
  private statusSubscribers = new Set<(msg: SlotMessage | null) => void>();

  // ========================================================================
  // PERSISTENT STATUS (no expiration)
  // ========================================================================

  error(slot: string, ...msg: unknown[]): void {
    this.setSlot(LogLevel.Error, slot, undefined, ...msg);
  }

  warn(slot: string, ...msg: unknown[]): void {
    this.setSlot(LogLevel.Warn, slot, undefined, ...msg);
  }

  info(slot: string, ...msg: unknown[]): void {
    this.setSlot(LogLevel.Info, slot, undefined, ...msg);
  }

  debug(slot: string, ...msg: unknown[]): void {
    this.setSlot(LogLevel.Debug, slot, undefined, ...msg);
  }

  // ========================================================================
  // TRANSIENT STATUS (auto-expires)
  // ========================================================================

  errorFlash(timeout: number, slot: string, ...msg: unknown[]): void {
    const expireTimestamp = new Date(Date.now() + timeout);
    this.setSlot(LogLevel.Error, slot, expireTimestamp, ...msg);
  }

  warnFlash(timeout: number, slot: string, ...msg: unknown[]): void {
    const expireTimestamp = new Date(Date.now() + timeout);
    this.setSlot(LogLevel.Warn, slot, expireTimestamp, ...msg);
  }

  infoFlash(timeout: number, slot: string, ...msg: unknown[]): void {
    const expireTimestamp = new Date(Date.now() + timeout);
    this.setSlot(LogLevel.Info, slot, expireTimestamp, ...msg);
  }

  // ========================================================================
  // INTERNAL: SET SLOT + LOG TO RING
  // ========================================================================

  private setSlot(
    level: LogLevel,
    slot: string,
    expireTimestamp: Date | undefined,
    ...msg: unknown[]
  ): void {
    const message = formatArgs(msg);

    // Add to ring buffer
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      category: slot,
      message,
      args: msg
    };
    this.logsRing.push(entry);
    if (this.logsRing.length > this.maxEntries) {
      this.logsRing.shift();
    }

    // Update slot
    this.slots.set(slot, {
      slot,
      level,
      message,
      messageArgs: msg,
      timestamp: new Date(),
      expireTimestamp
    });

    // Console passthrough
    const consoleMethods: Record<LogLevel, (...args: any[]) => void> = {
      [LogLevel.Error]: console.error,
      [LogLevel.Warn]: console.warn,
      [LogLevel.Info]: console.info,
      [LogLevel.Debug]: console.debug
    };
    consoleMethods[level](`[${slot}]`, ...(msg.length > 0 ? msg : [message]));

    // Notify
    this.notifyLogs();
    this.notifyStatus();

    // Reschedule expiration if needed
    if (expireTimestamp) {
      this.scheduleNextExpiration();
    }
  }

  // ========================================================================
  // EXPIRATION MANAGEMENT (single timer)
  // ========================================================================

  private scheduleNextExpiration(): void {
    if (this.expirationTimer) {
      clearTimeout(this.expirationTimer);
      this.expirationTimer = null;
    }

    // Find earliest expiration
    let earliest: Date | null = null;
    for (const msg of this.slots.values()) {
      if (msg.expireTimestamp) {
        if (!earliest || msg.expireTimestamp < earliest) {
          earliest = msg.expireTimestamp;
        }
      }
    }

    if (earliest) {
      const delay = earliest.getTime() - Date.now();
      this.expirationTimer = setTimeout(() => {
        // Don't clear expired slots - they stay in Map and get filtered by transientMsg()
        // Just notify UI so it can re-render without the expired message
        this.notifyStatus();
        this.scheduleNextExpiration();
      }, Math.max(0, delay));
    }
  }

  // ========================================================================
  // QUERY
  // ========================================================================

  /**
   * Get current visible message (transient or persistent).
   * Priority: level first (error > warn > info > debug), then most recent.
   * Filters out expired transient messages.
   */
  transientMsg(): SlotMessage | null {
    if (this.slots.size === 0) return null;

    // persisent & non-expired messages
    //
    const now = Date.now();
    const allMessages = Array.from(this.slots.values()).filter(
      (m) => !m.expireTimestamp || m.expireTimestamp.getTime() > now
    );

    // Scan by level, the sort to by post-timestamp (BUG: sort by expirations!!).
    //
    const levels = [LogLevel.Error, LogLevel.Warn, LogLevel.Info, LogLevel.Debug];
    for (const level of levels) {
      const messagesAtLevel = allMessages.filter((m) => m.level === level);
      if (messagesAtLevel.length > 0) {
        return messagesAtLevel.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];
      }
    }

    return null;
  }

  filterLogs(levels?: LogLevel[], categories?: LogCategory[]): LogEntry[] {
    return this.logsRing.filter((entry) => {
      const levelMatch = !levels || levels.length === 0 || levels.includes(entry.level);
      const categoryMatch =
        !categories || categories.length === 0 || categories.includes(entry.category);
      return levelMatch && categoryMatch;
    });
  }

  exportJSON(): string {
    const exportData = this.logsRing.map((entry) => ({
      timestamp: entry.timestamp.toISOString(),
      level: entry.level,
      category: entry.category,
      message: entry.message,
      args: entry.args.map(formatArg)
    }));
    return JSON.stringify(exportData, null, 2);
  }

  // ========================================================================
  // MANAGEMENT
  // ========================================================================

  clearSlot(slot?: string, level?: LogLevel): void {
    if (!slot) {
      if (level) {
        for (const [key, msg] of this.slots.entries()) {
          if (msg.level === level) {
            this.slots.delete(key);
          }
        }
      } else {
        this.slots.clear();
      }
    } else {
      const msg = this.slots.get(slot);
      if (msg && (!level || msg.level === level)) {
        this.slots.delete(slot);
      }
    }
    this.notifyStatus();
  }

  clearLogs(): void {
    this.logsRing = [];
    this.notifyLogs();
  }

  // ========================================================================
  // SUBSCRIPTIONS
  // ========================================================================

  subscribeLogs(callback: (entries: LogEntry[]) => void): () => void {
    this.logSubscribers.add(callback);
    return () => {
      this.logSubscribers.delete(callback);
    };
  }

  subscribeStatus(callback: (msg: SlotMessage | null) => void): () => void {
    this.statusSubscribers.add(callback);
    return () => {
      this.statusSubscribers.delete(callback);
    };
  }

  private notifyLogs(): void {
    this.logSubscribers.forEach((cb) => cb([...this.logsRing]));
  }

  private notifyStatus(): void {
    const current = this.transientMsg();
    this.statusSubscribers.forEach((cb) => cb(current));
  }
}
