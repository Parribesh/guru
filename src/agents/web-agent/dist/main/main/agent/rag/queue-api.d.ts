/**
 * Queue API Service
 * Handles queue status and metrics from the embedding service
 */
export interface QueueStatus {
    queue_size?: number;
    queue_maxsize?: number;
    queue_usage_percent?: number;
    num_workers?: number;
    workers?: Array<{
        worker_id: string;
        state: string;
        [key: string]: any;
    }>;
    worker_batch_size?: number;
    processing?: number;
    completed?: number;
    failed?: number;
    [key: string]: any;
}
export interface QueueMetrics {
    size?: number;
    usage?: number;
    state?: string;
    totals?: {
        completed?: number;
        failed?: number;
        processing?: number;
        pending?: number;
    };
    workers?: {
        total?: number;
        active?: number;
        idle?: number;
    };
    [key: string]: any;
}
export declare class QueueAPI {
    private baseUrl;
    private apiKey?;
    constructor();
    /**
     * Make HTTP request
     */
    private httpRequest;
    /**
     * Get queue status with worker information
     */
    getStatus(): Promise<QueueStatus>;
    /**
     * Get detailed queue metrics
     */
    getMetrics(): Promise<QueueMetrics>;
    /**
     * Get health status (includes queue metrics)
     */
    getHealth(): Promise<any>;
}
export declare function getQueueAPI(): QueueAPI;
//# sourceMappingURL=queue-api.d.ts.map