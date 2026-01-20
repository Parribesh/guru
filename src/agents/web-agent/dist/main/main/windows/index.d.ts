export { WindowService } from './WindowService';
export { ViewService } from './ViewService';
export { updateBrowserViewBounds, setBrowserViewBounds } from './bounds';
export declare function createMainWindow(): Electron.CrossProcessExports.BrowserWindow;
export declare function createBrowserView(tab: any, preloadPath: string, mainWindow?: any): Promise<Electron.CrossProcessExports.BrowserView>;
export declare function destroyBrowserView(view: any): void;
//# sourceMappingURL=index.d.ts.map