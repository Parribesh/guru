import { AgentState, MessageRole, ToolCall, ToolResult, AgentMessage } from './types';
import { AgentSessionState } from './AgentSessionState';
export declare class AgentService {
    private sessionState;
    constructor(sessionState: AgentSessionState);
    /**
     * Add a message to the session
     */
    addMessage(role: MessageRole, content: string, metadata?: AgentMessage['metadata']): string;
    /**
     * Update session state
     */
    updateState(state: AgentState): void;
    /**
     * Add a tool call to a message
     */
    addToolCall(messageId: string, toolCall: ToolCall): void;
    /**
     * Add a tool result to a message
     */
    addToolResult(messageId: string, toolResult: ToolResult): void;
    /**
     * Update session context
     */
    updateContext(context: Partial<import('./types').AgentSession['context']>): void;
    /**
     * Update session URL
     */
    updateUrl(url: string): void;
    /**
     * Update session title
     */
    updateTitle(title: string): void;
    /**
     * Update message data (for storing additional metadata like relevantChunks, prompt, etc.)
     */
    updateMessageData(messageId: string, data: any): void;
    /**
     * Get the session state (for reading)
     */
    getSessionState(): AgentSessionState;
}
//# sourceMappingURL=AgentService.d.ts.map