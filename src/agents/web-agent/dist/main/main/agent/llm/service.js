"use strict";
// LLM Service - Generic interface for LLM providers
Object.defineProperty(exports, "__esModule", { value: true });
exports.setLLMService = setLLMService;
exports.getLLMService = getLLMService;
exports.generateAnswer = generateAnswer;
exports.initializeLLMService = initializeLLMService;
const event_logger_1 = require("../../logging/event-logger");
const ollama_1 = require("./ollama");
// Ollama LLM Service Implementation
class OllamaService {
    async generateAnswer(prompt) {
        const result = await (0, ollama_1.generateAnswerFromPrompt)(prompt);
        return {
            answer: result.answer,
            prompt: result.prompt || prompt,
        };
    }
    async checkConnection() {
        return (0, ollama_1.checkOllamaConnection)();
    }
    async ensureModelLoaded() {
        return (0, ollama_1.ensureModelLoaded)();
    }
}
// Default LLM service (Ollama)
let llmService = new OllamaService();
function setLLMService(service) {
    llmService = service;
}
function getLLMService() {
    return llmService;
}
async function generateAnswer(prompt) {
    return llmService.generateAnswer(prompt);
}
async function initializeLLMService() {
    event_logger_1.eventLogger.info('LLM Service', 'Initializing LLM Service...');
    // Check Ollama connection
    event_logger_1.eventLogger.info('LLM Service', 'Checking Ollama connection...');
    const ollamaAvailable = await llmService.checkConnection();
    if (!ollamaAvailable) {
        event_logger_1.eventLogger.warning('LLM Service', 'Ollama not available. LLM features will not work.');
        return;
    }
    // Ensure model is loaded
    try {
        await llmService.ensureModelLoaded();
    }
    catch (error) {
        event_logger_1.eventLogger.warning('LLM Service', 'Failed to ensure Ollama model is loaded', error.message || error);
        // Don't throw - allow app to continue, LLM will show error when used
    }
    event_logger_1.eventLogger.success('LLM Service', 'LLM Service initialized successfully');
}
//# sourceMappingURL=service.js.map