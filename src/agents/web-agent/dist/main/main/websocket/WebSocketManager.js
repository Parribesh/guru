"use strict";
// Centralized WebSocket Manager
// Ensures only one WebSocket connection exists and handles all communication
Object.defineProperty(exports, "__esModule", { value: true });
exports.webSocketManager = void 0;
const events_1 = require("events");
const socket_logger_1 = require("../logging/socket-logger");
const embedding_service_1 = require("../agent/rag/embedding-service");
class WebSocketManager extends events_1.EventEmitter {
    constructor() {
        super();
        this.socket = null;
        this.WebSocketClass = null;
        this.isConnecting = false;
        this.connectionLock = null;
        this.mainWindow = null;
        this.eventQueue = [];
        this.reconnectTimeout = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 5000;
        this.baseUrl = 'http://127.0.0.1:8000';
        this.wsUrl = '';
        this.initializeWebSocketLibrary();
        this.updateBaseUrl();
    }
    /**
     * Initialize WebSocket library
     */
    initializeWebSocketLibrary() {
        try {
            this.WebSocketClass = require('ws');
            socket_logger_1.socketLogger.info('INIT', 'WebSocket library loaded successfully');
        }
        catch (err) {
            socket_logger_1.socketLogger.warning('INIT', 'WebSocket library not available', { error: err.message });
            this.WebSocketClass = null;
        }
    }
    /**
     * Update base URL from embedding service
     */
    updateBaseUrl() {
        try {
            const service = (0, embedding_service_1.getEmbeddingService)();
            this.baseUrl = service.baseUrl || 'http://127.0.0.1:8000';
            this.wsUrl = this.baseUrl.replace(/^http/, 'ws') + '/ws';
            socket_logger_1.socketLogger.debug('CONFIG', 'Updated WebSocket URL', { baseUrl: this.baseUrl, wsUrl: this.wsUrl });
        }
        catch (error) {
            socket_logger_1.socketLogger.warning('CONFIG', 'Failed to get base URL from embedding service, using default', { error: error.message });
        }
    }
    /**
     * Set the main window for event forwarding
     */
    setMainWindow(window) {
        const wasNull = this.mainWindow === null;
        const oldWindowId = this.mainWindow?.webContents?.id;
        this.mainWindow = window;
        const newWindowId = window?.webContents?.id;
        if (wasNull && window && !window.isDestroyed()) {
            socket_logger_1.socketLogger.info('MAIN_WINDOW', 'Main window set, flushing event queue and connecting WebSocket', {
                webContentsId: newWindowId,
                isDestroyed: window.isDestroyed()
            });
            this.flushEventQueue();
            // Auto-connect if not already connected
            if (!this.isConnected()) {
                this.connect().catch((error) => {
                    socket_logger_1.socketLogger.error('MAIN_WINDOW', 'Failed to connect WebSocket after setting mainWindow', { error: error.message });
                });
            }
        }
        else if (window) {
            socket_logger_1.socketLogger.info('MAIN_WINDOW', 'Main window updated, flushing event queue', {
                oldWebContentsId: oldWindowId,
                newWebContentsId: newWindowId,
                isDestroyed: window.isDestroyed()
            });
            // Flush any queued events when window is updated
            this.flushEventQueue();
        }
        else {
            socket_logger_1.socketLogger.warning('MAIN_WINDOW', 'Main window set to null');
        }
    }
    /**
     * Check if WebSocket is connected
     */
    isConnected() {
        return this.socket !== null && this.socket.readyState === 1; // WebSocket.OPEN = 1
    }
    /**
     * Get connection state
     */
    getConnectionState() {
        return {
            connected: this.isConnected(),
            connecting: this.isConnecting,
            readyState: this.socket?.readyState ?? null,
            url: this.wsUrl,
        };
    }
    /**
     * Connect to WebSocket with proper locking to prevent duplicates
     */
    async connect() {
        if (!this.WebSocketClass) {
            socket_logger_1.socketLogger.warning('CONNECTION', 'Cannot connect: WebSocket library not available');
            return;
        }
        // If already connected, return immediately
        if (this.isConnected()) {
            socket_logger_1.socketLogger.debug('CONNECTION', 'Already connected, skipping');
            return;
        }
        // If connection is in progress, wait for it
        if (this.connectionLock) {
            socket_logger_1.socketLogger.debug('CONNECTION', 'Connection already in progress, waiting...');
            await this.connectionLock;
            return;
        }
        // Create connection lock
        this.connectionLock = this.performConnection();
        try {
            await this.connectionLock;
        }
        finally {
            this.connectionLock = null;
        }
    }
    /**
     * Perform the actual WebSocket connection
     */
    async performConnection() {
        // Double-check after acquiring lock
        if (this.isConnected()) {
            socket_logger_1.socketLogger.debug('CONNECTION', 'Already connected after lock acquisition');
            return;
        }
        if (this.isConnecting) {
            socket_logger_1.socketLogger.debug('CONNECTION', 'Connection already in progress');
            return;
        }
        // Clean up stale connection
        if (this.socket && this.socket.readyState !== 1) {
            socket_logger_1.socketLogger.debug('CONNECTION', 'Cleaning up stale connection', { readyState: this.socket.readyState });
            try {
                this.socket.removeAllListeners();
                this.socket.close();
            }
            catch (e) {
                // Ignore cleanup errors
            }
            this.socket = null;
        }
        // Update base URL before connecting
        this.updateBaseUrl();
        this.isConnecting = true;
        this.reconnectAttempts = 0;
        socket_logger_1.socketLogger.info('CONNECTION', 'Attempting to connect to WebSocket', { url: this.wsUrl });
        return new Promise((resolve, reject) => {
            try {
                this.socket = new this.WebSocketClass(this.wsUrl);
                this.socket.on('open', () => {
                    socket_logger_1.socketLogger.success('CONNECTION', 'Connected to WebSocket', { url: this.wsUrl, readyState: this.socket.readyState });
                    this.isConnecting = false;
                    this.reconnectAttempts = 0;
                    // Emit connection event
                    this.emit('connected');
                    // Forward to renderer
                    this.sendToRenderer({
                        type: 'websocket_connected',
                        timestamp: Date.now(),
                    });
                    resolve();
                });
                this.socket.on('message', (data) => {
                    this.handleMessage(data);
                });
                this.socket.on('error', (error) => {
                    socket_logger_1.socketLogger.error('CONNECTION_ERROR', 'WebSocket error', {
                        error: error.message,
                        stack: error.stack,
                        name: error.name
                    });
                    this.isConnecting = false;
                    // Emit error event
                    this.emit('error', error);
                    // Forward to renderer
                    this.sendToRenderer({
                        type: 'websocket_error',
                        error: error.message,
                        timestamp: Date.now(),
                    });
                    reject(error);
                });
                this.socket.on('close', (code, reason) => {
                    socket_logger_1.socketLogger.warning('CONNECTION_CLOSE', 'WebSocket closed', {
                        code,
                        reason: reason.toString(),
                        readyState: this.socket?.readyState
                    });
                    this.isConnecting = false;
                    this.socket = null;
                    // Emit close event
                    this.emit('close', code, reason);
                    // Forward to renderer
                    this.sendToRenderer({
                        type: 'websocket_closed',
                        code,
                        reason: reason.toString(),
                        timestamp: Date.now(),
                    });
                    // Attempt to reconnect if not manually closed
                    if (code !== 1000) { // 1000 = normal closure
                        this.scheduleReconnect();
                    }
                });
            }
            catch (error) {
                socket_logger_1.socketLogger.error('CONNECTION_CREATE', 'Error creating WebSocket connection', {
                    error: error.message,
                    stack: error.stack,
                    url: this.wsUrl
                });
                this.isConnecting = false;
                this.socket = null;
                reject(error);
            }
        });
    }
    /**
     * Handle incoming WebSocket messages
     */
    handleMessage(data) {
        try {
            const message = typeof data === 'string' ? data : data.toString();
            const parsed = JSON.parse(message);
            socket_logger_1.socketLogger.info('MESSAGE_RECEIVED', 'Received WebSocket message', {
                type: parsed.type,
                hasPayload: !!parsed.payload,
                payloadJobId: parsed.payload?.job_id,
                messageSize: message.length,
                messagePreview: message.substring(0, 200)
            });
            // Create event data
            const eventData = {
                type: parsed.type || 'websocket_message',
                payload: parsed.payload || parsed,
                timestamp: Date.now(),
            };
            // Emit to internal listeners (for embedding-service)
            this.emit('message', eventData);
            // Forward to renderer
            this.sendToRenderer(eventData);
        }
        catch (error) {
            socket_logger_1.socketLogger.error('MESSAGE_PARSE', 'Error parsing WebSocket message', {
                error: error.message,
                stack: error.stack,
                dataType: typeof data,
                dataLength: typeof data === 'string' ? data.length : data.length
            });
        }
    }
    /**
     * Send event to renderer (with queueing if mainWindow unavailable)
     */
    sendToRenderer(event) {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            try {
                // Check if webContents is available and ready
                if (!this.mainWindow.webContents || this.mainWindow.webContents.isDestroyed()) {
                    socket_logger_1.socketLogger.warning('EVENT_FORWARD', 'WebContents not available or destroyed', {
                        type: event.type,
                        hasWebContents: !!this.mainWindow.webContents,
                        isDestroyed: this.mainWindow.webContents?.isDestroyed()
                    });
                    this.queueEvent(event);
                    return;
                }
                // Check if webContents is ready to receive messages
                // Note: webContents.send() can be called even if the page hasn't loaded yet,
                // but we should still try to send. If it fails, it will be caught and queued.
                this.mainWindow.webContents.send('embedding-service:event', event);
                socket_logger_1.socketLogger.info('EVENT_FORWARD', 'Event sent to renderer via webContents.send', {
                    type: event.type,
                    hasPayload: !!event.payload,
                    payloadJobId: event.payload?.job_id || event.payload?.status?.job_id,
                    webContentsId: this.mainWindow.webContents.id,
                    url: this.mainWindow.webContents.getURL()
                });
            }
            catch (error) {
                socket_logger_1.socketLogger.error('EVENT_FORWARD', 'Error sending event to renderer', {
                    error: error.message,
                    stack: error.stack,
                    type: event.type,
                    webContentsId: this.mainWindow.webContents?.id
                });
                // Queue event if send failed
                this.queueEvent(event);
            }
        }
        else {
            // Queue event if mainWindow not available
            socket_logger_1.socketLogger.warning('EVENT_QUEUE', 'Main window not available, queueing event', {
                type: event.type,
                queueSize: this.eventQueue.length,
                hasMainWindow: !!this.mainWindow,
                isDestroyed: this.mainWindow?.isDestroyed()
            });
            this.queueEvent(event);
        }
    }
    /**
     * Queue event for later delivery
     */
    queueEvent(event) {
        this.eventQueue.push(event);
        // Limit queue size to prevent memory issues
        if (this.eventQueue.length > 1000) {
            this.eventQueue.shift(); // Remove oldest event
            socket_logger_1.socketLogger.warning('EVENT_QUEUE', 'Event queue limit reached, dropping oldest event');
        }
    }
    /**
     * Flush queued events to renderer
     */
    flushEventQueue() {
        if (this.eventQueue.length === 0) {
            return;
        }
        if (!this.mainWindow || this.mainWindow.isDestroyed()) {
            return;
        }
        socket_logger_1.socketLogger.info('EVENT_QUEUE', `Flushing ${this.eventQueue.length} queued events`);
        const events = [...this.eventQueue];
        this.eventQueue = [];
        events.forEach((event) => {
            try {
                this.mainWindow.webContents.send('embedding-service:event', event);
            }
            catch (error) {
                socket_logger_1.socketLogger.error('EVENT_QUEUE', 'Error flushing queued event', {
                    error: error.message,
                    type: event.type
                });
                // Re-queue if send failed
                this.queueEvent(event);
            }
        });
        socket_logger_1.socketLogger.success('EVENT_QUEUE', `Flushed ${events.length} events`);
    }
    /**
     * Schedule reconnection attempt
     */
    scheduleReconnect() {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            socket_logger_1.socketLogger.error('RECONNECTION', 'Max reconnection attempts reached', {
                attempts: this.reconnectAttempts
            });
            return;
        }
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * this.reconnectAttempts;
        socket_logger_1.socketLogger.info('RECONNECTION', `Scheduling reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`, {
            delay,
            attempts: this.reconnectAttempts
        });
        this.reconnectTimeout = setTimeout(() => {
            if (!this.isConnected() && this.mainWindow && !this.mainWindow.isDestroyed()) {
                socket_logger_1.socketLogger.info('RECONNECTION', 'Attempting to reconnect WebSocket');
                this.connect().catch((error) => {
                    socket_logger_1.socketLogger.error('RECONNECTION', 'Reconnection failed', { error: error.message });
                });
            }
        }, delay);
    }
    /**
     * Disconnect WebSocket
     */
    disconnect() {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        if (this.socket) {
            try {
                this.socket.removeAllListeners();
                this.socket.close(1000); // Normal closure
            }
            catch (e) {
                // Ignore errors
            }
            this.socket = null;
        }
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        socket_logger_1.socketLogger.info('DISCONNECT', 'WebSocket disconnected');
    }
    /**
     * Cleanup resources
     */
    cleanup() {
        this.disconnect();
        this.removeAllListeners();
        this.eventQueue = [];
        this.mainWindow = null;
        socket_logger_1.socketLogger.info('CLEANUP', 'WebSocket manager cleaned up');
    }
}
// Export singleton instance
exports.webSocketManager = new WebSocketManager();
//# sourceMappingURL=WebSocketManager.js.map