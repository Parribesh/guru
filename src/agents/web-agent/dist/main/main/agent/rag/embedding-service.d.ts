import { EventEmitter } from 'events';
export interface EmbeddingTask {
    taskId: string;
    chunkId: string;
    text: string;
    batchId?: string;
}
export interface EmbeddingResult {
    chunkId?: string;
    chunk_id?: string;
    embedding: number[];
}
export interface TaskStatus {
    task_id?: string;
    taskId?: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress?: number;
    result?: EmbeddingResult | {
        chunk_id?: string;
        chunkId?: string;
        embedding: number[];
    };
    error?: string;
}
export interface EmbeddingServiceConfig {
    baseUrl?: string;
    apiKey?: string;
    timeout?: number;
    socketUrl?: string;
}
export declare class EmbeddingService extends EventEmitter {
    baseUrl: string;
    private apiKey?;
    private timeout;
    private socketUrl?;
    private socket?;
    pendingTasks: Map<string, {
        resolve: (result: EmbeddingResult) => void;
        reject: (error: Error) => void;
        chunkId: string;
        batchId?: string;
        startTime: number;
        waitStartTime: number;
    }>;
    taskMetrics: Map<string, {
        taskId: string;
        chunkId: string;
        batchId?: string;
        submittedAt: number;
        waitStartTime: number;
        completedAt?: number;
        waitDuration?: number;
        status: 'pending' | 'completed' | 'failed' | 'timeout';
        error?: string;
    }>;
    private reconnectAttempts;
    private maxReconnectAttempts;
    private reconnectDelay;
    private lastHealthCheck;
    private healthCheckCooldown;
    private healthCheckInProgress;
    constructor(config?: EmbeddingServiceConfig);
    /**
     * Connect to WebSocket for progress monitoring
     * NOTE: Global /ws endpoint has been removed. This method is kept for compatibility
     * but will always fall back to polling since the endpoint no longer exists.
     * Job monitoring now uses /ws/job/{job_id} endpoint directly from the frontend.
     */
    private connectSocket;
    /**
     * Handle messages from WebSocket
     * NOTE: The global /ws endpoint has been removed. This method is kept for compatibility
     * but will not receive the old task-level events (task_status, task_complete, etc.)
     * Job monitoring now uses /ws/job/{job_id} endpoint directly from the frontend.
     */
    private handleSocketMessage;
    /**
     * Handle task status updates
     * NOTE: This method is no longer used since task-level WebSocket events have been removed.
     * Task completion is now monitored via HTTP polling (GET /api/embeddings/task/{task_id})
     */
    private handleTaskStatus;
    /**
     * Submit batch of embedding tasks to Python service
     */
    /**
     * Submit all chunks at once to auto-batch endpoint
     * The endpoint automatically splits chunks into batches based on WORKER_BATCH_SIZE
     */
    submitAutoBatch(chunks: Array<{
        chunk_id: string;
        text: string;
    }>, jobId?: string): Promise<{
        job_id: string;
        batch_ids: string[];
        total_batches: number;
        tasks: Array<{
            chunk_id: string;
            task_id: string;
            batch_id?: string;
        }>;
    }>;
    submitBatch(chunks: Array<{
        chunk_id: string;
        text: string;
    }>, jobId?: string): Promise<{
        batch_id: string;
        tasks: Array<{
            chunk_id: string;
            task_id: string;
            batch_id?: string;
        }>;
    }>;
    /**
     * Submit embedding task to Python service
     */
    submitTask(chunkId: string, text: string): Promise<string>;
    /**
     * Poll task status (fallback if WebSocket is not available)
     */
    private pollTaskStatus;
    /**
     * Wait for a task that was already submitted (used for batch processing)
     */
    private waitForTask;
    /**
     * Generate embedding for a single chunk
     */
    generateEmbedding(chunkId: string, text: string): Promise<number[]>;
    /**
     * Poll until task is complete (fallback method)
     */
    private pollUntilComplete;
    /**
     * Generate embeddings for multiple chunks in batches
     */
    generateEmbeddings(chunks: Array<{
        id: string;
        content: string;
    }>, progressCallback?: (progress: {
        current: number;
        total: number;
    }) => void): Promise<Map<string, number[]>>;
    /**
     * Get job statistics from Python service
     */
    getJobStats(jobId: string): Promise<any>;
    /**
     * Check if service is available
     * Throttled to prevent overwhelming the server during job processing
     */
    healthCheck(): Promise<boolean>;
    /**
     * Disconnect and cleanup
     */
    disconnect(): void;
}
export declare function getEmbeddingService(config?: EmbeddingServiceConfig): EmbeddingService;
export declare function shutdownEmbeddingService(): void;
//# sourceMappingURL=embedding-service.d.ts.map