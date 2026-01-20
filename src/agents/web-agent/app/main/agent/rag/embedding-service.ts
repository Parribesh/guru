// HTTP-based Embedding Service
// Communicates with Python service via HTTP endpoints and WebSocket for progress monitoring

import { eventLogger } from '../../logging/event-logger';
import { EventEmitter } from 'events';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import { 
  getEmbeddingBatchSize, 
  getEmbeddingServiceUrl, 
  getEmbeddingSocketUrl,
  getEmbeddingTimeout 
} from '../../config';
import { v4 as uuidv4 } from 'uuid';

export interface EmbeddingTask {
  taskId: string;
  chunkId: string;
  text: string;
  batchId?: string;  // Track which batch this chunk belongs to
}

export interface EmbeddingResult {
  chunkId?: string;  // camelCase (our format)
  chunk_id?: string; // snake_case (Python format)
  embedding: number[];
}

export interface TaskStatus {
  task_id?: string;  // Python server uses snake_case
  taskId?: string;   // Our code uses camelCase
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

export class EmbeddingService extends EventEmitter {
  public baseUrl: string; // Made public for status checks
  private apiKey?: string;
  private timeout: number;
  private socketUrl?: string;
  private socket?: WebSocket;
  public pendingTasks: Map<string, { // Made public for status checks
    resolve: (result: EmbeddingResult) => void;
    reject: (error: Error) => void;
    chunkId: string;
    batchId?: string;  // Track which batch this chunk belongs to
    startTime: number;  // When task was submitted
    waitStartTime: number;  // When we started waiting for the task
  }> = new Map();
  
  // Track completed tasks for performance monitoring
  public taskMetrics: Map<string, {
    taskId: string;
    chunkId: string;
    batchId?: string;
    submittedAt: number;
    waitStartTime: number;
    completedAt?: number;
    waitDuration?: number;  // Time spent waiting for completion
    status: 'pending' | 'completed' | 'failed' | 'timeout';
    error?: string;
  }> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  
  // Health check throttling to prevent overwhelming the server
  private lastHealthCheck: number = 0;
  private healthCheckCooldown: number = 10000; // 10 seconds between health checks
  private healthCheckInProgress: boolean = false;

  constructor(config: EmbeddingServiceConfig = {}) {
    super();
    // Use centralized config with override from constructor parameter
    // Use 127.0.0.1 instead of localhost to avoid IPv6 issues (::1)
    // localhost can resolve to IPv6 ::1 which may not be listening
    this.baseUrl = config.baseUrl || getEmbeddingServiceUrl();
    this.apiKey = config.apiKey || process.env.EMBEDDING_SERVICE_API_KEY;
    this.timeout = config.timeout || getEmbeddingTimeout();
    // NOTE: Global /ws endpoint has been removed. Job monitoring now uses /ws/job/{job_id} endpoint
    // This socketUrl is kept for backward compatibility but will not be used for task monitoring
    this.socketUrl = config.socketUrl || getEmbeddingSocketUrl();
    
    console.log(`[Embedding Service] Initialized with base URL: ${this.baseUrl}`);
    console.log(`[Embedding Service] Note: Global WebSocket endpoint (/ws) has been removed. Task completion uses HTTP polling.`);
    eventLogger.info('Embedding Service', `Initialized with base URL: ${this.baseUrl}`);
  }

  /**
   * Connect to WebSocket for progress monitoring
   * NOTE: Global /ws endpoint has been removed. This method is kept for compatibility
   * but will always fall back to polling since the endpoint no longer exists.
   * Job monitoring now uses /ws/job/{job_id} endpoint directly from the frontend.
   */
  private async connectSocket(): Promise<void> {
    if (this.socket && (this.socket as any).readyState === 1) { // WebSocket.OPEN = 1
      console.log(`[Embedding Service] WebSocket already connected`);
      return; // Already connected
    }

    return new Promise((resolve, reject) => {
      try {
        // Try to use 'ws' package if available, otherwise use polling
        let WebSocketClass: any;
        try {
          WebSocketClass = require('ws');
          console.log(`[Embedding Service] WebSocket library found, connecting to ${this.socketUrl}`);
        } catch (err) {
          // 'ws' package not available, will use polling
          console.warn(`[Embedding Service] WebSocket library not available (${err}), using polling mode`);
          eventLogger.info('Embedding Service', 'WebSocket library not available, using polling mode');
          resolve();
          return;
        }

        // OBSOLETE: WebSocket connection is now handled by main process (misc-handlers.ts)
        // DO NOT create WebSocket connection here - it creates duplicate connections
        // The main process manages a single global WebSocket connection to /ws
        console.log(`[Embedding Service] WebSocket connection skipped - handled by main process`);
        resolve();
        return;
      } catch (error: any) {
        eventLogger.error('Embedding Service', `Failed to create WebSocket: ${error.message}`);
        // Don't reject, just use polling mode
        resolve();
      }
    });
  }

  /**
   * Handle messages from WebSocket
   * NOTE: The global /ws endpoint has been removed. This method is kept for compatibility
   * but will not receive the old task-level events (task_status, task_complete, etc.)
   * Job monitoring now uses /ws/job/{job_id} endpoint directly from the frontend.
   */
  private handleSocketMessage(data: any): void {
    console.log(`[Embedding Service] Received WebSocket message:`, JSON.stringify(data).substring(0, 300));
    
    // Extract job_id from WebSocket message if present and forward it immediately
    // Check multiple possible locations where job_id might be in the message
    const jobId = data.job_id || 
                  data.jobId || 
                  (data.task_status as any)?.job_id || 
                  (data.task_status as any)?.jobId ||
                  (data.status as any)?.job_id || 
                  (data.status as any)?.jobId ||
                  (data.result as any)?.job_id ||
                  (data.result as any)?.jobId ||
                  (data.batch_id && typeof data.batch_id === 'object' ? (data.batch_id as any).job_id : undefined) ||
                  (data.batch as any)?.job_id ||
                  (data.batch as any)?.jobId;
    
    if (jobId) {
      console.log(`[Embedding Service] Extracted job_id from WebSocket message: ${jobId}`);
      this.emit('websocket_message', { jobId, originalMessage: data });
    }
    
    // NOTE: Task-level events (task_status, task_complete, etc.) are no longer sent by the backend
    // Task completion is now monitored via HTTP polling (GET /api/embeddings/task/{task_id})
    // Job status is monitored via /ws/job/{job_id} WebSocket endpoint (from frontend)
  }

