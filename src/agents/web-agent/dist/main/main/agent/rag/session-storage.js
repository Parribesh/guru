"use strict";
// Session Data Storage - Persists chunks and embeddings to disk
// Allows caching and reuse of chunks for the same URLs
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
exports.saveSessionData = saveSessionData;
exports.loadSessionData = loadSessionData;
exports.findSessionByUrl = findSessionByUrl;
exports.getAllSessionIds = getAllSessionIds;
exports.deleteSessionData = deleteSessionData;
exports.initializeUrlMapping = initializeUrlMapping;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const event_logger_1 = require("../../logging/event-logger");
const DATA_DIR = path.join(process.cwd(), 'data', 'sessions');
// URL to sessionId mapping for quick lookup
const urlToSessionMap = new Map();
// Ensure data directory exists
function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        event_logger_1.eventLogger.info('Session Storage', `Created data directory: ${DATA_DIR}`);
    }
}
// Get session directory path
function getSessionDir(sessionId) {
    return path.join(DATA_DIR, sessionId);
}
// Convert Map to plain object for JSON serialization
function mapToObject(map) {
    const obj = {};
    for (const [key, value] of map.entries()) {
        obj[key] = value;
    }
    return obj;
}
// Convert plain object back to Map
function objectToMap(obj) {
    const map = new Map();
    for (const [key, value] of Object.entries(obj)) {
        map.set(key, value);
    }
    return map;
}
// Save session data to disk
function saveSessionData(sessionId, url, title, pageContent, chunks, components, chunkEmbeddings) {
    try {
        ensureDataDir();
        const sessionDir = getSessionDir(sessionId);
        // Create session directory
        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }
        // Prepare data for serialization
        const sessionData = {
            sessionId,
            url,
            title,
            pageContent,
            chunks,
            components,
            chunkEmbeddings: mapToObject(chunkEmbeddings),
            cachedAt: Date.now(),
        };
        // Save to JSON file
        const dataFile = path.join(sessionDir, 'data.json');
        fs.writeFileSync(dataFile, JSON.stringify(sessionData, null, 2), 'utf8');
        // Update URL mapping
        urlToSessionMap.set(url, sessionId);
        event_logger_1.eventLogger.success('Session Storage', `Saved session data to: ${dataFile}`);
        event_logger_1.eventLogger.info('Session Storage', `Saved ${chunks.length} chunks and ${components.length} components`);
    }
    catch (error) {
        event_logger_1.eventLogger.error('Session Storage', `Failed to save session data: ${error.message}`);
        throw error;
    }
}
// Load session data from disk
function loadSessionData(sessionId) {
    try {
        const sessionDir = getSessionDir(sessionId);
        const dataFile = path.join(sessionDir, 'data.json');
        if (!fs.existsSync(dataFile)) {
            return null;
        }
        const fileContent = fs.readFileSync(dataFile, 'utf8');
        const rawData = JSON.parse(fileContent);
        // Convert embeddings object back to Map
        const chunkEmbeddings = objectToMap(rawData.chunkEmbeddings);
        // Create properly typed SessionData
        const sessionData = {
            ...rawData,
            chunkEmbeddings,
        };
        // Update URL mapping
        urlToSessionMap.set(sessionData.url, sessionId);
        event_logger_1.eventLogger.success('Session Storage', `Loaded session data from: ${dataFile}`);
        return sessionData;
    }
    catch (error) {
        event_logger_1.eventLogger.error('Session Storage', `Failed to load session data: ${error.message}`);
        return null;
    }
}
// Find session by URL (check all existing sessions)
function findSessionByUrl(url) {
    // First check the in-memory map
    const cachedSessionId = urlToSessionMap.get(url);
    if (cachedSessionId) {
        const loaded = loadSessionData(cachedSessionId);
        if (loaded && loaded.url === url) {
            return loaded;
        }
    }
    // Scan all session directories
    try {
        ensureDataDir();
        if (!fs.existsSync(DATA_DIR)) {
            return null;
        }
        const sessionDirs = fs.readdirSync(DATA_DIR, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
        for (const sessionId of sessionDirs) {
            const sessionData = loadSessionData(sessionId);
            if (sessionData && sessionData.url === url) {
                // Update mapping for faster future lookups
                urlToSessionMap.set(url, sessionId);
                event_logger_1.eventLogger.info('Session Storage', `Found existing session for URL: ${url} (session: ${sessionId})`);
                return sessionData;
            }
        }
        return null;
    }
    catch (error) {
        event_logger_1.eventLogger.error('Session Storage', `Failed to find session by URL: ${error.message}`);
        return null;
    }
}
// Get all session IDs
function getAllSessionIds() {
    try {
        ensureDataDir();
        if (!fs.existsSync(DATA_DIR)) {
            return [];
        }
        return fs.readdirSync(DATA_DIR, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
    }
    catch (error) {
        event_logger_1.eventLogger.error('Session Storage', `Failed to get session IDs: ${error.message}`);
        return [];
    }
}
// Delete session data
function deleteSessionData(sessionId) {
    try {
        const sessionDir = getSessionDir(sessionId);
        if (fs.existsSync(sessionDir)) {
            fs.rmSync(sessionDir, { recursive: true, force: true });
            // Remove from URL mapping
            for (const [url, sid] of urlToSessionMap.entries()) {
                if (sid === sessionId) {
                    urlToSessionMap.delete(url);
                    break;
                }
            }
            event_logger_1.eventLogger.success('Session Storage', `Deleted session data: ${sessionId}`);
        }
    }
    catch (error) {
        event_logger_1.eventLogger.error('Session Storage', `Failed to delete session data: ${error.message}`);
    }
}
// Initialize URL mapping on startup
function initializeUrlMapping() {
    try {
        const sessionIds = getAllSessionIds();
        let loadedCount = 0;
        for (const sessionId of sessionIds) {
            const sessionData = loadSessionData(sessionId);
            if (sessionData) {
                urlToSessionMap.set(sessionData.url, sessionId);
                loadedCount++;
            }
        }
        event_logger_1.eventLogger.info('Session Storage', `Initialized URL mapping: ${loadedCount} sessions loaded`);
    }
    catch (error) {
        event_logger_1.eventLogger.error('Session Storage', `Failed to initialize URL mapping: ${error.message}`);
    }
}
//# sourceMappingURL=session-storage.js.map