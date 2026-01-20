"use strict";
// Window Service - Creates and manages Electron BrowserWindow instances
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
exports.WindowService = void 0;
const electron_1 = require("electron");
const path = __importStar(require("path"));
const config_1 = require("../config");
class WindowService {
    /**
     * Creates the main application window
     */
    static createMainWindow() {
        const mainWindow = new electron_1.BrowserWindow({
            width: 1200,
            height: 800,
            minWidth: 800,
            minHeight: 600,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                webSecurity: true,
                allowRunningInsecureContent: false,
                preload: path.resolve(__dirname, '../../../preload/preload/index.js'),
            },
            show: false, // Don't show until ready
            titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
            icon: path.join(__dirname, '../../../assets/icon.png'), // TODO: Add app icon
        });
        // Load the renderer process
        const isDev = process.env.NODE_ENV === 'development';
        if (isDev) {
            const port = (0, config_1.getWebpackDevServerPort)();
            const devServerUrl = `http://localhost:${port}`;
            console.log(`[WindowService] Loading renderer from dev server: ${devServerUrl}`);
            mainWindow.loadURL(devServerUrl);
            // Detach devtools so BrowserView doesn't cover the docked console
            // TEMPORARY: Enable DevTools for debugging
            mainWindow.webContents.openDevTools({ mode: 'detach' });
        }
        else {
            mainWindow.loadFile(path.join(__dirname, '../../../renderer/index.html'));
        }
        // Show window when ready to prevent visual flash
        mainWindow.once('ready-to-show', () => {
            mainWindow.show();
        });
        // Handle window events
        mainWindow.on('closed', () => {
            // Clean up any BrowserViews
            const views = mainWindow.getBrowserViews();
            views.forEach((view) => mainWindow.removeBrowserView(view));
        });
        return mainWindow;
    }
}
exports.WindowService = WindowService;
//# sourceMappingURL=WindowService.js.map