  /**
   * Handle task status updates
   * NOTE: This method is no longer used since task-level WebSocket events have been removed.
   * Task completion is now monitored via HTTP polling (GET /api/embeddings/task/{task_id})
   */
  private handleTaskStatus(status: TaskStatus, batchId?: string): void {
    // Handle both snake_case (Python) and camelCase (our code) formats
    const taskId = status.task_id || status.taskId;
    if (!taskId) {
      console.error(`[Embedding Service] Task status missing task_id/taskId:`, JSON.stringify(status));
      return;
    }
    
    console.log(`[Embedding Service] Handling task status: ${taskId}, status: ${status.status}${batchId ? `, batch: ${batchId}` : ''}`);
    const task = this.pendingTasks.get(taskId);
    if (!task) {
      console.warn(`[Embedding Service] Task ${taskId} not found in pending tasks (already resolved or never registered)`);
      return; // Task not found or already resolved
    }

    // Update task's batchId if provided in message
    if (batchId && !task.batchId) {
      task.batchId = batchId;
    }

    if (status.status === 'completed' && status.result) {
      // Handle both result formats (snake_case from Python, camelCase from our code)
      let embeddingResult: EmbeddingResult;
      if (status.result && 'embedding' in status.result && Array.isArray(status.result.embedding)) {
        // Direct format: { embedding: number[] } or { chunk_id, embedding }
        embeddingResult = {
          chunkId: (status.result as any).chunk_id || (status.result as any).chunkId || task.chunkId,
          chunk_id: (status.result as any).chunk_id || (status.result as any).chunkId || task.chunkId,
          embedding: status.result.embedding
        };
      } else {
        // EmbeddingResult format
        embeddingResult = status.result as EmbeddingResult;
      }
      
      const finalBatchId = task.batchId || batchId || (status.result as any)?.batch_id;
      const waitDuration = Date.now() - task.waitStartTime;
      console.log(`[Embedding Service] Resolving task ${taskId} with embedding (${embeddingResult.embedding.length} dimensions)${finalBatchId ? ` [batch: ${finalBatchId}]` : ''} (waited ${waitDuration}ms)`);
      
      // Update metrics
      const metric = this.taskMetrics.get(taskId);
      if (metric) {
        metric.completedAt = Date.now();
        metric.waitDuration = waitDuration;
        metric.status = 'completed';
      }
      
      task.resolve(embeddingResult);
      this.pendingTasks.delete(taskId);
      this.emit('task_complete', taskId, {
        chunkId: embeddingResult.chunkId || task.chunkId,
        batchId: finalBatchId,
      });
    } else if (status.status === 'failed') {
      const error = new Error(status.error || 'Task failed');
      const waitDuration = Date.now() - task.waitStartTime;
      console.error(`[Embedding Service] Rejecting task ${taskId}: ${error.message} (waited ${waitDuration}ms)`);
      
      // Update metrics
      const metric = this.taskMetrics.get(taskId);
      if (metric) {
        metric.completedAt = Date.now();
        metric.waitDuration = waitDuration;
        metric.status = 'failed';
        metric.error = error.message;
      }
      
      task.reject(error);
      this.pendingTasks.delete(taskId);
      this.emit('task_error', taskId, error, task.chunkId, task.batchId);
    } else {
      // Update progress (pending or processing)
      console.log(`[Embedding Service] Task ${taskId} progress: ${status.progress || 0} (status: ${status.status})${task.batchId ? ` [batch: ${task.batchId}]` : ''}`);
      this.emit('task_progress', taskId, status.progress || 0, task.chunkId, task.batchId);
    }
  }

