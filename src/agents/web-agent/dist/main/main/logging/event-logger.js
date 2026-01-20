"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.eventLogger = exports.LogLevel = void 0;
const types_1 = require("../../shared/types");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
var LogLevel;
(function (LogLevel) {
    LogLevel["INFO"] = "info";
    LogLevel["SUCCESS"] = "success";
    LogLevel["WARNING"] = "warning";
    LogLevel["ERROR"] = "error";
    LogLevel["DEBUG"] = "debug";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
class EventLogger {
    constructor() {
        this.mainWindow = null;
        this.eventIdCounter = 0;
        this.maxEvents = 1000; // Keep last 1000 events
        this.events = [];
        this.logFileStream = null;
        // Set log file path in logs directory
        const logsDir = path.join(process.cwd(), 'logs');
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
        this.logFilePath = path.join(logsDir, 'app.log');
        // Clear existing log file on startup for fresh logs per execution
        try {
            if (fs.existsSync(this.logFilePath)) {
                fs.unlinkSync(this.logFilePath);
            }
        }
        catch (error) {
            console.warn('[EventLogger] Failed to clear existing log file:', error);
            // Continue anyway - we'll try to create a new one
        }
        // Create write stream for logging (truncate mode to ensure fresh start)
        try {
            this.logFileStream = fs.createWriteStream(this.logFilePath, { flags: 'w' });
            this.logFileStream.write(`=== Application started at ${new Date().toISOString()} ===\n`);
        }
        catch (error) {
            console.error('[EventLogger] Failed to create log file:', error);
            this.logFileStream = null;
        }
    }
    setMainWindow(window) {
        this.mainWindow = window;
    }
    writeToLogFile(event) {
        if (!this.logFileStream) {
            return;
        }
        try {
            const timestamp = new Date(event.timestamp).toISOString();
            const level = event.level.toUpperCase().padEnd(7);
            const category = event.category.padEnd(15);
            const message = event.message;
            const progress = event.progress ? ` [${event.progress.current}/${event.progress.total} (${event.progress.percentage}%)]` : '';
            const details = event.details ? ` | Details: ${JSON.stringify(event.details)}` : '';
            const logLine = `[${timestamp}] ${level} [${category}] ${message}${progress}${details}\n`;
            this.logFileStream.write(logLine);
        }
        catch (error) {
            // Silently fail - don't break logging if file write fails
            console.error('[EventLogger] Failed to write to log file:', error);
        }
    }
    generateId() {
        return `event-${Date.now()}-${++this.eventIdCounter}`;
    }
    emit(event) {
        // Ensure timestamp is valid
        if (!event.timestamp || isNaN(event.timestamp)) {
            event.timestamp = Date.now();
        }
        // Write to log file
        this.writeToLogFile(event);
        // Store event
        this.events.push(event);
        // Keep only last maxEvents
        if (this.events.length > this.maxEvents) {
            this.events.shift();
        }
        // Send to renderer if window is available
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            try {
                // Create a clean copy for IPC (ensure all fields are serializable)
                const ipcEvent = {
                    id: event.id,
                    timestamp: event.timestamp,
                    level: event.level,
                    category: event.category,
                    message: event.message,
                    details: event.details,
                    progress: event.progress,
                };
                // Send event to renderer
                this.mainWindow.webContents.send(types_1.IPCChannels.events.logEvent, ipcEvent);
                // Debug: verify event was sent
                const msgPreview = event.message ? event.message.substring(0, 50) : 'NO MESSAGE';
                console.log(`[EventLogger] Sent event to renderer: ${event.category} - ${msgPreview}`, ipcEvent);
            }
            catch (error) {
                // Window might be closing, ignore silently
                // Only log critical errors that prevent event logging
                if (error && error.message && !error.message.includes('Object has been destroyed')) {
                    // Use console.error only for critical setup issues
                    console.error('[EventLogger] Critical: Failed to send event to renderer:', error.message);
                }
            }
        }
        else {
            // Debug: log when mainWindow is not available
            if (!this.mainWindow) {
                console.warn('[EventLogger] Main window not set - event not sent:', event.category, event.message.substring(0, 50));
            }
        }
    }
    getConsoleMethod(level) {
        switch (level) {
            case LogLevel.ERROR:
                return console.error;
            case LogLevel.WARNING:
                return console.warn;
            case LogLevel.DEBUG:
                return console.debug;
            default:
                return console.log;
        }
    }
    log(level, category, message, details, progress) {
        const event = {
            id: this.generateId(),
            timestamp: Date.now(),
            level,
            category,
            message,
            details,
            progress: progress ? {
                current: progress.current,
                total: progress.total,
                percentage: Math.round((progress.current / progress.total) * 100),
            } : undefined,
        };
        // Also log to console
        const consoleMethod = this.getConsoleMethod(level);
        const logPrefix = `[${category}]`;
        if (details) {
            consoleMethod(logPrefix, message, details);
        }
        else {
            consoleMethod(logPrefix, message);
        }
        this.emit(event);
    }
    // Cleanup method to close log file
    shutdown() {
        if (this.logFileStream) {
            try {
                this.logFileStream.write(`\n=== Application shutdown at ${new Date().toISOString()} ===\n`);
                this.logFileStream.end();
                this.logFileStream = null;
            }
            catch (error) {
                console.error('[EventLogger] Failed to close log file:', error);
            }
        }
    }
    info(category, message, details) {
        this.log(LogLevel.INFO, category, message, details);
    }
    success(category, message, details) {
        this.log(LogLevel.SUCCESS, category, message, details);
    }
    warning(category, message, details) {
        this.log(LogLevel.WARNING, category, message, details);
    }
    error(category, message, details) {
        this.log(LogLevel.ERROR, category, message, details);
    }
    debug(category, message, details) {
        this.log(LogLevel.DEBUG, category, message, details);
    }
    progress(category, message, current, total, details) {
        this.log(LogLevel.INFO, category, message, details, { current, total });
    }
    // Get all events (for initial load)
    getEvents() {
        return [...this.events];
    }
    // Clear events
    clear() {
        this.events = [];
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send(types_1.IPCChannels.log.clear);
        }
    }
}
// Singleton instance
exports.eventLogger = new EventLogger();
//# sourceMappingURL=event-logger.js.map