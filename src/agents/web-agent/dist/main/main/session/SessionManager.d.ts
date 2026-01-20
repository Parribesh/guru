import { EventEmitter } from 'events';
import { BrowserWindow } from 'electron';
import { AgentSession, SessionCreateRequest } from '../agent/types';
import { TabManager } from '../tabs';
import { AgentManager } from '../agent/AgentManager';
export declare class SessionManager extends EventEmitter {
    private sessions;
    private mainWindow;
    private tabManager;
    constructor(mainWindow: BrowserWindow, tabManager: TabManager);
    createSession(request?: SessionCreateRequest): Promise<AgentSession>;
    getSession(sessionId: string): AgentSession | null;
    getAgentManager(sessionId: string): AgentManager | null;
    getTabId(sessionId: string): string | null;
    getSessionIdByTabId(tabId: string): string | null;
    getAllSessions(): AgentSession[];
    deleteSession(sessionId: string): Promise<boolean>;
    private serializeSession;
    broadcastSessionUpdate(session: AgentSession): void;
}
//# sourceMappingURL=SessionManager.d.ts.map