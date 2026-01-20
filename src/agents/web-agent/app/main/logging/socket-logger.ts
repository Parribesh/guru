import * as fs from 'fs';
import * as path from 'path';

export enum SocketLogLevel {
  INFO = 'info',
  SUCCESS = 'success',
  WARNING = 'warning',
  ERROR = 'error',
  DEBUG = 'debug',
}

export interface SocketLogEvent {
  timestamp: number;
  level: SocketLogLevel;
  action: string;
  message: string;
  details?: any;
}

class SocketLogger {
  private logFilePath: string;
  private logFileStream: fs.WriteStream | null = null;
  private logsDir: string;

  constructor() {
    // Create logs directory if it doesn't exist
    this.logsDir = path.join(process.cwd(), 'logs');
    try {
      if (!fs.existsSync(this.logsDir)) {
        fs.mkdirSync(this.logsDir, { recursive: true });
      }
    } catch (error) {
      console.warn('[SocketLogger] Failed to create logs directory:', error);
    }

    // Set log file path in logs directory
    this.logFilePath = path.join(this.logsDir, 'socket.log');
    
    // Clear existing log file on startup for fresh logs per execution
    try {
      if (fs.existsSync(this.logFilePath)) {
        fs.unlinkSync(this.logFilePath);
      }
    } catch (error) {
      console.warn('[SocketLogger] Failed to clear existing log file:', error);
    }
    
    // Create write stream for logging (truncate mode to ensure fresh start)
    try {
      this.logFileStream = fs.createWriteStream(this.logFilePath, { flags: 'w' });
      this.logFileStream.write(`=== WebSocket Logger started at ${new Date().toISOString()} ===\n`);
      this.logFileStream.write(`Log file: ${this.logFilePath}\n`);
      this.logFileStream.write(`================================================\n\n`);
    } catch (error) {
      console.error('[SocketLogger] Failed to create log file:', error);
      this.logFileStream = null;
    }
  }

  private writeToLogFile(event: SocketLogEvent): void {
    if (!this.logFileStream) {
      return;
    }

    try {
      const timestamp = new Date(event.timestamp).toISOString();
      const level = event.level.toUpperCase().padEnd(7);
      const action = event.action.padEnd(20);
      const message = event.message;
      const details = event.details ? ` | Details: ${JSON.stringify(event.details, null, 2)}` : '';
      
      const logLine = `[${timestamp}] ${level} [${action}] ${message}${details}\n`;
      this.logFileStream.write(logLine);
      // WriteStream automatically flushes when buffer is full or stream closes
    } catch (error) {
      // Silently fail - don't break logging if file write fails
      console.error('[SocketLogger] Failed to write to log file:', error);
    }
  }

  private log(level: SocketLogLevel, action: string, message: string, details?: any) {
    const event: SocketLogEvent = {
      timestamp: Date.now(),
      level,
      action,
      message,
      details,
    };
    
    // Write to log file
    this.writeToLogFile(event);
    
    // Also log to console with prefix
    const consoleMessage = `[SocketLogger] ${action}: ${message}`;
    switch (level) {
      case SocketLogLevel.ERROR:
        console.error(consoleMessage, details || '');
        break;
      case SocketLogLevel.WARNING:
        console.warn(consoleMessage, details || '');
        break;
      case SocketLogLevel.DEBUG:
        console.debug(consoleMessage, details || '');
        break;
      case SocketLogLevel.SUCCESS:
        console.log(consoleMessage, details || '');
        break;
      default:
        console.log(consoleMessage, details || '');
    }
  }

  info(action: string, message: string, details?: any) {
    this.log(SocketLogLevel.INFO, action, message, details);
  }

  success(action: string, message: string, details?: any) {
    this.log(SocketLogLevel.SUCCESS, action, message, details);
  }

  warning(action: string, message: string, details?: any) {
    this.log(SocketLogLevel.WARNING, action, message, details);
  }

  error(action: string, message: string, details?: any) {
    this.log(SocketLogLevel.ERROR, action, message, details);
  }

  debug(action: string, message: string, details?: any) {
    this.log(SocketLogLevel.DEBUG, action, message, details);
  }

  close() {
    if (this.logFileStream) {
      try {
        this.logFileStream.write(`\n=== WebSocket Logger closed at ${new Date().toISOString()} ===\n`);
        this.logFileStream.end();
      } catch (error) {
        console.error('[SocketLogger] Failed to close log file:', error);
      }
      this.logFileStream = null;
    }
  }
}

// Export singleton instance
export const socketLogger = new SocketLogger();

