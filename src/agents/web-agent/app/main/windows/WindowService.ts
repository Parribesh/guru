// Window Service - Creates and manages Electron BrowserWindow instances

import { BrowserWindow } from 'electron';
import * as path from 'path';
import { getWebpackDevServerPort } from '../config';

export class WindowService {
  /**
   * Creates the main application window
   */
  static createMainWindow(): BrowserWindow {
    const mainWindow = new BrowserWindow({
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
      const port = getWebpackDevServerPort();
      const devServerUrl = `http://localhost:${port}`;
      console.log(`[WindowService] Loading renderer from dev server: ${devServerUrl}`);
      mainWindow.loadURL(devServerUrl);
      // Detach devtools so BrowserView doesn't cover the docked console
      // TEMPORARY: Enable DevTools for debugging
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    } else {
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

