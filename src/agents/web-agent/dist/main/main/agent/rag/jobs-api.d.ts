/**
 * Jobs API Service
 * Handles CRUD operations for embedding jobs via HTTP API
 */
export interface JobListItem {
    job_id: string;
    status: string;
    created_at?: number;
    completed_at?: number;
    total_chunks?: number;
    completed_chunks?: number;
    failed_chunks?: number;
}
export interface JobDetails {
    job_id: string;
    status: string;
    created_at?: number;
    started_at?: number;
    completed_at?: number;
    duration_ms?: number;
    duration?: number;
    execution_time_sec?: number;
    report_generated_at?: number;
    total_chunks?: number;
    completed_chunks?: number;
    failed_chunks?: number;
    pending_chunks?: number;
    total_batches?: number;
    completed_batches?: number;
    failed_batches?: number;
    processing_batches?: number;
    pending_batches?: number;
    avg_batch_size?: number;
    min_batch_size?: number;
    max_batch_size?: number;
    success_rate?: number;
    overall_throughput_chunks_per_sec?: number;
    avg_batch_execution_time_sec?: number;
    min_batch_execution_time_sec?: number;
    max_batch_execution_time_sec?: number;
    batch_metrics?: Record<string, any>;
    batches?: Array<any>;
    job_metrics?: any;
    [key: string]: any;
}
export declare class JobsAPI {
    private baseUrl;
    constructor();
    /**
     * Make HTTP request
     */
    private httpRequest;
    /**
     * List all jobs with optional filters
     */
    listJobs(limit?: number, status?: string): Promise<JobListItem[]>;
    /**
     * Get a single job by ID
     */
    getJob(jobId: string): Promise<JobDetails | null>;
    /**
     * Get job count with optional status filter
     */
    getJobCount(status?: string): Promise<number>;
    /**
     * Delete a job by ID
     */
    deleteJob(jobId: string): Promise<boolean>;
}
export declare function getJobsAPI(): JobsAPI;
//# sourceMappingURL=jobs-api.d.ts.map