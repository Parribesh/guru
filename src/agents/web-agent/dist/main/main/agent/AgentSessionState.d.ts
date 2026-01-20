import { AgentSession, AgentState, AgentMessage, ToolCall, ToolResult } from './types';
export declare class AgentSessionState {
    private session;
    constructor(sessionId: string, initialUrl?: string);
    getSession(): AgentSession;
    getId(): string;
    getUrl(): string;
    getTitle(): string;
    getState(): AgentState;
    getMessages(): AgentMessage[];
    getContext(): AgentSession['context'];
    getMetadata(): AgentSession['metadata'];
    getCreatedAt(): number;
    getUpdatedAt(): number;
    _updateState(state: AgentState): void;
    _addMessage(message: AgentMessage): void;
    _addToolCall(messageId: string, toolCall: ToolCall): void;
    _addToolResult(messageId: string, toolResult: ToolResult): void;
    _updateContext(context: Partial<AgentSession['context']>): void;
    _updateUrl(url: string): void;
    _updateTitle(title: string): void;
    _updateMessageData(messageId: string, data: any): void;
    _destroy(): void;
}
//# sourceMappingURL=AgentSessionState.d.ts.map