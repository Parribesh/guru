"use strict";
// Agent Operations IPC Handlers
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
exports.setupAgentHandlers = setupAgentHandlers;
const electron_1 = require("electron");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const types_1 = require("../../../shared/types");
function setupAgentHandlers(sessionManager) {
    console.log('[AgentHandlers] Setting up agent IPC handlers...');
    console.log('[AgentHandlers] Channel getTestBookingUrl:', types_1.IPCChannels.utils.getTestBookingUrl);
    // Send message to agent
    electron_1.ipcMain.handle(types_1.IPCChannels.agent.sendMessage, async (event, sessionId, content) => {
        const agentManager = sessionManager.getAgentManager(sessionId);
        if (!agentManager) {
            return { success: false, error: `Session ${sessionId} not found` };
        }
        try {
            await agentManager.askQuestion(content);
            return { success: true };
        }
        catch (error) {
            console.error('Error processing message:', error);
            return { success: false, error: error.message };
        }
    });
    // Helper to get test booking URL
    electron_1.ipcMain.handle(types_1.IPCChannels.utils.getTestBookingUrl, async () => {
        console.log('[AgentHandlers] getTestBookingUrl handler called');
        let testBookingPath;
        if (__dirname.includes('dist')) {
            const projectRoot = path.resolve(__dirname, '../../../../');
            testBookingPath = path.join(projectRoot, 'test-fixtures', 'test-booking.html');
        }
        else {
            testBookingPath = path.join(__dirname, '../../../test-fixtures/test-booking.html');
        }
        const normalizedPath = path.resolve(testBookingPath);
        if (!fs.existsSync(normalizedPath)) {
            const fallbackPath = path.join(process.cwd(), 'test-fixtures', 'test-booking.html');
            if (fs.existsSync(fallbackPath)) {
                return `file://${path.resolve(fallbackPath)}`;
            }
            throw new Error(`Test booking file not found at ${normalizedPath}`);
        }
        return `file://${normalizedPath}`;
    });
}
//# sourceMappingURL=agent-handlers.js.map