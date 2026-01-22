/**
 * Queue API Service
 * Handles queue status and metrics from the embedding service
 */

import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import { getEmbeddingServiceUrl } from '../../config';

export interface QueueStatus {
  queue_size?: number;
  queue_maxsize?: number;
  queue_usage_percent?: number;
  num_workers?: number;
  workers?: Array<{ worker_id: string; state: string; [key: string]: any }>;
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

export class QueueAPI {
  private baseUrl: string;
  private apiKey?: string;

  constructor() {
    this.baseUrl = getEmbeddingServiceUrl();
    // Get API key from environment or config
    this.apiKey = process.env.EMBEDDING_SERVICE_API_KEY || undefined;
    console.log('[QueueAPI] Initialized with baseUrl:', this.baseUrl, 'apiKey:', this.apiKey ? '***' : 'none');
  }

  /**
   * Make HTTP request
   */
  private async httpRequest(
    method: string,
    path: string
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const isHttps = url.protocol === 'https:';

      const headers: any = {
        'Content-Type': 'application/json',
      };
      
      // Add API key if available (API contract requires X-API-Key header)
      if (this.apiKey) {
        headers['X-API-Key'] = this.apiKey;
      }
      
      const options: any = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + (url.search || ''),
        method: method,
        headers,
        timeout: 5000,
      };
      
      console.log('[QueueAPI] Making request:', method, url.toString(), 'headers:', Object.keys(headers));

      const client = isHttps ? https : http;
      const req = client.request(options, (res: any) => {
        let responseData = '';

        res.on('data', (chunk: Buffer) => {
          responseData += chunk.toString();
        });

        res.on('end', () => {
          console.log('[QueueAPI] Response status:', res.statusCode, 'data length:', responseData.length);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const json = responseData ? JSON.parse(responseData) : {};
              console.log('[QueueAPI] Parsed JSON response successfully');
              resolve(json);
            } catch (error: any) {
              console.warn('[QueueAPI] Failed to parse JSON, returning raw data');
              resolve(responseData || {});
            }
          } else {
            console.error('[QueueAPI] HTTP error:', res.statusCode, responseData.substring(0, 200));
            reject(new Error(`HTTP ${res.statusCode}: ${responseData || res.statusMessage}`));
          }
        });
      });

      req.on('error', (error: Error) => {
        console.error('[QueueAPI] Request error:', error.message, error.stack);
        reject(error);
      });

      req.on('timeout', () => {
        console.error('[QueueAPI] Request timeout after 5s');
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.end();
    });
  }

  /**
   * Get queue status with worker information
   */
  async getStatus(): Promise<QueueStatus> {
    try {
      console.log('[QueueAPI] Fetching queue status from:', this.baseUrl);
      const response = await this.httpRequest('GET', '/api/queue/status');
      console.log('[QueueAPI] Queue status response:', JSON.stringify(response).substring(0, 200));
      return response;
    } catch (error: any) {
      console.error('[QueueAPI] Error getting queue status:', error.message || error);
      throw error;
    }
  }

  /**
   * Get detailed queue metrics
   */
  async getMetrics(): Promise<QueueMetrics> {
    try {
      console.log('[QueueAPI] Fetching queue metrics from:', this.baseUrl);
      const response = await this.httpRequest('GET', '/api/queue/metrics');
      console.log('[QueueAPI] Queue metrics response:', JSON.stringify(response).substring(0, 200));
      return response;
    } catch (error: any) {
      console.error('[QueueAPI] Error getting queue metrics:', error.message || error);
      throw error;
    }
  }

  /**
   * Get health status (includes queue metrics)
   */
  async getHealth(): Promise<any> {
    try {
      const response = await this.httpRequest('GET', '/health');
      return response;
    } catch (error: any) {
      console.error('[QueueAPI] Error getting health:', error);
      throw error;
    }
  }
}

let queueAPIInstance: QueueAPI | null = null;

export function getQueueAPI(): QueueAPI {
  if (!queueAPIInstance) {
    queueAPIInstance = new QueueAPI();
  }
  return queueAPIInstance;
}

