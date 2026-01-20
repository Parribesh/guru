"use strict";
// Application Menu Setup
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupApplicationMenu = setupApplicationMenu;
const electron_1 = require("electron");
const zoom_1 = require("../zoom");
const types_1 = require("../../shared/types");
let mainWindow = null;
function setupApplicationMenu(window) {
    mainWindow = window;
    const template = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'New Tab',
                    accelerator: 'CmdOrCtrl+T',
                    click: () => {
                        mainWindow?.webContents.send(types_1.IPCChannels.events.tabCreated);
                    },
                },
                {
                    label: 'Close Tab',
                    accelerator: 'CmdOrCtrl+W',
                    click: () => {
                        mainWindow?.webContents.send(types_1.IPCChannels.events.tabClosed);
                    },
                },
                { type: 'separator' },
                {
                    label: 'Quit',
                    accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
                    click: () => {
                        electron_1.app.quit();
                    },
                },
            ],
        },
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'selectAll' },
            ],
        },
        {
            label: 'View',
            submenu: [
                {
                    label: 'Toggle AI Panel',
                    accelerator: 'CmdOrCtrl+Shift+A',
                    click: () => {
                        mainWindow?.webContents.send(types_1.IPCChannels.events.aiTogglePanel);
                    },
                },
                {
                    label: 'Command Palette',
                    accelerator: 'CmdOrCtrl+K',
                    click: () => {
                        mainWindow?.webContents.send(types_1.IPCChannels.events.commandPaletteToggle);
                    },
                },
                { type: 'separator' },
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                {
                    label: 'Reset Zoom',
                    accelerator: 'CmdOrCtrl+0',
                    click: () => {
                        (0, zoom_1.handleZoomReset)();
                    },
                },
                {
                    label: 'Zoom In',
                    accelerator: 'CmdOrCtrl+=',
                    click: () => {
                        (0, zoom_1.handleZoom)(0.1);
                    },
                },
                {
                    label: 'Zoom Out',
                    accelerator: 'CmdOrCtrl+-',
                    click: () => {
                        (0, zoom_1.handleZoom)(-0.1);
                    },
                },
                { type: 'separator' },
                { role: 'togglefullscreen' },
            ],
        },
        {
            label: 'Window',
            submenu: [{ role: 'minimize' }, { role: 'close' }],
        },
    ];
    // macOS specific menu
    if (process.platform === 'darwin') {
        template.unshift({
            label: electron_1.app.getName(),
            submenu: [
                { role: 'about' },
                { type: 'separator' },
                { role: 'services', submenu: [] },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' },
            ],
        });
    }
    const menu = electron_1.Menu.buildFromTemplate(template);
    electron_1.Menu.setApplicationMenu(menu);
}
//# sourceMappingURL=index.js.map