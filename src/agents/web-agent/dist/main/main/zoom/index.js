"use strict";
// Zoom Management
Object.defineProperty(exports, "__esModule", { value: true });
exports.setMainWindow = setMainWindow;
exports.handleZoom = handleZoom;
exports.handleZoomReset = handleZoomReset;
const ipc_1 = require("../ipc");
let mainWindow = null;
function setMainWindow(window) {
    mainWindow = window;
}
function handleZoom(delta) {
    // Zoom the React UI (main window)
    if (mainWindow) {
        const currentZoom = mainWindow.webContents.getZoomFactor();
        const newZoom = delta > 0
            ? Math.min(currentZoom + delta, 5.0)
            : Math.max(currentZoom + delta, 0.1);
        mainWindow.webContents.setZoomFactor(newZoom);
        mainWindow.webContents.invalidate();
    }
    // Zoom the BrowserView (web content)
    const tabsManager = (0, ipc_1.getTabManager)();
    if (tabsManager) {
        tabsManager.zoomActiveTab(delta);
    }
}
function handleZoomReset() {
    // Reset React UI (main window) zoom
    if (mainWindow) {
        mainWindow.webContents.setZoomFactor(1.0);
        mainWindow.webContents.invalidate();
    }
    // Reset BrowserView (web content) zoom
    const tabsManager = (0, ipc_1.getTabManager)();
    if (tabsManager) {
        tabsManager.resetZoomActiveTab();
    }
}
//# sourceMappingURL=index.js.map