  /**
   * Submit batch of embedding tasks to Python service
   */
  /**
   * Submit all chunks at once to auto-batch endpoint
   * The endpoint automatically splits chunks into batches based on WORKER_BATCH_SIZE
   */
  async submitAutoBatch(
    chunks: Array<{ chunk_id: string; text: string }>,
    jobId?: string
  ): Promise<{ job_id: string; batch_ids: string[]; total_batches: number; tasks: Array<{ chunk_id: string; task_id: string; batch_id?: string }> }> {
    const fullUrl = `${this.baseUrl}/api/embeddings/job/auto-batch`;
    const providedJobId = jobId || uuidv4();
    eventLogger.info('Embedding Service', `Submitting ${chunks.length} chunks to auto-batch endpoint (job: ${providedJobId})`);
    console.log(`[Embedding Service] Submitting ${chunks.length} chunks to auto-batch endpoint: ${fullUrl} (job: ${providedJobId})`);
    
    const requestData: any = {
      job_id: providedJobId,
      chunks: chunks.map(chunk => ({
        chunk_id: chunk.chunk_id,
        text: chunk.text,
      })),
    };

    return new Promise((resolve, reject) => {
      try {
        const urlObj = new URL(fullUrl);
        const options = {
          hostname: urlObj.hostname,
          port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
          path: urlObj.pathname + (urlObj.search || ''),
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` }),
          },
          timeout: this.timeout * 3, // Allow more time for large requests
        };

        const client = urlObj.protocol === 'https:' ? https : http;
        const req = client.request(options, (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            if (res.statusCode === 200 || res.statusCode === 201) {
              try {
                const response = JSON.parse(data);
                if (response.job_id && response.batch_ids && response.total_batches !== undefined) {
                  console.log(`[Embedding Service] Auto-batch job created: ${response.job_id} with ${response.total_batches} batches`);
                  eventLogger.info('Embedding Service', `Auto-batch job created: ${response.job_id} with ${response.total_batches} batches`);
                  
                  // Extract all tasks from batches if provided in response
                  const allTasks: Array<{ chunk_id: string; task_id: string; batch_id?: string }> = [];
                  if (response.batches && Array.isArray(response.batches)) {
                    response.batches.forEach((batch: any) => {
                      if (batch.tasks && Array.isArray(batch.tasks)) {
                        batch.tasks.forEach((task: any) => {
                          allTasks.push({
                            chunk_id: task.chunk_id || task.chunkId,
                            task_id: task.task_id || task.taskId,
                            batch_id: batch.batch_id || batch.batchId,
                          });
                        });
                      }
                    });
                  }
                  
                  // Emit job_started event so main process can connect WebSocket for monitoring
                  this.emit('websocket_message', { jobId: response.job_id, originalMessage: response });
                  
                  resolve({
                    job_id: response.job_id,
                    batch_ids: response.batch_ids || [],
                    total_batches: response.total_batches,
                    tasks: allTasks,
                  });
                } else {
                  eventLogger.error('Embedding Service', `Invalid auto-batch response: missing job_id, batch_ids, or total_batches. Response: ${data}`);
                  reject(new Error('Invalid response: missing job_id, batch_ids, or total_batches'));
                }
              } catch (error: any) {
                eventLogger.error('Embedding Service', `Failed to parse auto-batch response: ${error.message}, body: ${data}`);
                reject(new Error(`Failed to parse response: ${error.message}`));
              }
            } else {
              const errorMsg = `Auto-batch HTTP ${res.statusCode}: ${data}`;
              console.error(`[Embedding Service] ${errorMsg}`);
              eventLogger.error('Embedding Service', errorMsg);
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            }
          });
        });

        req.on('error', (error) => {
          const errorMsg = `Auto-batch request error: ${error.message}`;
          console.error(`[Embedding Service] ${errorMsg}`);
          eventLogger.error('Embedding Service', errorMsg);
          reject(error);
        });

        req.on('timeout', () => {
          req.destroy();
          eventLogger.error('Embedding Service', 'Auto-batch request timeout');
          reject(new Error('Request timeout'));
        });

        req.write(JSON.stringify(requestData));
        req.end();
      } catch (error: any) {
        eventLogger.error('Embedding Service', `Failed to create auto-batch request: ${error.message}`);
        reject(error);
      }
    });
  }

  async submitBatch(
    chunks: Array<{ chunk_id: string; text: string }>,
    jobId?: string
  ): Promise<{ batch_id: string; tasks: Array<{ chunk_id: string; task_id: string; batch_id?: string }> }> {
    const fullUrl = `${this.baseUrl}/api/embeddings/batch`;
    eventLogger.debug('Embedding Service', `Submitting batch of ${chunks.length} chunks to ${fullUrl}${jobId ? ` (job: ${jobId})` : ''}`);
    
    const requestData: any = {
      chunks: chunks,
    };
    
    // Include jobId if provided
    if (jobId) {
      requestData.job_id = jobId;
    }

    return new Promise((resolve, reject) => {
      try {
        const urlObj = new URL(fullUrl);
        const options = {
          hostname: urlObj.hostname,
          port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
          path: urlObj.pathname + (urlObj.search || ''),
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` }),
          },
          timeout: this.timeout,
        };

        eventLogger.debug('Embedding Service', `Batch request options: ${JSON.stringify({ ...options, headers: options.headers })}`);

        const client = urlObj.protocol === 'https:' ? https : http;
        const req = client.request(options, (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            eventLogger.debug('Embedding Service', `Batch response status: ${res.statusCode}, body: ${data.substring(0, 200)}`);
            if (res.statusCode === 200 || res.statusCode === 201) {
              try {
                const response = JSON.parse(data);
                if (response.batch_id && response.tasks) {
                  // Ensure each task includes batch_id
                  const tasksWithBatchId = response.tasks.map((task: any) => ({
                    ...task,
                    batch_id: response.batch_id,
                  }));
                  eventLogger.debug('Embedding Service', `Batch submitted successfully: ${response.batch_id} with ${tasksWithBatchId.length} tasks`);
                  
                  // If response includes job_id, emit it immediately
                  const responseJobId = response.job_id || response.jobId;
                  if (responseJobId) {
                    console.log(`[Embedding Service] Extracted job_id from batch submission response: ${responseJobId}`);
                    this.emit('websocket_message', { jobId: responseJobId, originalMessage: response });
                  }
                  
                  resolve({
                    ...response,
                    tasks: tasksWithBatchId,
                  });
                } else {
                  eventLogger.error('Embedding Service', `Invalid batch response: missing batch_id or tasks. Response: ${data}`);
                  reject(new Error('Invalid response: missing batch_id or tasks'));
                }
              } catch (error: any) {
                eventLogger.error('Embedding Service', `Failed to parse batch response: ${error.message}, body: ${data}`);
                reject(new Error(`Failed to parse response: ${error.message}`));
              }
            } else {
              const errorMsg = `Batch HTTP ${res.statusCode}: ${data}`;
              console.error(`[Embedding Service] ${errorMsg}`);
              eventLogger.error('Embedding Service', errorMsg);
              console.error('[Embedding Service] Batch submission failed - will fall back to individual task submissions');
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            }
          });
        });

        req.on('error', (error) => {
          const errorMsg = `Batch request error: ${error.message}`;
          console.error(`[Embedding Service] ${errorMsg}`);
          console.error('[Embedding Service] This may indicate the batch endpoint is not available on the backend');
          eventLogger.error('Embedding Service', errorMsg);
          reject(error);
        });

        req.on('timeout', () => {
          req.destroy();
          eventLogger.error('Embedding Service', 'Batch request timeout');
          reject(new Error('Request timeout'));
        });

