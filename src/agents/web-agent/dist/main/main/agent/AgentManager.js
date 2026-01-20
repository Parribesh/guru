"use strict";
// Agent Manager - Manages agent operations for a specific session
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentManager = void 0;
const types_1 = require("./types");
const AgentService_1 = require("./AgentService");
const tools_1 = require("./tools");
const ollama_1 = require("./llm/ollama");
const service_1 = require("./qa/service");
const cache_1 = require("./rag/cache");
class AgentManager {
    constructor(sessionId, tabId, tabManager, sessionState) {
        this.broadcastCallback = null;
        this.sessionId = sessionId;
        this.tabId = tabId;
        this.tabManager = tabManager;
        this.sessionState = sessionState;
        this.agentService = new AgentService_1.AgentService(sessionState);
    }
    setBroadcastCallback(callback) {
        this.broadcastCallback = callback;
    }
    /**
     * Ask a question to the agent using RAG system
     */
    async askQuestion(question) {
        const session = this.sessionState.getSession();
        // Add user message using AgentService
        this.agentService.addMessage(types_1.MessageRole.USER, question);
        this.agentService.updateState(types_1.AgentState.THINKING);
        this.broadcastUpdate(session);
        try {
            // Use QA service to get answer
            const qaResponse = await (0, service_1.answerQuestion)({
                question,
                tabId: this.tabId,
                context: {
                    url: session.url || '',
                    title: session.title || '',
                },
            });
            if (qaResponse.success) {
                // Add assistant message using AgentService
                const messageId = this.agentService.addMessage(types_1.MessageRole.ASSISTANT, qaResponse.answer);
                // Store additional data (relevantChunks, prompt, etc.)
                if (qaResponse.relevantChunks) {
                    this.agentService.updateMessageData(messageId, {
                        relevantChunks: qaResponse.relevantChunks,
                        sourceLocation: qaResponse.sourceLocation,
                        prompt: qaResponse.prompt,
                    });
                }
                this.agentService.updateState(types_1.AgentState.IDLE);
                this.broadcastUpdate(this.sessionState.getSession());
                return {
                    success: true,
                    answer: qaResponse.answer,
                    relevantChunks: qaResponse.relevantChunks,
                    prompt: qaResponse.prompt,
                };
            }
            else {
                this.agentService.addMessage(types_1.MessageRole.ASSISTANT, qaResponse.error || 'Failed to get response');
                this.agentService.updateState(types_1.AgentState.IDLE);
                this.broadcastUpdate(this.sessionState.getSession());
                return {
                    success: false,
                    error: qaResponse.error,
                };
            }
        }
        catch (error) {
            const errorMessage = error.message || 'Unknown error';
            this.agentService.addMessage(types_1.MessageRole.ASSISTANT, `Error: ${errorMessage}`);
            this.agentService.updateState(types_1.AgentState.IDLE);
            this.broadcastUpdate(this.sessionState.getSession());
            return {
                success: false,
                error: errorMessage,
            };
        }
    }
    /**
     * Ask a question with tool calling support (for DOM interaction)
     */
    async askQuestionWithTools(question) {
        const session = this.sessionState.getSession();
        const browserView = this.tabManager.getBrowserView(this.tabId);
        if (!browserView) {
            throw new Error(`BrowserView not found for tab ${this.tabId}`);
        }
        // Add user message using AgentService
        this.agentService.addMessage(types_1.MessageRole.USER, question);
        this.agentService.updateState(types_1.AgentState.THINKING);
        this.broadcastUpdate(session);
        try {
            // Get page content for context
            const cache = (0, cache_1.getCachedContent)(this.tabId);
            if (!cache) {
                this.agentService.addMessage(types_1.MessageRole.ASSISTANT, 'Page content not cached. Please wait for page to load completely.');
                this.agentService.updateState(types_1.AgentState.IDLE);
                this.broadcastUpdate(this.sessionState.getSession());
                return {
                    success: false,
                    error: 'Page content not cached. Please wait for page to load completely.',
                };
            }
            // Build context from cached content
            const pageContext = cache.pageContent.extractedText.substring(0, 2000);
            // Call AI with tool definitions
            const response = await (0, ollama_1.generateAnswerWithTools)(question, pageContext, tools_1.DOM_TOOLS, async (toolCall) => {
                // Execute tool
                this.agentService.updateState(types_1.AgentState.EXECUTING_TOOL);
                this.broadcastUpdate(this.sessionState.getSession());
                const toolResult = await (0, tools_1.executeTool)(toolCall, browserView);
                // Add tool call and result using AgentService
                const messageId = this.agentService.addMessage(types_1.MessageRole.ASSISTANT, `Executing ${toolCall.name}...`);
                this.agentService.addToolCall(messageId, toolCall);
                this.agentService.addToolResult(messageId, toolResult);
                this.broadcastUpdate(this.sessionState.getSession());
                return toolResult;
            });
            // Add final response using AgentService
            this.agentService.addMessage(types_1.MessageRole.ASSISTANT, response.answer || response.error || 'Task completed');
            this.agentService.updateState(types_1.AgentState.IDLE);
            this.broadcastUpdate(this.sessionState.getSession());
            return {
                success: response.success,
                answer: response.answer,
                error: response.error,
            };
        }
        catch (error) {
            const errorMessage = error.message || 'Unknown error';
            this.agentService.addMessage(types_1.MessageRole.ASSISTANT, `Error: ${errorMessage}`);
            this.agentService.updateState(types_1.AgentState.IDLE);
            this.broadcastUpdate(this.sessionState.getSession());
            return {
                success: false,
                error: errorMessage,
            };
        }
    }
    getBrowserView() {
        return this.tabManager.getBrowserView(this.tabId);
    }
    broadcastUpdate(session) {
        if (this.broadcastCallback) {
            this.broadcastCallback(session);
        }
    }
}
exports.AgentManager = AgentManager;
//# sourceMappingURL=AgentManager.js.map