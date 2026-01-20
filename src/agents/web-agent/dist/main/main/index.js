"use strict";
// Main Process Entry Point
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
// Load environment variables from .env file
const dotenv = __importStar(require("dotenv"));
const path = __importStar(require("path"));
// Load .env file from project root
const envPath = path.join(process.cwd(), '.env');
dotenv.config({ path: envPath });
console.log(`[Config] Loading .env from: ${envPath}`);
console.log(`[Config] EMBEDDING_BATCH_SIZE: ${process.env.EMBEDDING_BATCH_SIZE || 'not set (using default: 4)'}`);
const electron_1 = require("electron");
const ipc_1 = require("./ipc");
const WindowService_1 = require("./windows/WindowService");
const event_logger_1 = require("./logging/event-logger");
const menu_1 = require("./menu");
const shortcuts_1 = require("./shortcuts");
const zoom_1 = require("./zoom");
const server_1 = require("./cli/server");
const security_1 = require("./security");
const embedding_service_1 = require("./agent/rag/embedding-service");
const WebSocketManager_1 = require("./websocket/WebSocketManager");
// Global error handlers for crash reporting
const fs = __importStar(require("fs"));
function writeCrashReport(report) {
    try {
        // Always write to logs directory for easy access
        const logsDir = path.join(process.cwd(), 'logs');
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
        const projectLogPath = path.join(logsDir, 'crash-reports.log');
        const reportLine = `[${new Date().toISOString()}] ${JSON.stringify(report, null, 2)}\n\n`;
        fs.appendFileSync(projectLogPath, reportLine, 'utf8');
        console.error(`[CRASH REPORT] Written to: ${projectLogPath}`);
        // Also write to userData if app is ready
        if (electron_1.app.isReady()) {
            try {
                const userDataLogPath = path.join(electron_1.app.getPath('userData'), 'crash-reports.log');
                fs.appendFileSync(userDataLogPath, reportLine, 'utf8');
                console.error(`[CRASH REPORT] Also written to: ${userDataLogPath}`);
            }
            catch (err) {
                // Ignore userData write errors
            }
        }
    }
    catch (err) {
        console.error('[CRASH REPORT] Failed to write crash report to file:', err);
    }
}
process.on('uncaughtException', (error) => {
    const errorReport = {
        type: 'uncaughtException',
        message: error.message,
        stack: error.stack,
        name: error.name,
        timestamp: new Date().toISOString(),
    };
    console.error('[CRASH REPORT] Uncaught Exception:', errorReport);
    console.error('[CRASH REPORT] Full error:', error);
    event_logger_1.eventLogger.error('Crash Report', `Uncaught Exception: ${error.message}`, errorReport);
    // Write to file
    writeCrashReport(errorReport);
});
process.on('unhandledRejection', (reason, promise) => {
    const errorReport = {
        type: 'unhandledRejection',
        reason: reason instanceof Error ? {
            message: reason.message,
            stack: reason.stack,
            name: reason.name,
        } : String(reason),
        timestamp: new Date().toISOString(),
    };
    console.error('[CRASH REPORT] Unhandled Rejection:', errorReport);
    console.error('[CRASH REPORT] Full rejection:', reason, promise);
    event_logger_1.eventLogger.error('Crash Report', `Unhandled Rejection: ${reason instanceof Error ? reason.message : String(reason)}`, errorReport);
    // Write to file
    writeCrashReport(errorReport);
});
// Handle worker thread errors
process.on('warning', (warning) => {
    console.warn('[WARNING]', warning.name, warning.message);
    if (warning.stack) {
        console.warn('[WARNING] Stack:', warning.stack);
    }
    event_logger_1.eventLogger.warning('Process Warning', warning.message, { name: warning.name, stack: warning.stack });
});
let mainWindow = null;
// Security: Prevent multiple instances
if (!(0, security_1.preventMultipleInstances)(() => {
    if (mainWindow) {
        if (mainWindow.isMinimized())
            mainWindow.restore();
        mainWindow.focus();
    }
})) {
    // App will quit if lock failed
}
// Set up security handlers
(0, security_1.setupSecurityHandlers)();
electron_1.app.on('ready', async () => {
    // Set up application menu
    mainWindow = WindowService_1.WindowService.createMainWindow();
    (0, menu_1.setupApplicationMenu)(mainWindow);
    // Set up event logger
    event_logger_1.eventLogger.setMainWindow(mainWindow);
    event_logger_1.eventLogger.info('App', 'Application starting...');
    // Set zoom manager's main window reference
    (0, zoom_1.setMainWindow)(mainWindow);
    // Reset main window zoom to 1.0 on startup
    mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.setZoomFactor(1.0);
        mainWindow.webContents.invalidate();
        event_logger_1.eventLogger.success('App', 'React UI loaded successfully');
    });
    // Initialize WebSocket manager with mainWindow
    WebSocketManager_1.webSocketManager.setMainWindow(mainWindow);
    // Set up IPC handlers
    const { handleCreateSession } = (0, ipc_1.setupIPC)(mainWindow);
    // Register global shortcuts
    (0, shortcuts_1.setupGlobalShortcuts)();
    // Set up CLI server
    (0, server_1.setupCLIServer)(mainWindow, handleCreateSession);
    // Initialize session storage (load URL mappings from disk)
    const { initializeUrlMapping } = require('./agent/rag/session-storage');
    initializeUrlMapping();
    // Check embedding service availability
    const { getEmbeddingService } = require('./agent/rag/embedding-service');
    const embeddingService = getEmbeddingService();
    embeddingService.healthCheck().then((available) => {
        if (available) {
            event_logger_1.eventLogger.success('App', 'Embedding HTTP service is available');
        }
        else {
            event_logger_1.eventLogger.warning('App', 'Embedding HTTP service is not available, will use fallback processing');
        }
    }).catch((error) => {
        event_logger_1.eventLogger.warning('App', `Failed to check embedding service: ${error.message}`);
    });
    // Handle app events
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            mainWindow = WindowService_1.WindowService.createMainWindow();
            (0, menu_1.setupApplicationMenu)(mainWindow);
            (0, zoom_1.setMainWindow)(mainWindow);
            // Update WebSocket manager with new mainWindow
            WebSocketManager_1.webSocketManager.setMainWindow(mainWindow);
        }
    });
});
electron_1.app.on('window-all-closed', () => {
    // On macOS, keep app running even when all windows are closed
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
electron_1.app.on('before-quit', async () => {
    // Unregister global shortcuts
    (0, shortcuts_1.unregisterGlobalShortcuts)();
    // Cleanup WebSocket manager
    try {
        WebSocketManager_1.webSocketManager.cleanup();
        event_logger_1.eventLogger.info('App', 'WebSocket manager cleaned up');
    }
    catch (error) {
        event_logger_1.eventLogger.error('App', `Error cleaning up WebSocket manager: ${error.message}`);
    }
    // Shutdown embedding service
    try {
        (0, embedding_service_1.shutdownEmbeddingService)();
        event_logger_1.eventLogger.info('App', 'Embedding service shut down');
    }
    catch (error) {
        event_logger_1.eventLogger.error('App', `Error shutting down embedding service: ${error.message}`);
    }
    // Clean up resources
    if (mainWindow) {
        mainWindow.destroy();
        mainWindow = null;
    }
    // Close log file
    event_logger_1.eventLogger.shutdown();
});
//# sourceMappingURL=index.js.map