        req.write(JSON.stringify(requestData));
        req.end();
      } catch (error: any) {
        eventLogger.error('Embedding Service', `Failed to create batch request: ${error.message}`);
        reject(error);
      }
    });
  }

  /**
   * Submit embedding task to Python service
   */
  async submitTask(chunkId: string, text: string): Promise<string> {
    const fullUrl = `${this.baseUrl}/api/embeddings/task`;
    eventLogger.debug('Embedding Service', `Submitting task for chunk ${chunkId} to ${fullUrl}`);
    
    const requestData = {
      chunk_id: chunkId,
      text: text,
    };

    return new Promise((resolve, reject) => {
      try {
        const urlObj = new URL(fullUrl);
        const options = {
          hostname: urlObj.hostname,
          port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
          path: urlObj.pathname + (urlObj.search || ''),
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` }),
          },
          timeout: this.timeout,
        };

        eventLogger.debug('Embedding Service', `Request options: ${JSON.stringify({ ...options, headers: options.headers })}`);

        const client = urlObj.protocol === 'https:' ? https : http;
        const req = client.request(options, (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            eventLogger.debug('Embedding Service', `Response status: ${res.statusCode}, body: ${data.substring(0, 200)}`);
            if (res.statusCode === 200 || res.statusCode === 201) {
              try {
                const response = JSON.parse(data);
                if (response.task_id) {
                  eventLogger.debug('Embedding Service', `Task submitted successfully: ${response.task_id}`);
                  resolve(response.task_id);
                } else {
                  eventLogger.error('Embedding Service', `Invalid response: missing task_id. Response: ${data}`);
                  reject(new Error('Invalid response: missing task_id'));
                }
              } catch (error: any) {
                eventLogger.error('Embedding Service', `Failed to parse response: ${error.message}, body: ${data}`);
                reject(new Error(`Failed to parse response: ${error.message}`));
              }
            } else {
              eventLogger.error('Embedding Service', `HTTP ${res.statusCode}: ${data}`);
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            }
          });
        });

        req.on('error', (error) => {
          eventLogger.error('Embedding Service', `Request error for chunk ${chunkId}: ${error.message}`);
          eventLogger.error('Embedding Service', `Error details: ${error.stack || 'No stack trace'}`);
          reject(new Error(`Request failed: ${error.message}`));
        });

        req.on('timeout', () => {
          eventLogger.error('Embedding Service', `Request timeout for chunk ${chunkId} after ${this.timeout}ms`);
          req.destroy();
          reject(new Error('Request timeout'));
        });

        const requestBody = JSON.stringify(requestData);
        eventLogger.debug('Embedding Service', `Sending request body: ${requestBody.substring(0, 200)}...`);
        req.write(requestBody);
        req.end();
      } catch (error: any) {
        eventLogger.error('Embedding Service', `Failed to create request: ${error.message}`);
        eventLogger.error('Embedding Service', `Error stack: ${error.stack || 'No stack trace'}`);
        reject(new Error(`Failed to create request: ${error.message}`));
      }
    });
  }

  /**
   * Poll task status (fallback if WebSocket is not available)
   */
  private async pollTaskStatus(taskId: string): Promise<TaskStatus> {
    const fullUrl = `${this.baseUrl}/api/embeddings/task/${taskId}`;
    const urlObj = new URL(fullUrl);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + (urlObj.search || ''),
      method: 'GET',
      headers: {
        ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` }),
      },
      timeout: 5000, // 5 second timeout for polling requests
    };

    return new Promise((resolve, reject) => {
      const client = urlObj.protocol === 'https:' ? https : http;
      const req = client.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const parsed = JSON.parse(data);
              // Handle Python server response format (TaskStatusResponse with snake_case)
              const status: TaskStatus = {
                task_id: parsed.task_id,
                taskId: parsed.task_id, // Also set camelCase for compatibility
                status: parsed.status,
                progress: parsed.progress,
                result: parsed.result ? {
                  chunkId: parsed.result.chunk_id || parsed.result.chunkId,
                  chunk_id: parsed.result.chunk_id || parsed.result.chunkId,
                  embedding: parsed.result.embedding
                } : undefined,
                error: parsed.error
              };
              console.log(`[Embedding Service] Polled task status: ${status.task_id}, status: ${status.status}`);
              resolve(status);
            } catch (error: any) {
              console.error(`[Embedding Service] Failed to parse task status response for ${taskId}: ${error.message}, body: ${data.substring(0, 200)}`);
              reject(new Error(`Failed to parse response: ${error.message}`));
            }
          } else {
            console.error(`[Embedding Service] Task status request failed for ${taskId}: HTTP ${res.statusCode}, body: ${data.substring(0, 200)}`);
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', (error) => {
        console.error(`[Embedding Service] Task status request error for ${taskId}: ${error.message}`);
        reject(new Error(`Request failed: ${error.message}`));
      });

      req.on('timeout', () => {
        console.warn(`[Embedding Service] Task status request timeout for ${taskId}`);
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.end();
    });
  }

  /**
   * Wait for a task that was already submitted (used for batch processing)
   */
  private async waitForTask(taskId: string, chunkId: string, batchId?: string): Promise<number[]> {
    const waitStartTime = Date.now();
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const task = this.pendingTasks.get(taskId);
        if (task) {
          // Update metrics for timeout
          const waitDuration = Date.now() - task.waitStartTime;
          this.taskMetrics.set(taskId, {
            taskId,
            chunkId,
            batchId,
            submittedAt: task.startTime,
            waitStartTime: task.waitStartTime,
            completedAt: Date.now(),
            waitDuration,
            status: 'timeout',
            error: `Timeout after ${this.timeout}ms`,
          });
        }
        this.pendingTasks.delete(taskId);
        reject(new Error(`Task ${taskId} timeout after ${this.timeout}ms`));
      }, this.timeout);

      // Track task start time
      const submittedAt = Date.now();
      
      this.pendingTasks.set(taskId, {
        resolve: (result) => {
          clearTimeout(timeout);
          const waitDuration = Date.now() - waitStartTime;
          // Update metrics for successful completion
          this.taskMetrics.set(taskId, {
            taskId,
            chunkId,
            batchId,
            submittedAt,
            waitStartTime,
            completedAt: Date.now(),
            waitDuration,
            status: 'completed',
          });
          resolve(result.embedding);
        },
        reject: (error) => {
          clearTimeout(timeout);
          const waitDuration = Date.now() - waitStartTime;
          // Update metrics for failure
          this.taskMetrics.set(taskId, {
            taskId,
            chunkId,
            batchId,
            submittedAt,
            waitStartTime,
            completedAt: Date.now(),
            waitDuration,
            status: 'failed',
            error: error.message,
          });
          reject(error);
        },
        chunkId,
        batchId,  // Store batchId with task
        startTime: submittedAt,
        waitStartTime,
      });
      
      // Initialize metrics entry
      this.taskMetrics.set(taskId, {
        taskId,
        chunkId,
        batchId,
        submittedAt,
        waitStartTime,
        status: 'pending',
      });

      // NOTE: Global /ws endpoint has been removed. Always use HTTP polling for task completion.
      // Job status monitoring uses /ws/job/{job_id} endpoint from the frontend.
      this.pollUntilComplete(taskId, resolve, reject, timeout);
    });
  }

  /**
   * Generate embedding for a single chunk
   */
  async generateEmbedding(chunkId: string, text: string): Promise<number[]> {
    // WebSocket connection is now handled by main process (misc-handlers.ts)
    // No need to connect here - main process manages the global WebSocket connection

    // Submit task
    const taskId = await this.submitTask(chunkId, text);
    eventLogger.debug('Embedding Service', `Task submitted: ${taskId} for chunk ${chunkId}`);
    this.emit('task_submitted', taskId, chunkId);

    // Wait for result
    return this.waitForTask(taskId, chunkId);
  }

  /**
   * Poll until task is complete (fallback method)
   */
  private async pollUntilComplete(
    taskId: string,
    resolve: (embedding: number[]) => void,
    reject: (error: Error) => void,
    timeout: NodeJS.Timeout
  ): Promise<void> {
    const pollInterval = 500; // Poll every 500ms
    const maxPolls = Math.floor(this.timeout / pollInterval);

    let pollCount = 0;
    const poll = async () => {
      if (pollCount >= maxPolls) {
        clearTimeout(timeout);
        this.pendingTasks.delete(taskId);
        console.error(`[Embedding Service] Task ${taskId} timeout after ${maxPolls} polls (${this.timeout}ms)`);
        reject(new Error(`Task ${taskId} timeout after ${maxPolls} polls`));
        return;
      }

      try {
        if (pollCount % 10 === 0) { // Log every 5 seconds (10 polls * 500ms)
          console.log(`[Embedding Service] Polling task ${taskId} (poll ${pollCount}/${maxPolls})`);
        }
        const status = await this.pollTaskStatus(taskId);
        
        if (status.status === 'completed' && status.result) {
          clearTimeout(timeout);
          this.pendingTasks.delete(taskId);
          console.log(`[Embedding Service] Task ${taskId} completed via polling`);
          resolve(status.result.embedding);
        } else if (status.status === 'failed') {
          clearTimeout(timeout);
          this.pendingTasks.delete(taskId);
          console.error(`[Embedding Service] Task ${taskId} failed: ${status.error}`);
          reject(new Error(status.error || 'Task failed'));
        } else {
          // Still processing, poll again
          if (pollCount % 10 === 0) {
            console.log(`[Embedding Service] Task ${taskId} status: ${status.status} (poll ${pollCount}/${maxPolls})`);
          }
          pollCount++;
          setTimeout(poll, pollInterval);
        }
      } catch (error: any) {
        if (pollCount % 10 === 0) {
          console.error(`[Embedding Service] Polling error for task ${taskId} (poll ${pollCount}): ${error.message}`);
        }
        // Continue polling on error (might be transient network issue)
        pollCount++;
        if (pollCount >= maxPolls) {
          clearTimeout(timeout);
          this.pendingTasks.delete(taskId);
          reject(new Error(`Polling failed: ${error.message}`));
        } else {
          setTimeout(poll, pollInterval);
        }
      }
    };

    poll();
  }

  /**
   * Generate embeddings for multiple chunks in batches
   */
  async generateEmbeddings(
    chunks: Array<{ id: string; content: string }>,
    progressCallback?: (progress: { current: number; total: number }) => void
  ): Promise<Map<string, number[]>> {
    const startTime = Date.now();
    const jobId = uuidv4(); // Generate unique job ID for this embedding session
    console.log(`[Embedding Service] generateEmbeddings called with ${chunks.length} chunks (jobId: ${jobId})`);
    
    // Emit job_started event so main process can connect WebSocket for monitoring
    this.emit('job_started', jobId);
    console.log(`[Embedding Service] Emitted job_started event for job ${jobId}`);
    
    const embeddings = new Map<string, number[]>();
    const totalChunks = chunks.length;
    let completedCount = 0;
    let jobMetrics: any = null; // Store job_metrics from final job status update

    eventLogger.info('Embedding Service', `Starting embedding generation for ${totalChunks} chunks via auto-batch endpoint (jobId: ${jobId})`);
    console.log(`[Embedding Service] Starting embedding generation for ${totalChunks} chunks via auto-batch endpoint (jobId: ${jobId})`);

    // Set up progress tracking
    if (progressCallback) {
      progressCallback({ current: 0, total: totalChunks });
    }

    // Submit all chunks at once to auto-batch endpoint
    let autoBatchResponse: { job_id: string; batch_ids: string[]; total_batches: number; tasks: Array<{ chunk_id: string; task_id: string; batch_id?: string }> } | null = null;
    let taskMap = new Map<string, { chunkId: string; batchId: string; batchIndex: number }>();
    
    try {
      console.log(`[Embedding Service] Submitting ${chunks.length} chunks to auto-batch endpoint...`);
      autoBatchResponse = await this.submitAutoBatch(
        chunks.map(chunk => ({ chunk_id: chunk.id, text: chunk.content })),
        jobId
      );
      
      console.log(`[Embedding Service] Auto-batch job created: ${autoBatchResponse.job_id} with ${autoBatchResponse.total_batches} batches`);
      eventLogger.info('Embedding Service', `Auto-batch job created: ${autoBatchResponse.job_id} with ${autoBatchResponse.total_batches} batches (${autoBatchResponse.batch_ids.length} batch IDs)`);
      
      // Build task map from the response if tasks are included
      if (autoBatchResponse) {
        if (autoBatchResponse.tasks && autoBatchResponse.tasks.length > 0) {
          const response = autoBatchResponse; // Local const for TypeScript narrowing
          response.tasks.forEach((task, index) => {
            // Find batch_id for this task
            const batchIndex = Math.floor(index / Math.ceil(totalChunks / (response.total_batches || 1)));
            const batchId = (response.batch_ids && response.batch_ids[batchIndex]) || task.batch_id || `batch-${batchIndex}`;
            
            taskMap.set(task.task_id, {
              chunkId: task.chunk_id,
              batchId,
              batchIndex,
            });
          });
          console.log(`[Embedding Service] Built task map with ${taskMap.size} tasks from auto-batch response`);
        } else {
          // If tasks weren't in the response, we'll build the map from job status updates
          console.log(`[Embedding Service] No tasks in auto-batch response, will build task map from job status updates`);
        }
      }
      
      console.log(`[Embedding Service] Job submitted, waiting for completion...`);
    } catch (error: any) {
      const errorMsg = `Auto-batch submission failed: ${error.message}`;
      console.error(`[Embedding Service] ${errorMsg}`);
      eventLogger.error('Embedding Service', errorMsg);
      console.error(`[Embedding Service] Falling back to manual batching...`);
      eventLogger.warning('Embedding Service', 'Falling back to manual batching');
      
      // Fallback to manual batching if auto-batch fails
      const batchSize = getEmbeddingBatchSize();
      const batches: Array<Array<{ id: string; content: string }>> = [];
      for (let i = 0; i < chunks.length; i += batchSize) {
        batches.push(chunks.slice(i, i + batchSize));
      }
      
      const batchPromises = batches.map(async (batch, batchIndex) => {
        try {
          const batchResponse = await this.submitBatch(
            batch.map(chunk => ({ chunk_id: chunk.id, text: chunk.content })),
            jobId
          );
          
          batchResponse.tasks.forEach((task: any) => {
            taskMap.set(task.task_id, {
              chunkId: task.chunk_id,
              batchId: batchResponse.batch_id,
              batchIndex,
            });
          });
          
          return { success: true };
        } catch (err: any) {
          console.error(`[Embedding Service] Fallback batch ${batchIndex + 1} failed: ${err.message}`);
          return { success: false, error: err.message };
        }
      });
      
      await Promise.all(batchPromises);
    }

    // Listen to job_status_update events from main process WebSocket (for collecting embeddings)
    // Main process WebSocket manager receives jobStatus updates and emits them via EventEmitter
    // This avoids duplicate WebSocket connections - we reuse the main process connection
    // Note: We monitor even if taskMap is empty initially - we'll build it from job status updates
    if (jobId) {
      console.log(`[Embedding Service] Listening to job_status_update events for job ${jobId} to collect embeddings`);
      
      const maxWaitTime = this.timeout * Math.max(1, Math.ceil(taskMap.size / 10));
      const startTime = Date.now();
      let isResolved = false;
      let timeoutId: NodeJS.Timeout | null = null;
      
      await new Promise<void>((resolve, reject) => {
        const handleJobStatusUpdate = (eventJobId: string, jobStatus: any) => {
          // Only process updates for this job
          if (eventJobId !== jobId || isResolved) {
            return;
          }
          
          console.log(`[Embedding Service] Received jobStatus update for job ${jobId}:`, JSON.stringify(jobStatus).substring(0, 200));
          
          // Build task map from job status if we don't have it yet (for auto-batch endpoint)
          if (taskMap.size === 0 && jobStatus.batches && Array.isArray(jobStatus.batches)) {
            jobStatus.batches.forEach((batch: any, batchIndex: number) => {
              if (batch.tasks && Array.isArray(batch.tasks)) {
                batch.tasks.forEach((task: any) => {
                  if (task.task_id || task.taskId) {
                    const taskId = task.task_id || task.taskId;
                    const chunkId = task.chunk_id || task.chunkId;
                    const batchId = batch.batch_id || batch.batchId || (autoBatchResponse ? autoBatchResponse.batch_ids[batchIndex] : undefined);
                    
                    if (chunkId) {
                      taskMap.set(taskId, {
                        chunkId,
                        batchId: batchId || `batch-${batchIndex}`,
                        batchIndex,
                      });
                    }
                  }
                });
              }
            });
            if (taskMap.size > 0) {
              console.log(`[Embedding Service] Built task map with ${taskMap.size} tasks from job status update`);
            }
          }
          
          // Extract embeddings from completed tasks in the job status
          if (jobStatus.batches && Array.isArray(jobStatus.batches)) {
            jobStatus.batches.forEach((batch: any) => {
              // Check batch_metrics if available for direct lookup
              if (jobStatus.batch_metrics && jobStatus.batch_metrics[batch.batch_id]) {
                const batchMetrics = jobStatus.batch_metrics[batch.batch_id];
                // If batch_metrics contains task results with embeddings
                if (batchMetrics.tasks && Array.isArray(batchMetrics.tasks)) {
                  batchMetrics.tasks.forEach((task: any) => {
                    if (task.status === 'completed' && task.result?.embedding && task.task_id) {
                      const taskInfo = taskMap.get(task.task_id);
                      if (taskInfo && !embeddings.has(taskInfo.chunkId)) {
                        embeddings.set(taskInfo.chunkId, task.result.embedding);
                        taskMap.delete(task.task_id);
                        completedCount++;
                        
                        if (progressCallback) {
                          progressCallback({ current: completedCount, total: totalChunks });
                        }
                        
                        console.log(`[Embedding Service] Task completed via WebSocket: ${taskInfo.chunkId} (${completedCount}/${totalChunks})`);
                      }
                    }
                  });
                }
              }
              
              // Also check batches array for task information
              if (batch.tasks && Array.isArray(batch.tasks)) {
                batch.tasks.forEach((task: any) => {
                  if (task.status === 'completed' && task.result?.embedding && task.task_id) {
                    const taskInfo = taskMap.get(task.task_id);
                    if (taskInfo && !embeddings.has(taskInfo.chunkId)) {
                      embeddings.set(taskInfo.chunkId, task.result.embedding);
                      taskMap.delete(task.task_id);
                      completedCount++;
                      
                      if (progressCallback) {
                        progressCallback({ current: completedCount, total: totalChunks });
                      }
                      
                      console.log(`[Embedding Service] Task completed via WebSocket: ${taskInfo.chunkId} (${completedCount}/${totalChunks})`);
                    }
                  }
                });
              }
            });
          }
          
          // Update progress based on completed_chunks if available
          if (jobStatus.completed_chunks !== undefined && progressCallback) {
            progressCallback({ current: jobStatus.completed_chunks, total: totalChunks });
          }
          
          // Store job_metrics when available (contains detailed execution metrics)
          if (jobStatus.status === 'completed' || jobStatus.status === 'failed') {
            // Extract job_metrics if available (it might be in the jobStatus object itself)
            jobMetrics = jobStatus;
            console.log(`[Embedding Service] Job ${jobId} ${jobStatus.status}, storing job_metrics:`, JSON.stringify(jobMetrics).substring(0, 300));
          }
          
          // Check if job is complete
          if (jobStatus.status === 'completed' || taskMap.size === 0) {
            console.log(`[Embedding Service] Job ${jobId} completed via WebSocket: ${completedCount}/${totalChunks} chunks`);
            isResolved = true;
            if (timeoutId) clearTimeout(timeoutId);
            this.off('job_status_update', handleJobStatusUpdate);
            resolve();
          } else if (jobStatus.status === 'failed') {
            console.error(`[Embedding Service] Job ${jobId} failed`);
            isResolved = true;
            if (timeoutId) clearTimeout(timeoutId);
            this.off('job_status_update', handleJobStatusUpdate);
            reject(new Error(`Job ${jobId} failed`));
          }
        };
        
        // Listen to job_status_update events from main process WebSocket manager
        this.on('job_status_update', handleJobStatusUpdate);
        
        // Timeout if job doesn't complete within reasonable time
        timeoutId = setTimeout(() => {
          if (!isResolved && taskMap.size > 0) {
            const elapsed = Date.now() - startTime;
            console.error(`[Embedding Service] Job ${jobId} embedding collection timeout after ${elapsed}ms`);
            isResolved = true;
            this.off('job_status_update', handleJobStatusUpdate);
            reject(new Error(`Job embedding collection timeout after ${elapsed}ms`));
          }
        }, maxWaitTime);
      }).catch((error: any) => {
        // Cleanup listener on error
        if (!isResolved) {
          isResolved = true;
          if (timeoutId) clearTimeout(timeoutId);
          // Note: We can't remove the listener here because we don't have the handler reference
          // But it's okay - the handler checks isResolved flag
        }
        console.error(`[Embedding Service] Failed to collect embeddings via WebSocket: ${error.message}`);
        eventLogger.error('Embedding Service', `Failed to collect embeddings for job ${jobId}: ${error.message}`);
        // Continue even if collection fails - embeddings map will be partial
      });
    }

    // Use job_metrics if available, otherwise calculate from local data
    const totalBatches = jobMetrics?.total_batches || 
      autoBatchResponse?.total_batches || 
      (chunks.length > 0 ? Math.ceil(chunks.length / getEmbeddingBatchSize()) : 0);
    
    const successCount = jobMetrics?.completed_chunks || embeddings.size;
    const failedCount = jobMetrics?.failed_chunks || 0;
    const successRate = jobMetrics?.success_rate 
      ? (jobMetrics.success_rate * 100).toFixed(2)
      : ((successCount / totalChunks) * 100).toFixed(2);
    
    // Use metrics from job_metrics if available, otherwise use calculated values
    const executionTimeSec = jobMetrics?.execution_time_sec || 
      ((Date.now() - startTime) / 1000);
    const durationMs = jobMetrics?.duration_ms || (Date.now() - startTime);
    const throughput = jobMetrics?.overall_throughput_chunks_per_sec || 
      (executionTimeSec > 0 ? (successCount / executionTimeSec).toFixed(2) : '0');
    const avgBatchTime = jobMetrics?.avg_batch_execution_time_sec || null;
    
    // Build comprehensive summary using job_metrics if available
    let summaryMessage = `Generated ${successCount}/${totalChunks} embeddings`;
    if (failedCount > 0) {
      summaryMessage += ` (${failedCount} failed)`;
    }
    summaryMessage += ` | Success rate: ${successRate}%`;
    summaryMessage += ` | ${totalBatches} batches`;
    
    if (jobMetrics?.avg_batch_size) {
      summaryMessage += ` | Avg batch size: ${jobMetrics.avg_batch_size.toFixed(1)}`;
    }
    
    summaryMessage += ` | Execution time: ${executionTimeSec.toFixed(2)}s`;
    
    if (throughput && throughput !== '0') {
      summaryMessage += ` | Throughput: ${throughput} chunks/sec`;
    }
    
    if (avgBatchTime) {
      summaryMessage += ` | Avg batch time: ${avgBatchTime.toFixed(2)}s`;
    }
    
    eventLogger.success('Embedding Service', summaryMessage);
    console.log(`[Embedding Service] ${summaryMessage}`);
    
    // Log detailed metrics if available
    if (jobMetrics) {
      const metricsDetail = [
        `Job ID: ${jobId}`,
        `Status: ${jobMetrics.status || 'completed'}`,
        `Duration: ${(durationMs / 1000).toFixed(2)}s`,
        `Chunks: ${successCount} completed, ${failedCount} failed, ${jobMetrics.pending_chunks || 0} pending`,
        `Batches: ${jobMetrics.completed_batches || 0}/${totalBatches} completed, ${jobMetrics.failed_batches || 0} failed`,
        `Performance: ${throughput} chunks/sec throughput`,
        `Batch times: min ${jobMetrics.min_batch_execution_time_sec?.toFixed(2) || 'N/A'}s, ` +
        `max ${jobMetrics.max_batch_execution_time_sec?.toFixed(2) || 'N/A'}s, ` +
        `avg ${avgBatchTime?.toFixed(2) || 'N/A'}s`,
      ].join(' | ');
      
      console.log(`[Embedding Service] Detailed Job Metrics: ${metricsDetail}`);
      eventLogger.info('Embedding Service', `Job Metrics: ${metricsDetail}`);
    }
    
    // Send detailed summary via progress event (include jobId and metrics)
    eventLogger.progress('Embedding Service', 
      `Completed: ${successCount}/${totalChunks} chunks | ${totalBatches} batches | ` +
      `${executionTimeSec.toFixed(1)}s total | ${throughput} chunks/sec | jobId: ${jobId}`,
      100, 100
    );
    
    // Emit job completion event with full metrics
    this.emit('job_complete', jobId, {
      job_id: jobId,
      totalChunks: jobMetrics?.total_chunks || totalChunks,
      completed_chunks: successCount,
      failed_chunks: failedCount,
      pending_chunks: jobMetrics?.pending_chunks || 0,
      totalBatches,
      completed_batches: jobMetrics?.completed_batches || 0,
      failed_batches: jobMetrics?.failed_batches || 0,
      successCount,
      successRate: parseFloat(successRate),
      totalTime: durationMs,
      execution_time_sec: executionTimeSec,
      overall_throughput_chunks_per_sec: parseFloat(throughput),
      avg_batch_execution_time_sec: avgBatchTime,
      min_batch_execution_time_sec: jobMetrics?.min_batch_execution_time_sec,
      max_batch_execution_time_sec: jobMetrics?.max_batch_execution_time_sec,
      avg_batch_size: jobMetrics?.avg_batch_size,
      min_batch_size: jobMetrics?.min_batch_size,
      max_batch_size: jobMetrics?.max_batch_size,
      job_metrics: jobMetrics, // Include full job_metrics object
    });
    
    if (progressCallback) {
      progressCallback({ current: totalChunks, total: totalChunks });
    }

    return embeddings;
  }

  /**
   * Get job statistics from Python service
   */
  async getJobStats(jobId: string): Promise<any> {
    const fullUrl = `${this.baseUrl}/api/embeddings/job/${jobId}`;
    eventLogger.debug('Embedding Service', `Fetching job stats for ${jobId} from ${fullUrl}`);
    
    return new Promise((resolve, reject) => {
      try {
        const urlObj = new URL(fullUrl);
        const options = {
          hostname: urlObj.hostname,
          port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
          path: urlObj.pathname + (urlObj.search || ''),
          method: 'GET',
          headers: {
            ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` }),
          },
          timeout: 5000,
        };

        const client = urlObj.protocol === 'https:' ? https : http;
        const req = client.request(options, (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            if (res.statusCode === 200) {
              try {
                const jobStats = JSON.parse(data);
                eventLogger.debug('Embedding Service', `Job stats retrieved for ${jobId}`);
                resolve(jobStats);
              } catch (error: any) {
                eventLogger.error('Embedding Service', `Failed to parse job stats response: ${error.message}`);
                reject(new Error(`Failed to parse response: ${error.message}`));
              }
            } else {
              eventLogger.error('Embedding Service', `Job stats HTTP ${res.statusCode}: ${data}`);
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            }
          });
        });

        req.on('error', (error) => {
          eventLogger.error('Embedding Service', `Job stats request error: ${error.message}`);
          reject(error);
        });

        req.on('timeout', () => {
          req.destroy();
          eventLogger.error('Embedding Service', 'Job stats request timeout');
          reject(new Error('Request timeout'));
        });

        req.end();
      } catch (error: any) {
        eventLogger.error('Embedding Service', `Failed to create job stats request: ${error.message}`);
        reject(error);
      }
    });
  }

  /**
   * Check if service is available
   * Throttled to prevent overwhelming the server during job processing
   */
  async healthCheck(): Promise<boolean> {
    const now = Date.now();
    
    // Throttle health checks - don't check more than once per cooldown period
    if (now - this.lastHealthCheck < this.healthCheckCooldown) {
      const timeSinceLastCheck = now - this.lastHealthCheck;
      const timeUntilNextCheck = this.healthCheckCooldown - timeSinceLastCheck;
      console.log(`[Embedding Service] Health check throttled. Last check was ${timeSinceLastCheck}ms ago. Next check in ${timeUntilNextCheck}ms`);
      // Return cached result if available, otherwise return true optimistically
      return true; // Optimistic: assume service is still available if we checked recently
    }
    
    // Prevent concurrent health checks
    if (this.healthCheckInProgress) {
      console.log(`[Embedding Service] Health check already in progress, skipping duplicate request`);
      return true; // Optimistic: assume service is available if check is in progress
    }
    
    this.healthCheckInProgress = true;
    this.lastHealthCheck = now;
    
    try {
      const fullUrl = `${this.baseUrl}/health`;
      console.log(`[Embedding Service] Health check: ${fullUrl}`);
      eventLogger.debug('Embedding Service', `Health check: ${fullUrl}`);
      const urlObj = new URL(fullUrl);
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname + (urlObj.search || ''),
        method: 'GET',
        timeout: 10000, // Increased timeout to 10 seconds to handle server load
      };

      return new Promise((resolve) => {
        const client = urlObj.protocol === 'https:' ? https : http;
        const req = client.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk.toString(); });
          res.on('end', () => {
            this.healthCheckInProgress = false;
            const isHealthy = res.statusCode === 200;
            if (isHealthy) {
              console.log(`[Embedding Service] Health check response: ${res.statusCode} (healthy)`);
            } else {
              console.warn(`[Embedding Service] Health check response: ${res.statusCode} (unhealthy), body: ${data}`);
            }
            eventLogger.debug('Embedding Service', `Health check response: ${res.statusCode} (${isHealthy ? 'healthy' : 'unhealthy'})`);
            resolve(isHealthy);
          });
        });

        req.on('error', (error) => {
          this.healthCheckInProgress = false;
          // Don't log every error during job processing - only log if it's been a while since last successful check
          const timeSinceLastCheck = Date.now() - this.lastHealthCheck;
          if (timeSinceLastCheck > this.healthCheckCooldown * 2) {
            console.error(`[Embedding Service] Health check error: ${error.message}`);
            eventLogger.warning('Embedding Service', `Health check error: ${error.message}`);
          } else {
            // During active job processing, errors are expected due to server load
            console.debug(`[Embedding Service] Health check error (during job processing): ${error.message}`);
          }
          resolve(false);
        });

        req.on('timeout', () => {
          this.healthCheckInProgress = false;
          // Don't log every timeout during job processing
          const timeSinceLastCheck = Date.now() - this.lastHealthCheck;
          if (timeSinceLastCheck > this.healthCheckCooldown * 2) {
            console.warn(`[Embedding Service] Health check timeout`);
            eventLogger.warning('Embedding Service', 'Health check timeout');
          } else {
            console.debug(`[Embedding Service] Health check timeout (server may be busy processing job)`);
          }
          req.destroy();
          resolve(false);
        });

        req.end();
      });
    } catch (error: any) {
      this.healthCheckInProgress = false;
      console.error(`[Embedding Service] Health check exception: ${error.message}`);
      eventLogger.error('Embedding Service', `Health check failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Disconnect and cleanup
   */
  disconnect(): void {
    if (this.socket) {
      (this.socket as any).close();
      this.socket = undefined;
    }
    this.pendingTasks.clear();
    eventLogger.info('Embedding Service', 'Disconnected and cleaned up');
  }
}

// Singleton instance
let embeddingService: EmbeddingService | null = null;

export function getEmbeddingService(config?: EmbeddingServiceConfig): EmbeddingService {
  if (!embeddingService) {
    embeddingService = new EmbeddingService(config);
  }
  return embeddingService;
}

export function shutdownEmbeddingService(): void {
  if (embeddingService) {
    embeddingService.disconnect();
    embeddingService = null;
  }
}

