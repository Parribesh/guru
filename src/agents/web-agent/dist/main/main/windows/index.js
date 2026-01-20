"use strict";
// Windows module - exports for window and view services
Object.defineProperty(exports, "__esModule", { value: true });
exports.setBrowserViewBounds = exports.updateBrowserViewBounds = exports.ViewService = exports.WindowService = void 0;
exports.createMainWindow = createMainWindow;
exports.createBrowserView = createBrowserView;
exports.destroyBrowserView = destroyBrowserView;
var WindowService_1 = require("./WindowService");
Object.defineProperty(exports, "WindowService", { enumerable: true, get: function () { return WindowService_1.WindowService; } });
var ViewService_1 = require("./ViewService");
Object.defineProperty(exports, "ViewService", { enumerable: true, get: function () { return ViewService_1.ViewService; } });
var bounds_1 = require("./bounds");
Object.defineProperty(exports, "updateBrowserViewBounds", { enumerable: true, get: function () { return bounds_1.updateBrowserViewBounds; } });
Object.defineProperty(exports, "setBrowserViewBounds", { enumerable: true, get: function () { return bounds_1.setBrowserViewBounds; } });
// Legacy exports for backward compatibility during migration
const WindowService_2 = require("./WindowService");
const ViewService_2 = require("./ViewService");
function createMainWindow() {
    return WindowService_2.WindowService.createMainWindow();
}
async function createBrowserView(tab, preloadPath, mainWindow) {
    return ViewService_2.ViewService.createBrowserView(tab, preloadPath, mainWindow);
}
function destroyBrowserView(view) {
    return ViewService_2.ViewService.destroyBrowserView(view);
}
//# sourceMappingURL=index.js.map