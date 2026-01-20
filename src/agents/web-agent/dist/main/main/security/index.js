"use strict";
// Security Handlers
Object.defineProperty(exports, "__esModule", { value: true });
exports.preventMultipleInstances = preventMultipleInstances;
exports.setupSecurityHandlers = setupSecurityHandlers;
const electron_1 = require("electron");
/**
 * Prevent multiple instances of the application
 */
function preventMultipleInstances(onSecondInstance) {
    const gotTheLock = electron_1.app.requestSingleInstanceLock();
    if (!gotTheLock) {
        electron_1.app.quit();
        return false;
    }
    else {
        electron_1.app.on('second-instance', onSecondInstance);
        return true;
    }
}
/**
 * Set up security handlers to prevent navigation to external protocols
 */
function setupSecurityHandlers() {
    electron_1.app.on('web-contents-created', (event, contents) => {
        contents.on('will-navigate', (event, navigationUrl) => {
            const parsedUrl = new URL(navigationUrl);
            if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
                event.preventDefault();
            }
        });
    });
}
//# sourceMappingURL=index.js.map