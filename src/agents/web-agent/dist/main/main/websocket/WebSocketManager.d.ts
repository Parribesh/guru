import { BrowserWindow } from 'electron';
import { EventEmitter } from 'events';
export interface WebSocketEvent {
    type: string;
    payload?: any;
    timestamp: number;
    [key: string]: any;
}
declare class WebSocketManager extends EventEmitter {
    private socket;
    private WebSocketClass;
    private isConnecting;
    private connectionLock;
    private mainWindow;
    private eventQueue;
    private reconnectTimeout;
    private reconnectAttempts;
    private maxReconnectAttempts;
    private reconnectDelay;
    private baseUrl;
    private wsUrl;
    constructor();
    /**
     * Initialize WebSocket library
     */
    private initializeWebSocketLibrary;
    /**
     * Update base URL from embedding service
     */
    private updateBaseUrl;
    /**
     * Set the main window for event forwarding
     */
    setMainWindow(window: BrowserWindow | null): void;
    /**
     * Check if WebSocket is connected
     */
    isConnected(): boolean;
    /**
     * Get connection state
     */
    getConnectionState(): {
        connected: boolean;
        connecting: boolean;
        readyState: number | null;
        url: string;
    };
    /**
     * Connect to WebSocket with proper locking to prevent duplicates
     */
    connect(): Promise<void>;
    /**
     * Perform the actual WebSocket connection
     */
    private performConnection;
    /**
     * Handle incoming WebSocket messages
     */
    private handleMessage;
    /**
     * Send event to renderer (with queueing if mainWindow unavailable)
     */
    private sendToRenderer;
    /**
     * Queue event for later delivery
     */
    private queueEvent;
    /**
     * Flush queued events to renderer
     */
    private flushEventQueue;
    /**
     * Schedule reconnection attempt
     */
    private scheduleReconnect;
    /**
     * Disconnect WebSocket
     */
    disconnect(): void;
    /**
     * Cleanup resources
     */
    cleanup(): void;
}
export declare const webSocketManager: WebSocketManager;
export {};
//# sourceMappingURL=WebSocketManager.d.ts.map