"use strict";
// IPC Setup and Management
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTabManager = getTabManager;
exports.getSessionManager = getSessionManager;
exports.setupIPC = setupIPC;
exports.cleanupIPC = cleanupIPC;
const electron_1 = require("electron");
const tabs_1 = require("../tabs");
const SessionManager_1 = require("../session/SessionManager");
const types_1 = require("../../shared/types");
const tab_handlers_1 = require("./handlers/tab-handlers");
const session_handlers_1 = require("./handlers/session-handlers");
const agent_handlers_1 = require("./handlers/agent-handlers");
const dom_handlers_1 = require("./handlers/dom-handlers");
const misc_handlers_1 = require("./handlers/misc-handlers");
let tabManager = null;
let sessionManager = null;
// Export getters for accessing managers
function getTabManager() {
    return tabManager;
}
function getSessionManager() {
    return sessionManager;
}
function setupIPC(mainWindow) {
    console.log('[IPC] Setting up IPC handlers...');
    // Initialize managers
    tabManager = new tabs_1.TabManager(mainWindow);
    sessionManager = new SessionManager_1.SessionManager(mainWindow, tabManager);
    console.log('[IPC] TabManager and SessionManager created');
    // Set up all IPC handlers
    console.log('[IPC] Registering IPC handlers...');
    (0, tab_handlers_1.setupTabHandlers)(tabManager);
    (0, session_handlers_1.setupSessionHandlers)(sessionManager);
    (0, agent_handlers_1.setupAgentHandlers)(sessionManager);
    (0, dom_handlers_1.setupDOMHandlers)(tabManager);
    (0, misc_handlers_1.setupMiscHandlers)(mainWindow);
    // Verify handlers are registered
    const registeredHandlers = electron_1.ipcMain._handlers || {};
    console.log('[IPC] Registered handlers count:', Object.keys(registeredHandlers).length);
    console.log('[IPC] Checking session handlers:');
    console.log('  - session:create:', !!registeredHandlers[types_1.IPCChannels.session.create]);
    console.log('  - session:get-all:', !!registeredHandlers[types_1.IPCChannels.session.getAll]);
    console.log('  - session:show-view:', !!registeredHandlers[types_1.IPCChannels.session.showView]);
    console.log('[IPC] All IPC handlers registered successfully');
    // Handle window resize
    mainWindow.on('resize', () => {
        const [width, height] = mainWindow.getSize();
        tabManager.onWindowResize(width, height);
    });
    // Security: Validate IPC channels
    const allowedChannels = new Set();
    // Add all channels from IPCChannels object
    Object.values(types_1.IPCChannels).forEach(category => {
        if (typeof category === 'object') {
            Object.values(category).forEach(channel => {
                if (typeof channel === 'string') {
                    allowedChannels.add(channel);
                }
            });
        }
    });
    electron_1.ipcMain.on('validate-channel', (event, channel) => {
        event.returnValue = allowedChannels.has(channel);
    });
    // Handle app-level events from renderer
    electron_1.ipcMain.on(types_1.IPCChannels.events.appEvent, (event, eventType, data) => {
        switch (eventType) {
            case 'tab-created':
            case 'tab-closed':
            case 'navigation':
                // Log app events
                break;
            default:
                console.log('Unknown app event:', eventType, data);
        }
    });
    // Extract handleCreateSession for CLI
    async function handleCreateSession(event, request) {
        if (!sessionManager) {
            throw new Error('SessionManager not initialized');
        }
        const session = await sessionManager.createSession(request);
        const serialized = JSON.parse(JSON.stringify(session));
        return serialized;
    }
    return {
        tabManager,
        sessionManager,
        handleCreateSession,
    };
}
function cleanupIPC() {
    // Cleanup if needed
    tabManager = null;
    sessionManager = null;
}
//# sourceMappingURL=index.js.map