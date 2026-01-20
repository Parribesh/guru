"use strict";
// Miscellaneous IPC Handlers (QA, Logging, Window, DevTools)
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
exports.setupMiscHandlers = setupMiscHandlers;
const electron_1 = require("electron");
const types_1 = require("../../../shared/types");
const event_logger_1 = require("../../logging/event-logger");
const socket_logger_1 = require("../../logging/socket-logger");
const service_1 = require("../../agent/qa/service");
const embedding_service_1 = require("../../agent/rag/embedding-service");
const WebSocketManager_1 = require("../../websocket/WebSocketManager");
function setupMiscHandlers(mainWindow) {
    // QA request handler
    electron_1.ipcMain.handle(types_1.IPCChannels.qa.ask, async (event, request) => {
        console.log(`QA request for tab ${request.tabId}: ${request.question}`);
        return await (0, service_1.answerQuestion)(request);
    });
    // Logging handlers
    electron_1.ipcMain.handle(types_1.IPCChannels.log.getEvents, () => {
        return event_logger_1.eventLogger.getEvents();
    });
    electron_1.ipcMain.handle(types_1.IPCChannels.log.clear, () => {
        event_logger_1.eventLogger.clear();
        return { success: true };
    });
    // Window management
    electron_1.ipcMain.handle(types_1.IPCChannels.window.minimize, async () => {
        mainWindow.minimize();
    });
    electron_1.ipcMain.handle(types_1.IPCChannels.window.maximize, async () => {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        }
        else {
            mainWindow.maximize();
        }
    });
    electron_1.ipcMain.handle(types_1.IPCChannels.window.close, async () => {
        mainWindow.close();
    });
    // Dev tools
    electron_1.ipcMain.handle(types_1.IPCChannels.devTools.open, async (event, tabId) => {
        if (tabId) {
            // TODO: Implement per-tab dev tools
            console.log(`Opening dev tools for tab: ${tabId}`);
        }
        else {
            mainWindow.webContents.openDevTools();
        }
    });
    // Embedding service status (for debugging)
    electron_1.ipcMain.handle('embedding-service:status', async () => {
        try {
            const service = (0, embedding_service_1.getEmbeddingService)();
            const isAvailable = await service.healthCheck();
            const socketConnected = service.socket && service.socket.readyState === 1;
            // Get pending task details
            const pendingTaskDetails = [];
            if (service.pendingTasks) {
                const now = Date.now();
                service.pendingTasks.forEach((task, taskId) => {
                    const waitTime = now - task.waitStartTime;
                    pendingTaskDetails.push({
                        taskId,
                        chunkId: task.chunkId,
                        batchId: task.batchId,
                        waitTime,
                    });
                });
            }
            return {
                success: true,
                data: {
                    available: isAvailable,
                    baseUrl: service.baseUrl || 'http://localhost:8000',
                    pendingTasks: service.pendingTasks ? service.pendingTasks.size : 0,
                    pendingTaskDetails,
                    socketConnected: socketConnected,
                },
            };
        }
        catch (error) {
            console.error('[IPC] Embedding service status error:', error);
            return {
                success: false,
                error: error.message,
            };
        }
    });
    // Task monitoring data
    electron_1.ipcMain.handle('embedding:tasks-monitor', async () => {
        try {
            const service = (0, embedding_service_1.getEmbeddingService)();
            // Get pending tasks with wait times
            const pendingTasks = [];
            if (service.pendingTasks) {
                const now = Date.now();
                service.pendingTasks.forEach((task, taskId) => {
                    const metric = service.taskMetrics.get(taskId);
                    pendingTasks.push({
                        taskId,
                        chunkId: task.chunkId,
                        batchId: task.batchId,
                        submittedAt: task.startTime,
                        waitStartTime: task.waitStartTime,
                        waitDuration: now - task.waitStartTime,
                        status: 'pending',
                    });
                });
            }
            // Get completed/failed tasks from metrics
            const completedTasks = [];
            if (service.taskMetrics) {
                service.taskMetrics.forEach((metric) => {
                    if (metric.status !== 'pending' && metric.completedAt !== undefined && metric.waitDuration !== undefined) {
                        completedTasks.push({
                            taskId: metric.taskId,
                            chunkId: metric.chunkId,
                            batchId: metric.batchId,
                            submittedAt: metric.submittedAt,
                            waitStartTime: metric.waitStartTime,
                            completedAt: metric.completedAt,
                            waitDuration: metric.waitDuration,
                            status: metric.status,
                            error: metric.error,
                        });
                    }
                });
            }
            // Sort by completion time (most recent first)
            completedTasks.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
            const tasksByBatch = new Map();
            [...pendingTasks.map(t => ({ ...t, completedAt: undefined })), ...completedTasks].forEach(task => {
                const batchId = task.batchId || 'unknown';
                if (!tasksByBatch.has(batchId)) {
                    tasksByBatch.set(batchId, []);
                }
                tasksByBatch.get(batchId).push(task);
            });
            // Calculate batch statistics
            const batchStats = Array.from(tasksByBatch.entries()).map(([batchId, tasks]) => {
                const completed = tasks.filter(t => t.status === 'completed');
                const failed = tasks.filter(t => t.status === 'failed' || t.status === 'timeout');
                const pending = tasks.filter(t => t.status === 'pending');
                const avgWaitTime = completed.length > 0
                    ? completed.reduce((sum, t) => sum + t.waitDuration, 0) / completed.length
                    : 0;
                const maxWaitTime = completed.length > 0
                    ? Math.max(...completed.map(t => t.waitDuration))
                    : 0;
                const minWaitTime = completed.length > 0
                    ? Math.min(...completed.map(t => t.waitDuration))
                    : 0;
                return {
                    batchId,
                    totalTasks: tasks.length,
                    completed: completed.length,
                    failed: failed.length,
                    pending: pending.length,
                    avgWaitTime,
                    maxWaitTime,
                    minWaitTime,
                    successRate: tasks.length > 0 ? (completed.length / tasks.length) * 100 : 0,
                };
            });
            return {
                success: true,
                data: {
                    pendingTasks,
                    completedTasks: completedTasks.slice(0, 1000), // Limit to last 1000 completed tasks
                    batchStats,
                    totalPending: pendingTasks.length,
                    totalCompleted: completedTasks.length,
                },
            };
        }
        catch (error) {
            console.error('[IPC] Task monitor error:', error);
            return {
                success: false,
                error: error.message,
            };
        }
    });
    // Set up embedding service event forwarding
    const service = (0, embedding_service_1.getEmbeddingService)();
    console.log('[IPC] Setting up embedding service event forwarding to renderer');
    // Helper function to send events via WebSocket manager (which handles queueing)
    const sendEventToRenderer = (eventData) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            try {
                mainWindow.webContents.send('embedding-service:event', eventData);
            }
            catch (error) {
                socket_logger_1.socketLogger.error('EVENT_FORWARD', 'Error sending event to renderer', {
                    error: error.message,
                    type: eventData.type
                });
            }
        }
        else {
            // Queue event if mainWindow not available (WebSocket manager will handle this)
            socket_logger_1.socketLogger.debug('EVENT_QUEUE', 'Main window not available, event may be queued', { type: eventData.type });
        }
    };
    // Forward all embedding service events to renderer
    service.on('task_complete', (taskId, data) => {
        const eventData = {
            type: 'task_complete',
            taskId,
            chunkId: data?.chunkId,
            batchId: data?.batchId,
            timestamp: Date.now(),
        };
        console.log('[IPC] Forwarding task_complete event:', eventData);
        sendEventToRenderer(eventData);
    });
    service.on('task_error', (taskId, error, chunkId, batchId) => {
        sendEventToRenderer({
            type: 'task_error',
            taskId,
            chunkId,
            batchId,
            error: error.message,
            timestamp: Date.now(),
        });
    });
    service.on('task_progress', (taskId, progress, chunkId, batchId) => {
        sendEventToRenderer({
            type: 'task_progress',
            taskId,
            chunkId,
            batchId,
            progress,
            timestamp: Date.now(),
        });
    });
    service.on('connected', () => {
        sendEventToRenderer({
            type: 'connected',
            timestamp: Date.now(),
        });
    });
    service.on('disconnected', () => {
        sendEventToRenderer({
            type: 'disconnected',
            timestamp: Date.now(),
        });
    });
    service.on('error', (error) => {
        sendEventToRenderer({
            type: 'error',
            error: error.message,
            timestamp: Date.now(),
        });
    });
    service.on('task_submitted', (taskId, chunkId, batchId) => {
        sendEventToRenderer({
            type: 'task_submitted',
            taskId,
            chunkId,
            batchId,
            timestamp: Date.now(),
        });
    });
    service.on('job_complete', (jobId, stats) => {
        sendEventToRenderer({
            type: 'job_complete',
            jobId,
            stats,
            timestamp: Date.now(),
        });
    });
    // Forward WebSocket messages that contain job_id
    service.on('websocket_message', (data) => {
        const eventData = {
            type: 'websocket_message',
            jobId: data.jobId,
            originalMessage: data.originalMessage,
            timestamp: Date.now(),
        };
        console.log('[IPC] Forwarding websocket_message event:', eventData);
        sendEventToRenderer(eventData);
    });
    // Forward job_status_update events from WebSocket
    service.on('job_status_update', (jobId, jobStatus) => {
        const eventData = {
            type: 'job_status_update',
            jobId,
            jobStatus,
            timestamp: Date.now(),
        };
        console.log('[IPC] Forwarding job_status_update event for job:', jobId);
        sendEventToRenderer(eventData);
    });
    // Initialize WebSocket manager with mainWindow
    WebSocketManager_1.webSocketManager.setMainWindow(mainWindow);
    // Also update WebSocketManager's mainWindow when it changes (in case of window recreation)
    const updateWebSocketManagerWindow = () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            WebSocketManager_1.webSocketManager.setMainWindow(mainWindow);
        }
    };
    // Listen to WebSocket messages and forward job_status_update events to embedding service
    WebSocketManager_1.webSocketManager.on('message', (eventData) => {
        // Extract job_id from WebSocket message and forward to embedding service
        const jobId = eventData.payload?.job_id || eventData.payload?.jobId || eventData.payload?.status?.job_id;
        if (jobId && eventData.type === 'job_status_update') {
            socket_logger_1.socketLogger.debug('JOB_STATUS_FORWARD', 'Forwarding job_status_update to embedding service', { jobId });
            // Forward the entire status object, not just the payload
            const jobStatus = eventData.payload.status || eventData.payload;
            service.emit('job_status_update', jobId, jobStatus);
        }
    });
    // Listen for job_started events to forward to renderer (and ensure WebSocket is connected)
    service.on('job_started', (jobId) => {
        socket_logger_1.socketLogger.info('JOB_STARTED', `Job started event received`, { jobId });
        // Forward to renderer
        sendEventToRenderer({
            type: 'job_started',
            jobId,
            timestamp: Date.now(),
        });
        // Ensure WebSocket is connected (if not already)
        if (!WebSocketManager_1.webSocketManager.isConnected()) {
            socket_logger_1.socketLogger.info('CONNECTION_TRIGGER', 'Triggering WebSocket connection from job_started event', { jobId });
            WebSocketManager_1.webSocketManager.connect().catch((error) => {
                socket_logger_1.socketLogger.error('CONNECTION_TRIGGER', 'Failed to connect WebSocket', { error: error.message });
            });
        }
    });
    // Also listen for websocket_message events that contain jobId (backup detection)
    service.on('websocket_message', (data) => {
        // Forward to renderer if needed
        if (data.jobId) {
            sendEventToRenderer({
                type: 'websocket_message',
                jobId: data.jobId,
                originalMessage: data.originalMessage,
                timestamp: Date.now(),
            });
        }
        // Ensure WebSocket is connected
        if (!WebSocketManager_1.webSocketManager.isConnected()) {
            WebSocketManager_1.webSocketManager.connect().catch((error) => {
                socket_logger_1.socketLogger.error('CONNECTION_TRIGGER', 'Failed to connect WebSocket', { error: error.message });
            });
        }
    });
    // IPC handler to manually connect/disconnect WebSocket (for renderer components)
    electron_1.ipcMain.handle('embedding:connect-websocket', async () => {
        socket_logger_1.socketLogger.info('IPC_HANDLER', 'Manual WebSocket connection requested from renderer');
        await WebSocketManager_1.webSocketManager.connect();
        return { success: true };
    });
    electron_1.ipcMain.handle('embedding:disconnect-websocket', async () => {
        socket_logger_1.socketLogger.info('IPC_HANDLER', 'Manual WebSocket disconnection requested from renderer');
        WebSocketManager_1.webSocketManager.disconnect();
        return { success: true };
    });
    // Auto-connect WebSocket when handler is registered (only if mainWindow is available)
    socket_logger_1.socketLogger.info('INIT', 'Setting up WebSocket connection handler');
    // Always try to connect - WebSocketManager will handle mainWindow availability
    socket_logger_1.socketLogger.info('AUTO_CONNECT', 'Auto-connecting to global WebSocket');
    WebSocketManager_1.webSocketManager.connect().catch((error) => {
        socket_logger_1.socketLogger.error('AUTO_CONNECT', 'Failed to auto-connect WebSocket', { error: error.message });
    });
    socket_logger_1.socketLogger.success('INIT', 'Embedding service event forwarding set up successfully');
    // Embedding stats handler
    electron_1.ipcMain.handle('embedding:stats', async () => {
        try {
            const { getEmbeddingBatchSize, getConfig } = require('../../config');
            const service = (0, embedding_service_1.getEmbeddingService)();
            const config = getConfig();
            return {
                success: true,
                data: {
                    config: {
                        batchSize: getEmbeddingBatchSize(),
                        timeout: config.embedding.timeout,
                        baseUrl: service.baseUrl || 'http://127.0.0.1:8000',
                        socketUrl: service.socketUrl,
                    },
                    recentExecutions: [], // Will be populated from event log
                },
            };
        }
        catch (error) {
            console.error('[IPC] Embedding stats error:', error);
            return {
                success: false,
                error: error.message,
            };
        }
    });
    // Job stats handler
    electron_1.ipcMain.handle('embedding:job-stats', async (event, jobId) => {
        try {
            const service = (0, embedding_service_1.getEmbeddingService)();
            const jobStats = await service.getJobStats(jobId);
            return {
                success: true,
                data: jobStats,
            };
        }
        catch (error) {
            console.error('[IPC] Job stats error:', error);
            return {
                success: false,
                error: error.message,
            };
        }
    });
    // WebSocket status handler
    electron_1.ipcMain.handle('websocket:status', async () => {
        try {
            const service = (0, embedding_service_1.getEmbeddingService)();
            const baseUrl = service.baseUrl || 'http://127.0.0.1:8000';
            const fullUrl = `${baseUrl}/api/websockets/status`;
            return new Promise((resolve) => {
                const urlObj = new URL(fullUrl);
                const http = require('http');
                const https = require('https');
                const client = urlObj.protocol === 'https:' ? https : http;
                const options = {
                    hostname: urlObj.hostname,
                    port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
                    path: urlObj.pathname + (urlObj.search || ''),
                    method: 'GET',
                    headers: {},
                    timeout: 5000,
                };
                const req = client.request(options, (res) => {
                    let data = '';
                    res.on('data', (chunk) => {
                        data += chunk;
                    });
                    res.on('end', () => {
                        if (res.statusCode === 200) {
                            try {
                                const wsStatus = JSON.parse(data);
                                resolve({
                                    success: true,
                                    data: wsStatus,
                                });
                            }
                            catch (error) {
                                console.error('[IPC] Failed to parse WebSocket status response:', error);
                                resolve({
                                    success: false,
                                    error: `Failed to parse response: ${error.message}`,
                                });
                            }
                        }
                        else {
                            resolve({
                                success: false,
                                error: `HTTP ${res.statusCode}: ${data}`,
                            });
                        }
                    });
                });
                req.on('error', (error) => {
                    console.error('[IPC] WebSocket status request error:', error);
                    resolve({
                        success: false,
                        error: error.message,
                    });
                });
                req.on('timeout', () => {
                    req.destroy();
                    resolve({
                        success: false,
                        error: 'Request timeout',
                    });
                });
                req.end();
            });
        }
        catch (error) {
            console.error('[IPC] WebSocket status error:', error);
            return {
                success: false,
                error: error.message,
            };
        }
    });
    // Jobs API handlers
    electron_1.ipcMain.handle('jobs:list', async (event, limit, status) => {
        try {
            const { getJobsAPI } = await Promise.resolve().then(() => __importStar(require('../../agent/rag/jobs-api')));
            const jobsAPI = getJobsAPI();
            const jobs = await jobsAPI.listJobs(limit, status);
            return { success: true, data: jobs };
        }
        catch (error) {
            console.error('[IPC] Jobs list error:', error);
            return { success: false, error: error.message };
        }
    });
    electron_1.ipcMain.handle('jobs:get', async (event, jobId) => {
        try {
            const { getJobsAPI } = await Promise.resolve().then(() => __importStar(require('../../agent/rag/jobs-api')));
            const jobsAPI = getJobsAPI();
            const job = await jobsAPI.getJob(jobId);
            return { success: true, data: job };
        }
        catch (error) {
            console.error('[IPC] Job get error:', error);
            return { success: false, error: error.message };
        }
    });
    electron_1.ipcMain.handle('jobs:count', async (event, status) => {
        try {
            const { getJobsAPI } = await Promise.resolve().then(() => __importStar(require('../../agent/rag/jobs-api')));
            const jobsAPI = getJobsAPI();
            const count = await jobsAPI.getJobCount(status);
            return { success: true, data: count };
        }
        catch (error) {
            console.error('[IPC] Jobs count error:', error);
            return { success: false, error: error.message };
        }
    });
    electron_1.ipcMain.handle('jobs:delete', async (event, jobId) => {
        try {
            const { getJobsAPI } = await Promise.resolve().then(() => __importStar(require('../../agent/rag/jobs-api')));
            const jobsAPI = getJobsAPI();
            await jobsAPI.deleteJob(jobId);
            return { success: true };
        }
        catch (error) {
            console.error('[IPC] Job delete error:', error);
            return { success: false, error: error.message };
        }
    });
    // Queue status handler (uses new /api/queue/status endpoint)
    electron_1.ipcMain.handle('queue:status', async () => {
        try {
            console.log('[IPC] queue:status handler called');
            const { getQueueAPI } = await Promise.resolve().then(() => __importStar(require('../../agent/rag/queue-api')));
            const queueAPI = getQueueAPI();
            const status = await queueAPI.getStatus();
            console.log('[IPC] queue:status success, returning data');
            return { success: true, data: status };
        }
        catch (error) {
            console.error('[IPC] Queue status error:', error.message || error);
            console.error('[IPC] Queue status error stack:', error.stack);
            return { success: false, error: error.message || String(error) };
        }
    });
    // Queue metrics handler (uses new /api/queue/metrics endpoint)
    electron_1.ipcMain.handle('queue:metrics', async () => {
        try {
            console.log('[IPC] queue:metrics handler called');
            const { getQueueAPI } = await Promise.resolve().then(() => __importStar(require('../../agent/rag/queue-api')));
            const queueAPI = getQueueAPI();
            const metrics = await queueAPI.getMetrics();
            console.log('[IPC] queue:metrics success, returning data');
            return { success: true, data: metrics };
        }
        catch (error) {
            console.error('[IPC] Queue metrics error:', error.message || error);
            console.error('[IPC] Queue metrics error stack:', error.stack);
            return { success: false, error: error.message || String(error) };
        }
    });
}
//# sourceMappingURL=misc-handlers.js.map