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
exports.socketLogger = exports.SocketLogLevel = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
var SocketLogLevel;
(function (SocketLogLevel) {
    SocketLogLevel["INFO"] = "info";
    SocketLogLevel["SUCCESS"] = "success";
    SocketLogLevel["WARNING"] = "warning";
    SocketLogLevel["ERROR"] = "error";
    SocketLogLevel["DEBUG"] = "debug";
})(SocketLogLevel || (exports.SocketLogLevel = SocketLogLevel = {}));
class SocketLogger {
    constructor() {
        this.logFileStream = null;
        // Create logs directory if it doesn't exist
        this.logsDir = path.join(process.cwd(), 'logs');
        try {
            if (!fs.existsSync(this.logsDir)) {
                fs.mkdirSync(this.logsDir, { recursive: true });
            }
        }
        catch (error) {
            console.warn('[SocketLogger] Failed to create logs directory:', error);
        }
        // Set log file path in logs directory
        this.logFilePath = path.join(this.logsDir, 'socket.log');
        // Clear existing log file on startup for fresh logs per execution
        try {
            if (fs.existsSync(this.logFilePath)) {
                fs.unlinkSync(this.logFilePath);
            }
        }
        catch (error) {
            console.warn('[SocketLogger] Failed to clear existing log file:', error);
        }
        // Create write stream for logging (truncate mode to ensure fresh start)
        try {
            this.logFileStream = fs.createWriteStream(this.logFilePath, { flags: 'w' });
            this.logFileStream.write(`=== WebSocket Logger started at ${new Date().toISOString()} ===\n`);
            this.logFileStream.write(`Log file: ${this.logFilePath}\n`);
            this.logFileStream.write(`================================================\n\n`);
        }
        catch (error) {
            console.error('[SocketLogger] Failed to create log file:', error);
            this.logFileStream = null;
        }
    }
    writeToLogFile(event) {
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
        }
        catch (error) {
            // Silently fail - don't break logging if file write fails
            console.error('[SocketLogger] Failed to write to log file:', error);
        }
    }
    log(level, action, message, details) {
        const event = {
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
    info(action, message, details) {
        this.log(SocketLogLevel.INFO, action, message, details);
    }
    success(action, message, details) {
        this.log(SocketLogLevel.SUCCESS, action, message, details);
    }
    warning(action, message, details) {
        this.log(SocketLogLevel.WARNING, action, message, details);
    }
    error(action, message, details) {
        this.log(SocketLogLevel.ERROR, action, message, details);
    }
    debug(action, message, details) {
        this.log(SocketLogLevel.DEBUG, action, message, details);
    }
    close() {
        if (this.logFileStream) {
            try {
                this.logFileStream.write(`\n=== WebSocket Logger closed at ${new Date().toISOString()} ===\n`);
                this.logFileStream.end();
            }
            catch (error) {
                console.error('[SocketLogger] Failed to close log file:', error);
            }
            this.logFileStream = null;
        }
    }
}
// Export singleton instance
exports.socketLogger = new SocketLogger();
//# sourceMappingURL=socket-logger.js.map