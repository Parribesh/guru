"use strict";
// Agent Session State - Pure data container for session state (read-only for UI)
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentSessionState = void 0;
const types_1 = require("./types");
class AgentSessionState {
    constructor(sessionId, initialUrl) {
        this.session = {
            id: sessionId,
            url: initialUrl || '',
            title: 'New Session',
            state: types_1.AgentState.IDLE,
            messages: [],
            context: {
                url: initialUrl || '',
                title: 'New Session',
                content: '',
                chunks: [],
                embeddings: []
            },
            createdAt: Date.now(),
            updatedAt: Date.now(),
            metadata: {
                totalTokens: 0,
                toolCallsCount: 0
            }
        };
    }
    // Getters only - state is read-only from outside
    getSession() {
        return this.session;
    }
    getId() {
        return this.session.id;
    }
    getUrl() {
        return this.session.url;
    }
    getTitle() {
        return this.session.title;
    }
    getState() {
        return this.session.state;
    }
    getMessages() {
        return this.session.messages;
    }
    getContext() {
        return this.session.context;
    }
    getMetadata() {
        return this.session.metadata;
    }
    getCreatedAt() {
        return this.session.createdAt;
    }
    getUpdatedAt() {
        return this.session.updatedAt;
    }
    // Internal methods for AgentService to update state
    // These should only be called by AgentService, not directly
    _updateState(state) {
        this.session.state = state;
        this.session.updatedAt = Date.now();
    }
    _addMessage(message) {
        this.session.messages.push(message);
        this.session.updatedAt = Date.now();
        if (message.metadata?.tokens) {
            this.session.metadata.totalTokens = (this.session.metadata.totalTokens || 0) + message.metadata.tokens;
        }
    }
    _addToolCall(messageId, toolCall) {
        const message = this.session.messages.find(m => m.id === messageId);
        if (message) {
            if (!message.toolCalls) {
                message.toolCalls = [];
            }
            message.toolCalls.push(toolCall);
            this.session.metadata.toolCallsCount = (this.session.metadata.toolCallsCount || 0) + 1;
            this.session.updatedAt = Date.now();
        }
    }
    _addToolResult(messageId, toolResult) {
        const message = this.session.messages.find(m => m.id === messageId);
        if (message) {
            if (!message.toolResults) {
                message.toolResults = [];
            }
            message.toolResults.push(toolResult);
            this.session.updatedAt = Date.now();
        }
    }
    _updateContext(context) {
        this.session.context = { ...this.session.context, ...context };
        this.session.updatedAt = Date.now();
    }
    _updateUrl(url) {
        this.session.url = url;
        this.session.context.url = url;
        this.session.updatedAt = Date.now();
    }
    _updateTitle(title) {
        this.session.title = title;
        this.session.context.title = title;
        this.session.updatedAt = Date.now();
    }
    _updateMessageData(messageId, data) {
        const message = this.session.messages.find(m => m.id === messageId);
        if (message) {
            message.data = data;
            this.session.updatedAt = Date.now();
        }
    }
    _destroy() {
        // Clear references
        this.session.messages = [];
        this.session.context = {
            url: '',
            title: '',
            content: '',
            chunks: [],
            embeddings: []
        };
    }
}
exports.AgentSessionState = AgentSessionState;
//# sourceMappingURL=AgentSessionState.js.map