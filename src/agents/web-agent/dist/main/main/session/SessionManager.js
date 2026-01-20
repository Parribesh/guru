"use strict";
// Session Manager - Manages all agent sessions and their associated tabs
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionManager = void 0;
const events_1 = require("events");
const uuid_1 = require("uuid");
const AgentSessionState_1 = require("../agent/AgentSessionState");
const AgentManager_1 = require("../agent/AgentManager");
const types_1 = require("../../shared/types");
class SessionManager extends events_1.EventEmitter {
    constructor(mainWindow, tabManager) {
        super();
        this.sessions = new Map();
        this.mainWindow = mainWindow;
        this.tabManager = tabManager;
    }
    async createSession(request = {}) {
        const sessionId = (0, uuid_1.v4)();
        const sessionState = new AgentSessionState_1.AgentSessionState(sessionId, request.url);
        // Create a BrowserView/tab for this session
        const tabId = await this.tabManager.createTab(request.url);
        // Create session-specific AgentManager
        const agentManager = new AgentManager_1.AgentManager(sessionId, tabId, this.tabManager, sessionState);
        agentManager.setBroadcastCallback((session) => this.broadcastSessionUpdate(session));
        // Store session data
        this.sessions.set(sessionId, {
            sessionState,
            agentManager,
            tabId,
        });
        const session = sessionState.getSession();
        // Emit session created event
        const serialized = this.serializeSession(session);
        this.emit('session:created', serialized);
        this.mainWindow.webContents.send(types_1.IPCChannels.events.sessionCreated, serialized);
        // If initial message provided, process it
        if (request.initialMessage) {
            await agentManager.askQuestion(request.initialMessage);
        }
        return session;
    }
    getSession(sessionId) {
        const sessionData = this.sessions.get(sessionId);
        return sessionData?.sessionState.getSession() || null;
    }
    getAgentManager(sessionId) {
        return this.sessions.get(sessionId)?.agentManager || null;
    }
    getTabId(sessionId) {
        return this.sessions.get(sessionId)?.tabId || null;
    }
    getSessionIdByTabId(tabId) {
        for (const [sessionId, sessionData] of this.sessions.entries()) {
            if (sessionData.tabId === tabId) {
                return sessionId;
            }
        }
        return null;
    }
    getAllSessions() {
        return Array.from(this.sessions.values())
            .map(data => data.sessionState.getSession())
            .filter(session => session !== null);
    }
    async deleteSession(sessionId) {
        const sessionData = this.sessions.get(sessionId);
        if (!sessionData) {
            return false;
        }
        // Close the associated tab
        await this.tabManager.closeTab(sessionData.tabId);
        // Destroy session
        sessionData.sessionState._destroy();
        // Remove from map
        this.sessions.delete(sessionId);
        // Emit session deleted event
        this.emit('session:deleted', sessionId);
        this.mainWindow.webContents.send(types_1.IPCChannels.events.sessionDeleted, sessionId);
        return true;
    }
    serializeSession(session) {
        // Remove any non-serializable data
        const serialized = JSON.parse(JSON.stringify(session));
        return serialized;
    }
    broadcastSessionUpdate(session) {
        // Emit to main process listeners
        this.emit('session:updated', session);
        // Send to renderer via IPC
        const serialized = this.serializeSession(session);
        this.mainWindow.webContents.send(types_1.IPCChannels.events.sessionUpdated, serialized);
    }
}
exports.SessionManager = SessionManager;
//# sourceMappingURL=SessionManager.js.map