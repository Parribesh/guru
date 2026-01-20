/**
 * Jobs API Service
 * Handles CRUD operations for embedding jobs via HTTP API
 */

import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import { getEmbeddingServiceUrl } from '../../config';

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

export class JobsAPI {
  private baseUrl: string;

  constructor() {
    this.baseUrl = getEmbeddingServiceUrl();
  }

  /**
   * Make HTTP request
   */
  private async httpRequest(
    method: string,
    path: string,
    data?: any
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const isHttps = url.protocol === 'https:';

      const options: any = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + (url.search || ''),
        method: method,
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      };

      const client = isHttps ? https : http;
      const req = client.request(options, (res: any) => {
        let responseData = '';

        res.on('data', (chunk: Buffer) => {
          responseData += chunk.toString();
        });

        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const json = responseData ? JSON.parse(responseData) : {};
              resolve(json);
            } catch (error: any) {
              resolve(responseData || {});
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${responseData || res.statusMessage}`));
          }
        });
      });

      req.on('error', (error: Error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        req.write(JSON.stringify(data));
      }

      req.end();
    });
  }

  /**
   * List all jobs with optional filters
   */
  async listJobs(limit?: number, status?: string): Promise<JobListItem[]> {
    try {
      const params = new URLSearchParams();
      if (limit) params.append('limit', limit.toString());
      if (status) params.append('status', status);
      
      const queryString = params.toString();
      const path = `/api/embeddings/jobs${queryString ? `?${queryString}` : ''}`;
      
      const response = await this.httpRequest('GET', path);
      return Array.isArray(response) ? response : (response.jobs || []);
    } catch (error: any) {
      console.error('[JobsAPI] Error listing jobs:', error);
      throw error;
    }
  }

  /**
   * Get a single job by ID
   */
  async getJob(jobId: string): Promise<JobDetails | null> {
    try {
      const response = await this.httpRequest('GET', `/api/embeddings/job/${jobId}`);
      return response;
    } catch (error: any) {
      if (error.message.includes('404')) {
        return null;
      }
      console.error(`[JobsAPI] Error getting job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Get job count with optional status filter
   */
  async getJobCount(status?: string): Promise<number> {
    try {
      const path = `/api/embeddings/jobs/count${status ? `?status=${status}` : ''}`;
      const response = await this.httpRequest('GET', path);
      return typeof response === 'number' ? response : (response.count || response.total || 0);
    } catch (error: any) {
      console.error('[JobsAPI] Error getting job count:', error);
      throw error;
    }
  }

  /**
   * Delete a job by ID
   */
  async deleteJob(jobId: string): Promise<boolean> {
    try {
      await this.httpRequest('DELETE', `/api/embeddings/job/${jobId}`);
      return true;
    } catch (error: any) {
      console.error(`[JobsAPI] Error deleting job ${jobId}:`, error);
      throw error;
    }
  }
}

let jobsAPIInstance: JobsAPI | null = null;

export function getJobsAPI(): JobsAPI {
  if (!jobsAPIInstance) {
    jobsAPIInstance = new JobsAPI();
  }
  return jobsAPIInstance;
}

