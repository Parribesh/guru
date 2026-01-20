"use strict";
// Tab Management IPC Handlers
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupTabHandlers = setupTabHandlers;
const electron_1 = require("electron");
const types_1 = require("../../../shared/types");
function setupTabHandlers(tabManager) {
    electron_1.ipcMain.handle(types_1.IPCChannels.tab.create, async (event, url) => {
        const tabId = await tabManager.createTab(url);
        const tabs = tabManager.getTabs();
        return { tabId, tabs };
    });
    electron_1.ipcMain.handle(types_1.IPCChannels.tab.close, async (event, tabId) => {
        const success = await tabManager.closeTab(tabId);
        const tabs = tabManager.getTabs();
        const activeTabId = tabManager.getActiveTabId();
        return { success, tabs, activeTabId };
    });
    electron_1.ipcMain.handle(types_1.IPCChannels.tab.switch, async (event, tabId) => {
        const success = tabManager.switchToTab(tabId);
        return { success };
    });
    electron_1.ipcMain.handle(types_1.IPCChannels.navigation.navigate, async (event, tabId, url) => {
        const success = tabManager.navigate(tabId, url);
        return { success };
    });
    electron_1.ipcMain.handle(types_1.IPCChannels.navigation.goBack, async (event, tabId) => {
        const success = tabManager.goBack(tabId);
        return { success };
    });
    electron_1.ipcMain.handle(types_1.IPCChannels.navigation.goForward, async (event, tabId) => {
        const success = tabManager.goForward(tabId);
        return { success };
    });
    electron_1.ipcMain.handle(types_1.IPCChannels.navigation.reload, async (event, tabId) => {
        const success = tabManager.reload(tabId);
        return { success };
    });
    electron_1.ipcMain.handle(types_1.IPCChannels.navigation.stopLoading, async (event, tabId) => {
        const success = tabManager.stopLoading(tabId);
        return { success };
    });
    electron_1.ipcMain.handle(types_1.IPCChannels.tab.getAll, async () => {
        return {
            tabs: tabManager.getTabs(),
            activeTabId: tabManager.getActiveTabId(),
        };
    });
    // Zoom handlers
    electron_1.ipcMain.on(types_1.IPCChannels.zoom.in, () => {
        tabManager.zoomActiveTab(0.1);
    });
    electron_1.ipcMain.on(types_1.IPCChannels.zoom.out, () => {
        tabManager.zoomActiveTab(-0.1);
    });
    electron_1.ipcMain.on(types_1.IPCChannels.zoom.reset, () => {
        tabManager.resetZoomActiveTab();
    });
}
//# sourceMappingURL=tab-handlers.js.map