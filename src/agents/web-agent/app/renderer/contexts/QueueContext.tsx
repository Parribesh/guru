/**
 * Queue Context - Centralized state management for embedding service queue
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

export interface QueueStatus {
  // Queue metrics (from API contract)
  size?: number;
  maxsize?: number | 'unlimited';
  usage_percent?: number;
  state?: 'healthy' | 'warning' | 'critical' | 'full' | 'unknown';
  total_submitted?: number;
  total_processed?: number;
  available_slots?: number | 'unlimited';
  last_updated?: number;
  
  // Worker information
  num_workers?: number;
  total_workers?: number;
  working_workers?: number;
  idle_workers?: number;
  stopped_workers?: number;
  workers?: Array<{ worker_id: string; state: 'init' | 'idle' | 'working' | 'stopped'; [key: string]: any }>;
  worker_metrics?: Array<{
    worker_id: string;
    state: string;
    total_batches_processed?: number;
    total_tasks_processed?: number;
    [key: string]: any;
  }>;
  total_batches_processed?: number;
  total_tasks_processed?: number;
  queue_type?: string;
  
  // Legacy fields for backward compatibility
  queue_size?: number;
  queue_maxsize?: number | 'unlimited';
  queue_usage_percent?: number;
  active_workers?: number;
  processing?: number;
  completed?: number;
  failed?: number;
  pending?: number;
  worker_batch_size?: number;
  total?: number;
  [key: string]: any; // Allow additional properties from the API
}

export interface QueueMetrics {
  // Metrics only (no worker info)
  size?: number;
  maxsize?: number | 'unlimited';
  usage_percent?: number;
  state?: 'healthy' | 'warning' | 'critical' | 'full' | 'unknown';
  total_submitted?: number;
  total_processed?: number;
  available_slots?: number | 'unlimited';
  last_updated?: number;
  
  // Legacy fields
  usage?: number;
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

interface QueueContextType {
  status: QueueStatus | null;
  metrics: QueueMetrics | null;
  isConnected: boolean;
  lastUpdate: number | null;
  refresh: () => Promise<void>;
}

const QueueContext = createContext<QueueContextType | undefined>(undefined);

export function QueueProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<QueueStatus | null>(null);
  const [metrics, setMetrics] = useState<QueueMetrics | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);

  const fetchQueueStatus = useCallback(async () => {
    try {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI) {
        console.warn('[QueueContext] electronAPI not available');
        return;
      }

      // Use queue API if available, otherwise fallback to generic invoke
      let statusPromise: Promise<any>;
      let metricsPromise: Promise<any>;

      if (electronAPI.queue?.getStatus && electronAPI.queue?.getMetrics) {
        console.log('[QueueContext] Using queue API methods');
        statusPromise = electronAPI.queue.getStatus();
        metricsPromise = electronAPI.queue.getMetrics();
      } else if (electronAPI.invoke) {
        console.log('[QueueContext] Using generic invoke method');
        statusPromise = electronAPI.invoke('queue:status');
        metricsPromise = electronAPI.invoke('queue:metrics');
      } else {
        console.warn('[QueueContext] No queue API or invoke method available');
        return;
      }

      console.log('[QueueContext] Fetching queue status and metrics...');

      // Fetch both status and metrics in parallel
      const [statusResult, metricsResult] = await Promise.all([
        statusPromise.catch((err: any) => {
          console.error('[QueueContext] Error fetching queue status:', err);
          return { success: false, error: err?.message || 'Unknown error' };
        }),
        metricsPromise.catch((err: any) => {
          console.error('[QueueContext] Error fetching queue metrics:', err);
          return { success: false, error: err?.message || 'Unknown error' };
        }),
      ]);

      console.log('[QueueContext] Results - status:', statusResult?.success, 'metrics:', metricsResult?.success);

      // Update connection status based on request results
      const hasSuccess = statusResult?.success || metricsResult?.success;
      setIsConnected(hasSuccess);

      if (statusResult?.success && statusResult?.data) {
        setStatus(statusResult.data);
      } else if (statusResult?.error) {
        console.error('[QueueContext] Queue status error:', statusResult.error);
        // Don't clear status if we have previous data - keep showing it
      }

      if (metricsResult?.success && metricsResult?.data) {
        setMetrics(metricsResult.data);
      } else if (metricsResult?.error) {
        console.error('[QueueContext] Queue metrics error:', metricsResult.error);
        // Don't clear metrics if we have previous data - keep showing it
      }

      setLastUpdate(Date.now());
      
      // Log connection status for debugging
      if (!hasSuccess) {
        console.warn('[QueueContext] Queue API requests failed - status:', statusResult?.success, 'metrics:', metricsResult?.success);
      }
    } catch (error) {
      console.error('[QueueContext] Error fetching queue status:', error);
      setIsConnected(false);
    }
  }, [isConnected]);

  useEffect(() => {
    const electronAPI = (window as any).electronAPI;
    
    if (!electronAPI?.on) {
      console.error('[QueueContext] electronAPI.on not available');
      return;
    }

    const handleEvent = (eventData: any) => {
      // Handle connection status
      if (eventData.type === 'websocket_connected' || eventData.type === 'connected') {
        setIsConnected(true);
      } else if (eventData.type === 'websocket_closed' || eventData.type === 'disconnected') {
        setIsConnected(false);
      }
      
      // Handle queue state updates from WebSocket
      // New contract: job_status_update events contain payload.queue
      // Legacy: queue_state_update events still supported
      if (eventData.type === 'queue_state_update' && eventData.payload) {
        console.log('[QueueContext] Received queue_state_update from WebSocket');
        const queueData = eventData.payload;
        
        // Update metrics from WebSocket event
        // WebSocket payload has: size, maxsize, usage_percent, state, total_submitted, 
        // total_processed, available_slots, last_updated
        setMetrics({
          size: queueData.size,
          maxsize: queueData.maxsize,
          usage_percent: queueData.usage_percent,
          state: queueData.state,
          total_submitted: queueData.total_submitted,
          total_processed: queueData.total_processed,
          available_slots: queueData.available_slots,
          last_updated: queueData.last_updated,
        });
        
        // Also update status with queue metrics (so they're available in status too)
        setStatus((prevStatus) => ({
          ...prevStatus,
          size: queueData.size,
          maxsize: queueData.maxsize,
          usage_percent: queueData.usage_percent,
          state: queueData.state,
          total_submitted: queueData.total_submitted,
          total_processed: queueData.total_processed,
          available_slots: queueData.available_slots,
          last_updated: queueData.last_updated,
        }));
        
        setIsConnected(true);
        setLastUpdate(queueData.last_updated || Date.now());
      }
      
      // Handle queue state from new job_status_update contract
      // New contract: { type: 'job_status_update', payload: { job: {...}, queue: {...}, workers: {...} } }
      if (eventData.type === 'job_status_update' && eventData.payload?.queue) {
        console.log('[QueueContext] Received queue state from job_status_update event');
        const queueData = eventData.payload.queue;
        
        // Update metrics from queue state
        setMetrics({
          size: queueData.size,
          maxsize: queueData.maxsize,
          usage_percent: queueData.usage_percent,
          state: queueData.state,
          total_submitted: queueData.total_submitted,
          total_processed: queueData.total_processed,
          available_slots: queueData.available_slots,
          last_updated: queueData.last_updated || Date.now(),
        });
        
        // Also update status with queue metrics
        setStatus((prevStatus) => ({
          ...prevStatus,
          size: queueData.size,
          maxsize: queueData.maxsize,
          usage_percent: queueData.usage_percent,
          state: queueData.state,
          total_submitted: queueData.total_submitted,
          total_processed: queueData.total_processed,
          available_slots: queueData.available_slots,
          last_updated: queueData.last_updated || Date.now(),
        }));
        
        setIsConnected(true);
        setLastUpdate(queueData.last_updated || Date.now());
      }
      
      // Handle worker state updates from worker service
      // This event is broadcast when worker service starts and includes all worker information
      // Also sent when worker states change during execution
      // Legacy: worker_state_update events still supported
      if (eventData.type === 'worker_state_update' && eventData.payload) {
        console.log('[QueueContext] Received worker_state_update from WebSocket', {
          total_workers: eventData.payload.total_workers,
          working_workers: eventData.payload.working_workers,
          idle_workers: eventData.payload.idle_workers,
          workers_count: eventData.payload.workers?.length,
        });
        const workerData = eventData.payload;
        
        // Update status with worker information
        // worker_state_update payload has: total_workers, working_workers, idle_workers,
        // stopped_workers, total_batches_processed, total_tasks_processed, workers array, worker_metrics array
        setStatus((prevStatus) => ({
          ...prevStatus,
          // Worker counts
          num_workers: workerData.total_workers ?? workerData.num_workers ?? prevStatus?.num_workers,
          total_workers: workerData.total_workers ?? prevStatus?.total_workers,
          working_workers: workerData.working_workers ?? prevStatus?.working_workers,
          idle_workers: workerData.idle_workers ?? prevStatus?.idle_workers,
          stopped_workers: workerData.stopped_workers ?? prevStatus?.stopped_workers,
          // Worker arrays
          workers: workerData.workers ?? prevStatus?.workers,
          worker_metrics: workerData.worker_metrics ?? prevStatus?.worker_metrics,
          // Worker totals
          total_batches_processed: workerData.total_batches_processed ?? prevStatus?.total_batches_processed,
          total_tasks_processed: workerData.total_tasks_processed ?? prevStatus?.total_tasks_processed,
          // Preserve existing queue metrics from metrics state or previous status
          size: prevStatus?.size ?? prevStatus?.queue_size,
          maxsize: prevStatus?.maxsize ?? prevStatus?.queue_maxsize,
          usage_percent: prevStatus?.usage_percent ?? prevStatus?.queue_usage_percent,
          state: prevStatus?.state,
          total_submitted: prevStatus?.total_submitted,
          total_processed: prevStatus?.total_processed,
          available_slots: prevStatus?.available_slots,
          last_updated: prevStatus?.last_updated,
        }));
        
        setIsConnected(true);
        setLastUpdate(Date.now());
      }
      
      // Handle worker state from new job_status_update contract
      // New contract: { type: 'job_status_update', payload: { job: {...}, queue: {...}, workers: {...} } }
      if (eventData.type === 'job_status_update' && eventData.payload?.workers) {
        console.log('[QueueContext] Received worker state from job_status_update event', {
          total_workers: eventData.payload.workers.total_workers,
          working_workers: eventData.payload.workers.working_workers,
          idle_workers: eventData.payload.workers.idle_workers,
          workers_count: eventData.payload.workers.workers?.length,
        });
        const workerData = eventData.payload.workers;
        
        // Update status with worker information from new contract
        setStatus((prevStatus) => ({
          ...prevStatus,
          // Worker counts
          num_workers: workerData.total_workers ?? workerData.num_workers ?? prevStatus?.num_workers,
          total_workers: workerData.total_workers ?? prevStatus?.total_workers,
          working_workers: workerData.working_workers ?? prevStatus?.working_workers,
          idle_workers: workerData.idle_workers ?? prevStatus?.idle_workers,
          stopped_workers: workerData.stopped_workers ?? prevStatus?.stopped_workers,
          // Worker arrays
          workers: workerData.workers ?? prevStatus?.workers,
          worker_metrics: workerData.worker_metrics ?? prevStatus?.worker_metrics,
          // Worker totals
          total_batches_processed: workerData.total_batches_processed ?? prevStatus?.total_batches_processed,
          total_tasks_processed: workerData.total_tasks_processed ?? prevStatus?.total_tasks_processed,
          // Preserve existing queue metrics from metrics state or previous status
          size: prevStatus?.size ?? prevStatus?.queue_size,
          maxsize: prevStatus?.maxsize ?? prevStatus?.queue_maxsize,
          usage_percent: prevStatus?.usage_percent ?? prevStatus?.queue_usage_percent,
          state: prevStatus?.state,
          total_submitted: prevStatus?.total_submitted,
          total_processed: prevStatus?.total_processed,
          available_slots: prevStatus?.available_slots,
          last_updated: prevStatus?.last_updated,
        }));
        
        setIsConnected(true);
        setLastUpdate(Date.now());
      }
      
      // Handle individual worker updates
      if (eventData.type === 'individual_worker_update' && eventData.payload) {
        console.log('[QueueContext] Received individual_worker_update from WebSocket');
        const workerUpdate = eventData.payload;
        
        // Update specific worker in the workers array
        setStatus((prevStatus) => {
          if (!prevStatus?.workers || !Array.isArray(prevStatus.workers)) {
            return prevStatus;
          }
          
          const workers = [...prevStatus.workers];
          const workerIndex = workers.findIndex(
            (w: any) => w.worker_id === workerUpdate.worker_id
          );
          
          if (workerIndex >= 0) {
            // Update existing worker
            workers[workerIndex] = {
              ...workers[workerIndex],
              ...workerUpdate,
            };
          } else {
            // Add new worker
            workers.push(workerUpdate);
          }
          
          // Recalculate working/idle counts
          const working_workers = workers.filter(
            (w: any) => w.state === 'working' || w.state === 'processing'
          ).length;
          const idle_workers = workers.filter(
            (w: any) => w.state === 'idle' || w.state === 'ready'
          ).length;
          
          return {
            ...prevStatus,
            workers,
            working_workers,
            idle_workers,
            num_workers: workers.length,
          };
        });
        
        setLastUpdate(Date.now());
      }
      
      // Legacy: Handle job events that may contain worker information (backward compatibility)
      // This is for old event structures that don't follow the new contract
      // New contract events are handled above with payload.queue and payload.workers
      if (eventData.type === 'job_status_update' && !eventData.payload?.queue && !eventData.payload?.workers) {
        // Extract worker info from multiple possible locations (legacy format)
        const jobStatus = eventData.jobStatus || eventData.payload?.status || eventData.payload || {};
        const payload = eventData.payload || {};
        
        // Check all possible locations for worker info
        const hasWorkerInfo = 
          jobStatus.workers || jobStatus.num_workers || jobStatus.working_workers || jobStatus.idle_workers ||
          payload.workers || payload.num_workers || payload.working_workers || payload.idle_workers ||
          jobStatus.active_workers || payload.active_workers;
        
        if (hasWorkerInfo) {
          console.log('[QueueContext] Received worker info from legacy job_status_update event', {
            num_workers: jobStatus.num_workers ?? payload.num_workers,
            working_workers: jobStatus.working_workers ?? payload.working_workers,
            hasJobStatus: !!eventData.jobStatus,
            hasPayload: !!eventData.payload,
          });
          
          // Update status with worker information
          setStatus((prevStatus) => {
            const updated: QueueStatus = {
              // Preserve existing queue metrics from metrics state or previous status
              size: prevStatus?.size ?? prevStatus?.queue_size,
              maxsize: prevStatus?.maxsize ?? prevStatus?.queue_maxsize,
              usage_percent: prevStatus?.usage_percent ?? prevStatus?.queue_usage_percent,
              state: prevStatus?.state,
              total_submitted: prevStatus?.total_submitted,
              total_processed: prevStatus?.total_processed,
              available_slots: prevStatus?.available_slots,
              last_updated: prevStatus?.last_updated,
              
              // Update worker fields from job event (check all possible locations)
              num_workers: jobStatus.num_workers ?? payload.num_workers ?? prevStatus?.num_workers,
              working_workers: jobStatus.working_workers ?? payload.working_workers ?? 
                               jobStatus.active_workers ?? payload.active_workers ?? 
                               prevStatus?.working_workers,
              idle_workers: jobStatus.idle_workers ?? payload.idle_workers ?? prevStatus?.idle_workers,
              workers: jobStatus.workers ?? payload.workers ?? prevStatus?.workers,
            };
            
            return updated;
          });
          
          setLastUpdate(Date.now());
        }
      }

      // Update last update time on any event
      setLastUpdate(Date.now());
    };

    electronAPI.on('embedding-service:event', handleEvent);

    // Initial fetch via HTTP (to get baseline queue status and worker info)
    // After that, rely on WebSocket events for real-time updates:
    // - queue_state_update events provide queue metrics
    // - job_status_update events provide worker information
    fetchQueueStatus();

    // Poll for queue status every 60 seconds as fallback/refresh
    // Primary updates come from WebSocket events (queue_state_update + job_status_update)
    const interval = setInterval(() => {
      fetchQueueStatus();
    }, 60000);

    return () => {
      if (electronAPI?.off) {
        electronAPI.off('embedding-service:event', handleEvent);
      }
      clearInterval(interval);
    };
  }, [fetchQueueStatus]);

  const value: QueueContextType = {
    status,
    metrics,
    isConnected,
    lastUpdate,
    refresh: fetchQueueStatus,
  };

  return <QueueContext.Provider value={value}>{children}</QueueContext.Provider>;
}

export function useQueue() {
  const context = useContext(QueueContext);
  if (context === undefined) {
    throw new Error('useQueue must be used within a QueueProvider');
  }
  return context;
}

