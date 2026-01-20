import { BrowserWindow, BrowserView } from 'electron';
import { Tab } from '../../shared/types';
export declare class TabManager {
    private tabs;
    private views;
    private activeTabId;
    private mainWindow;
    private preloadPath;
    constructor(mainWindow: BrowserWindow);
    getBrowserView(tabId: string): BrowserView | null;
    destroy(): void;
    private getDevDefaultUrl;
    createTab(url?: string): Promise<string>;
    closeTab(tabId: string): Promise<boolean>;
    switchToTab(tabId: string): boolean;
    navigate(tabId: string, url: string): boolean;
    goBack(tabId: string): boolean;
    goForward(tabId: string): boolean;
    reload(tabId: string): boolean;
    stopLoading(tabId: string): boolean;
    getTabs(): Tab[];
    getActiveTab(): Tab | null;
    getActiveTabId(): string | null;
    getTabIdByWebContents(webContentsId: number): string | null;
    updateTabInfo(tabId: string, updates: Partial<Tab>): boolean;
    zoomActiveTab(delta: number): boolean;
    resetZoomActiveTab(): boolean;
    onWindowResize(width: number, height: number): void;
}
//# sourceMappingURL=TabManager.d.ts.map