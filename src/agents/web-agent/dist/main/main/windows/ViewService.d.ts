import { BrowserWindow, BrowserView } from 'electron';
import { Tab } from '../../shared/types';
export declare class ViewService {
    /**
     * Creates a BrowserView for a tab
     */
    static createBrowserView(tab: Tab, preloadPath: string, mainWindow?: BrowserWindow): Promise<BrowserView>;
    /**
     * Destroys a BrowserView
     */
    static destroyBrowserView(view: BrowserView): void;
}
//# sourceMappingURL=ViewService.d.ts.map