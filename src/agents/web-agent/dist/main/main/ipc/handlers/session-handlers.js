"use strict";
// Session Management IPC Handlers
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupSessionHandlers = setupSessionHandlers;
const electron_1 = require("electron");
const types_1 = require("../../../shared/types");
const cache_1 = require("../../agent/rag/cache");
function setupSessionHandlers(sessionManager) {
    console.log('[SessionHandlers] Setting up session IPC handlers...');
    console.log('[SessionHandlers] Channel create:', types_1.IPCChannels.session.create);
    console.log('[SessionHandlers] Channel getAll:', types_1.IPCChannels.session.getAll);
    console.log('[SessionHandlers] Channel showView:', types_1.IPCChannels.session.showView);
    // Session creation
    electron_1.ipcMain.handle(types_1.IPCChannels.session.create, async (event, request) => {
        console.log('[SessionHandlers] create handler called');
        const session = await sessionManager.createSession(request);
        const serialized = JSON.parse(JSON.stringify(session));
        return serialized;
    });
    // Get session
    electron_1.ipcMain.handle(types_1.IPCChannels.session.get, async (event, sessionId) => {
        const session = sessionManager.getSession(sessionId);
        if (!session)
            return null;
        const serialized = JSON.parse(JSON.stringify(session));
        if (serialized.tabId) {
            delete serialized.tabId;
        }
        return serialized;
    });
    // Get all sessions
    const getAllChannel = types_1.IPCChannels.session.getAll;
    console.log('[SessionHandlers] Registering getAll handler on channel:', getAllChannel);
    electron_1.ipcMain.handle(getAllChannel, async () => {
        console.log('[SessionHandlers] getAll handler called');
        const sessions = sessionManager.getAllSessions();
        return sessions.map(session => {
            const serialized = JSON.parse(JSON.stringify(session));
            if (serialized.tabId) {
                delete serialized.tabId;
            }
            return serialized;
        });
    });
    // Get session IDs
    electron_1.ipcMain.handle(types_1.IPCChannels.session.getIds, async () => {
        const sessions = sessionManager.getAllSessions();
        return sessions.map(session => ({
            id: session.id,
            title: session.title,
            url: session.url,
            state: session.state,
            messageCount: session.messages.length,
        }));
    });
    // Delete session
    electron_1.ipcMain.handle(types_1.IPCChannels.session.delete, async (event, sessionId) => {
        return sessionManager.deleteSession(sessionId);
    });
    // Get tab ID for session
    electron_1.ipcMain.handle(types_1.IPCChannels.session.getTabId, async (event, sessionId) => {
        return sessionManager.getTabId(sessionId);
    });
    // Navigate session
    electron_1.ipcMain.handle(types_1.IPCChannels.session.navigate, async (event, sessionId, url) => {
        const tabId = sessionManager.getTabId(sessionId);
        if (!tabId) {
            return { success: false, error: 'Session has no associated tab' };
        }
        const { getTabManager } = require('../index');
        const tabManager = getTabManager();
        if (tabManager) {
            const success = tabManager.navigate(tabId, url);
            return { success };
        }
        return { success: false };
    });
    // Show session view
    const showViewChannel = types_1.IPCChannels.session.showView;
    console.log('[SessionHandlers] Registering showView handler on channel:', showViewChannel);
    electron_1.ipcMain.handle(showViewChannel, async (event, sessionId) => {
        console.log('[SessionHandlers] showView handler called with sessionId:', sessionId);
        const { getTabManager } = require('../index');
        const tabManager = getTabManager();
        if (!tabManager) {
            return { success: false, error: 'TabManager not available' };
        }
        if (sessionId === null) {
            // Hide all BrowserViews by moving them off-screen
            const allTabs = tabManager.getTabs();
            console.log('[SessionHandlers] Hiding all BrowserViews, tabs count:', allTabs.length);
            allTabs.forEach((tab) => {
                const view = tabManager.getBrowserView(tab.id);
                if (view) {
                    // Move view off-screen to hide it
                    view.setBounds({ x: -10000, y: -10000, width: 0, height: 0 });
                }
            });
            return { success: true };
        }
        // Show the BrowserView for this session
        const tabId = sessionManager.getTabId(sessionId);
        if (!tabId) {
            return { success: false, error: 'Session has no associated tab' };
        }
        // Hide all other views first
        const allTabs = tabManager.getTabs();
        allTabs.forEach((tab) => {
            if (tab.id !== tabId) {
                const view = tabManager.getBrowserView(tab.id);
                if (view) {
                    view.setBounds({ x: -10000, y: -10000, width: 0, height: 0 });
                }
            }
        });
        // Show the target view (bounds will be set by React ResizeObserver)
        const targetView = tabManager.getBrowserView(tabId);
        if (targetView) {
            // Get mainWindow from TabManager - we need to access it
            // TabManager has mainWindow as a private property, so we'll use switchToTab
            // which handles showing the view properly
            tabManager.switchToTab(tabId);
            console.log('[SessionHandlers] Showing BrowserView for session:', sessionId, 'tab:', tabId);
        }
        else {
            console.warn('[SessionHandlers] BrowserView not found for tab:', tabId);
            return { success: false, error: 'BrowserView not found for session' };
        }
        return { success: true };
    });
    // Update session view bounds
    electron_1.ipcMain.handle(types_1.IPCChannels.session.updateBounds, async (event, sessionId, bounds) => {
        const tabId = sessionManager.getTabId(sessionId);
        if (!tabId) {
            return { success: false };
        }
        const { getTabManager } = require('../index');
        const tabManager = getTabManager();
        if (tabManager) {
            const view = tabManager.getBrowserView(tabId);
            if (view) {
                view.setBounds(bounds);
                return { success: true };
            }
        }
        return { success: false };
    });
    // Get chunks for a session
    electron_1.ipcMain.handle(types_1.IPCChannels.session.getChunks, async (event, sessionId) => {
        const tabId = sessionManager.getTabId(sessionId);
        if (!tabId) {
            return { success: false, error: 'Session not found', chunks: null };
        }
        const cache = (0, cache_1.getCachedContent)(tabId);
        if (!cache) {
            return { success: false, error: 'No cached content for this session', chunks: null };
        }
        // Return chunks with components
        return {
            success: true,
            chunks: cache.chunks,
            components: cache.components,
            pageContent: cache.pageContent,
        };
    });
}
//# sourceMappingURL=session-handlers.js.map