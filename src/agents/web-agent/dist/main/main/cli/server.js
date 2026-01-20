"use strict";
// CLI Server for Command-Line Interface
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupCLIServer = setupCLIServer;
const net = __importStar(require("net"));
const ipc_1 = require("../ipc");
const embedding_service_1 = require("../agent/rag/embedding-service");
const config_1 = require("../config");
const CLI_PORT = (0, config_1.getCLIServerPort)();
function setupCLIServer(mainWindow, handleCreateSession) {
    const server = net.createServer((socket) => {
        let buffer = '';
        socket.on('data', async (data) => {
            buffer += data.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
                if (!line.trim())
                    continue;
                try {
                    const command = JSON.parse(line);
                    let response;
                    try {
                        if (command.type === 'create-session') {
                            const urlArg = command.url;
                            const session = await handleCreateSession(null, { url: urlArg });
                            response = {
                                success: true,
                                data: `Session created: ${session.id}\nTitle: ${session.title}\nURL: ${session.url || 'none'}`,
                            };
                        }
                        else if (command.type === 'list-sessions') {
                            const sessionManager = (0, ipc_1.getSessionManager)();
                            if (!sessionManager) {
                                response = { success: false, error: 'SessionManager not available' };
                            }
                            else {
                                const sessions = sessionManager.getAllSessions();
                                response = {
                                    success: true,
                                    data: sessions.map((s) => ({
                                        id: s.id,
                                        title: s.title,
                                        url: s.url,
                                        state: s.state,
                                        messages: s.messages.length,
                                    })),
                                };
                            }
                        }
                        else if (command.type === 'ask-question') {
                            const sessionManager = (0, ipc_1.getSessionManager)();
                            if (!sessionManager) {
                                response = { success: false, error: 'SessionManager not available' };
                            }
                            else {
                                const session = sessionManager.getSession(command.sessionId);
                                if (!session) {
                                    response = { success: false, error: `Session not found: ${command.sessionId}` };
                                }
                                else {
                                    const agentManager = sessionManager.getAgentManager(command.sessionId);
                                    if (!agentManager) {
                                        response = { success: false, error: `AgentManager not found for session: ${command.sessionId}` };
                                    }
                                    else {
                                        const qaResponse = await agentManager.askQuestion(command.question);
                                        if (qaResponse.success) {
                                            response = {
                                                success: true,
                                                data: `Answer: ${qaResponse.answer}\nUsed ${qaResponse.relevantChunks?.length || 0} relevant chunk(s)`,
                                            };
                                        }
                                        else {
                                            response = { success: false, error: qaResponse.error || 'Failed to get answer' };
                                        }
                                    }
                                }
                            }
                        }
                        else if (command.type === 'get-chunks') {
                            const sessionManager = (0, ipc_1.getSessionManager)();
                            if (!sessionManager) {
                                response = { success: false, error: 'SessionManager not available' };
                            }
                            else {
                                const tabId = sessionManager.getTabId(command.sessionId);
                                if (!tabId) {
                                    response = { success: false, error: `Session not found: ${command.sessionId}` };
                                }
                                else {
                                    const { getCachedContent } = require('../agent/rag/cache');
                                    const cache = getCachedContent(tabId);
                                    if (!cache) {
                                        response = { success: false, error: 'No cached content yet - page may still be loading' };
                                    }
                                    else {
                                        const totalChunks = cache.chunks.length;
                                        const componentChunks = cache.chunks.filter((c) => c.componentType && c.componentType !== 'text' && c.componentType !== 'section').length;
                                        const nestedChunks = cache.chunks.reduce((sum, c) => sum + (c.nestedChunks?.length || 0), 0);
                                        const totalWithNested = totalChunks + nestedChunks;
                                        response = {
                                            success: true,
                                            data: `Chunks for session ${command.sessionId}:\n` +
                                                `  Total chunks: ${totalChunks}\n` +
                                                `  Component chunks: ${componentChunks}\n` +
                                                `  Nested chunks: ${nestedChunks}\n` +
                                                `  Total (including nested): ${totalWithNested}\n` +
                                                `  Components extracted: ${cache.components.length}`,
                                        };
                                    }
                                }
                            }
                        }
                        else if (command.type === 'embedding-service-status') {
                            try {
                                const service = (0, embedding_service_1.getEmbeddingService)();
                                const isAvailable = await service.healthCheck();
                                const socketConnected = service.socket && service.socket.readyState === 1;
                                let output = `\n📊 Embedding Service Status\n`;
                                output += `${'='.repeat(60)}\n\n`;
                                output += `Service URL: ${service.baseUrl || 'http://localhost:8000'}\n`;
                                output += `Status: ${isAvailable ? '✅ Available' : '❌ Unavailable'}\n`;
                                output += `Pending Tasks: ${service.pendingTasks ? service.pendingTasks.size : 0}\n`;
                                output += `Socket Connected: ${socketConnected ? '✅ Yes' : '❌ No'}\n`;
                                response = {
                                    success: true,
                                    data: output,
                                };
                            }
                            catch (error) {
                                response = { success: false, error: error.message || 'Failed to get embedding service status' };
                            }
                        }
                        else {
                            response = { success: false, error: `Unknown command type: ${command.type}` };
                        }
                    }
                    catch (error) {
                        response = { success: false, error: error.message || 'Unknown error' };
                    }
                    socket.write(JSON.stringify(response) + '\n');
                }
                catch (parseError) {
                    socket.write(JSON.stringify({ success: false, error: 'Invalid JSON' }) + '\n');
                }
            }
        });
        socket.on('end', () => {
            // Client disconnected
        });
        socket.on('error', (err) => {
            console.error('CLI socket error:', err);
        });
    });
    server.listen(CLI_PORT, '127.0.0.1', () => {
        console.log(`✅ CLI server listening on port ${CLI_PORT}`);
    });
    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.warn(`⚠️ CLI port ${CLI_PORT} already in use`);
        }
        else {
            console.error('CLI server error:', err);
        }
    });
}
//# sourceMappingURL=server.js.map