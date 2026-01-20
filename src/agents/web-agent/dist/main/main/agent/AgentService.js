"use strict";
// Agent Service - Handles all agent operations (messages, tools, state updates)
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentService = void 0;
const uuid_1 = require("uuid");
class AgentService {
    constructor(sessionState) {
        this.sessionState = sessionState;
    }
    /**
     * Add a message to the session
     */
    addMessage(role, content, metadata) {
        const messageId = (0, uuid_1.v4)();
        const message = {
            id: messageId,
            role,
            content,
            timestamp: Date.now(),
            metadata
        };
        this.sessionState._addMessage(message);
        return messageId;
    }
    /**
     * Update session state
     */
    updateState(state) {
        this.sessionState._updateState(state);
    }
    /**
     * Add a tool call to a message
     */
    addToolCall(messageId, toolCall) {
        this.sessionState._addToolCall(messageId, toolCall);
    }
    /**
     * Add a tool result to a message
     */
    addToolResult(messageId, toolResult) {
        this.sessionState._addToolResult(messageId, toolResult);
    }
    /**
     * Update session context
     */
    updateContext(context) {
        this.sessionState._updateContext(context);
    }
    /**
     * Update session URL
     */
    updateUrl(url) {
        this.sessionState._updateUrl(url);
    }
    /**
     * Update session title
     */
    updateTitle(title) {
        this.sessionState._updateTitle(title);
    }
    /**
     * Update message data (for storing additional metadata like relevantChunks, prompt, etc.)
     */
    updateMessageData(messageId, data) {
        this.sessionState._updateMessageData(messageId, data);
    }
    /**
     * Get the session state (for reading)
     */
    getSessionState() {
        return this.sessionState;
    }
}
exports.AgentService = AgentService;
//# sourceMappingURL=AgentService.js.map