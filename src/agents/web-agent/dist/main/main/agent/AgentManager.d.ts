import { BrowserView } from 'electron';
import { AgentSessionState } from './AgentSessionState';
import { TabManager } from '../tabs';
export declare class AgentManager {
    private sessionId;
    private tabId;
    private tabManager;
    private sessionState;
    private agentService;
    private broadcastCallback;
    constructor(sessionId: string, tabId: string, tabManager: TabManager, sessionState: AgentSessionState);
    setBroadcastCallback(callback: (session: any) => void): void;
    /**
     * Ask a question to the agent using RAG system
     */
    askQuestion(question: string): Promise<{
        success: boolean;
        answer?: string;
        error?: string;
        relevantChunks?: any[];
        prompt?: string;
    }>;
    /**
     * Ask a question with tool calling support (for DOM interaction)
     */
    askQuestionWithTools(question: string): Promise<{
        success: boolean;
        answer?: string;
        error?: string;
    }>;
    getBrowserView(): BrowserView | null;
    private broadcastUpdate;
}
//# sourceMappingURL=AgentManager.d.ts.map