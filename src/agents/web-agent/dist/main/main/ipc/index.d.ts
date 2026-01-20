import { BrowserWindow } from 'electron';
import { TabManager } from '../tabs';
import { SessionManager } from '../session/SessionManager';
export declare function getTabManager(): TabManager | null;
export declare function getSessionManager(): SessionManager | null;
export declare function setupIPC(mainWindow: BrowserWindow): {
    tabManager: TabManager;
    sessionManager: SessionManager;
    handleCreateSession: (event: any, request: {
        url?: string;
        initialMessage?: string;
    }) => Promise<any>;
};
export declare function cleanupIPC(): void;
//# sourceMappingURL=index.d.ts.map