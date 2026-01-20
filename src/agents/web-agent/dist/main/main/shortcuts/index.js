"use strict";
// Global Keyboard Shortcuts
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupGlobalShortcuts = setupGlobalShortcuts;
exports.unregisterGlobalShortcuts = unregisterGlobalShortcuts;
const electron_1 = require("electron");
const zoom_1 = require("../zoom");
function setupGlobalShortcuts() {
    // Zoom In shortcuts
    electron_1.globalShortcut.register('CommandOrControl+=', () => {
        (0, zoom_1.handleZoom)(0.1);
    });
    electron_1.globalShortcut.register('CommandOrControl+Plus', () => {
        (0, zoom_1.handleZoom)(0.1);
    });
    electron_1.globalShortcut.register('CommandOrControl+Shift+=', () => {
        (0, zoom_1.handleZoom)(0.1);
    });
    // Zoom Out shortcuts
    const zoomOutAccelerators = [
        'CommandOrControl+-',
        'CommandOrControl+Minus',
    ];
    for (const accel of zoomOutAccelerators) {
        try {
            electron_1.globalShortcut.register(accel, () => {
                (0, zoom_1.handleZoom)(-0.1);
            });
            break; // Use the first one that works
        }
        catch (error) {
            // Try next accelerator
        }
    }
    // Reset Zoom
    electron_1.globalShortcut.register('CommandOrControl+0', () => {
        (0, zoom_1.handleZoomReset)();
    });
}
function unregisterGlobalShortcuts() {
    electron_1.globalShortcut.unregisterAll();
}
//# sourceMappingURL=index.js.map