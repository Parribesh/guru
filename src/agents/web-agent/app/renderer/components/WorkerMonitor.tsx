/**
 * Worker Monitor Component
 * Monitors worker state from job_status_update events
 * Listens to payload.workers from the new job service contract
 */

import React, { useState, useEffect, useRef } from 'react';
import { useMonitoring } from '../hooks/useMonitoring';

interface Worker {
  worker_id: string;
  state: 'init' | 'idle' | 'working' | 'stopped';
  task_id?: string;
  batch_id?: string;
  [key: string]: any;
}

interface WorkerMetrics {
  worker_id: string;
  state: string;
  total_batches_processed?: number;
  total_tasks_processed?: number;
  [key: string]: any;
}

interface WorkersState {
  total_workers?: number;
  working_workers?: number;
  idle_workers?: number;
  stopped_workers?: number;
  total_batches_processed?: number;
  total_tasks_processed?: number;
  workers?: Worker[];
  worker_metrics?: WorkerMetrics[];
  lastUpdate?: number;
}

interface WorkerMonitorState {
  workersState: WorkersState | null;
  updates: Array<{
    id: string;
    timestamp: number;
    state: WorkersState;
  }>;
}

const initialState: WorkerMonitorState = {
  workersState: null,
  updates: [],
};

let updateIdCounter = 0;

export const WorkerMonitor: React.FC = () => {
  const { state, monitoringState, reset } = useMonitoring<WorkerMonitorState>(
    'embedding-service:event',
    {
      // Handle job_status_update events with workers state
      // New contract: { type: 'job_status_update', payload: { job: {...}, queue: {...}, workers: {...} } }
      job_status_update: (prevState, event) => {
        const payload = event.payload || event;
        
        // Extract workers state from payload.workers (new contract)
        const workersData = payload.workers;
        
        if (!workersData) {
          // Legacy: try to extract from other locations for backward compatibility
          const legacyWorkers = payload.workers || payload.worker_state;
          if (!legacyWorkers) {
            return prevState;
          }
          // Use legacy format
          const workersState: WorkersState = {
            total_workers: legacyWorkers.total_workers ?? legacyWorkers.num_workers,
            working_workers: legacyWorkers.working_workers ?? legacyWorkers.active_workers,
            idle_workers: legacyWorkers.idle_workers,
            stopped_workers: legacyWorkers.stopped_workers,
            total_batches_processed: legacyWorkers.total_batches_processed,
            total_tasks_processed: legacyWorkers.total_tasks_processed,
            workers: legacyWorkers.workers,
            worker_metrics: legacyWorkers.worker_metrics,
            lastUpdate: Date.now(),
          };
          
          const update = {
            id: `update-${++updateIdCounter}`,
            timestamp: event.timestamp || Date.now(),
            state: workersState,
          };
          
          return {
            workersState,
            updates: [update, ...prevState.updates].slice(0, 100),
          };
        }
        
        // New contract format
        const workersState: WorkersState = {
          total_workers: workersData.total_workers,
          working_workers: workersData.working_workers,
          idle_workers: workersData.idle_workers,
          stopped_workers: workersData.stopped_workers,
          total_batches_processed: workersData.total_batches_processed,
          total_tasks_processed: workersData.total_tasks_processed,
          workers: workersData.workers,
          worker_metrics: workersData.worker_metrics,
          lastUpdate: Date.now(),
        };
        
        const update = {
          id: `update-${++updateIdCounter}`,
          timestamp: event.timestamp || Date.now(),
          state: workersState,
        };
        
        return {
          workersState,
          updates: [update, ...prevState.updates].slice(0, 100),
        };
      },
      
      // Handle worker_state_update events (legacy support)
      worker_state_update: (prevState, event) => {
        const workerData = event.payload || event;
        
        const workersState: WorkersState = {
          total_workers: workerData.total_workers ?? workerData.num_workers,
          working_workers: workerData.working_workers,
          idle_workers: workerData.idle_workers,
          stopped_workers: workerData.stopped_workers,
          total_batches_processed: workerData.total_batches_processed,
          total_tasks_processed: workerData.total_tasks_processed,
          workers: workerData.workers,
          worker_metrics: workerData.worker_metrics,
          lastUpdate: Date.now(),
        };
        
        const update = {
          id: `update-${++updateIdCounter}`,
          timestamp: event.timestamp || Date.now(),
          state: workersState,
        };
        
        return {
          workersState,
          updates: [update, ...prevState.updates].slice(0, 100),
        };
      },
    },
    initialState
  );

  const workersState = state.workersState;

  const getWorkerStateColor = (state: string): string => {
    switch (state) {
      case 'idle':
      case 'ready':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'working':
      case 'processing':
      case 'busy':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'stopped':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'init':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 p-4 bg-gray-50">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">Worker Monitor</h2>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${monitoringState.isConnected ? 'bg-green-500' : 'bg-gray-400'}`} />
              <span className="text-sm text-gray-600">
                {monitoringState.isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            {monitoringState.lastUpdate && (
              <span className="text-xs text-gray-500">
                Last update: {new Date(monitoringState.lastUpdate).toLocaleTimeString()}
              </span>
            )}
            {monitoringState.error && (
              <span className="text-xs text-red-600" title={monitoringState.error}>
                ⚠ Error
              </span>
            )}
            <button
              onClick={reset}
              className="px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm"
            >
              Clear
            </button>
          </div>
        </div>
        {/* Summary */}
        {workersState && (
          <div className="mt-2 flex items-center gap-4 text-sm">
            <span className="text-gray-600">
              Total: <span className="font-semibold">{workersState.total_workers ?? 0}</span>
            </span>
            {workersState.working_workers !== undefined && workersState.working_workers > 0 && (
              <span className="text-yellow-600">
                Working: <span className="font-semibold">{workersState.working_workers}</span>
              </span>
            )}
            {workersState.idle_workers !== undefined && workersState.idle_workers > 0 && (
              <span className="text-green-600">
                Idle: <span className="font-semibold">{workersState.idle_workers}</span>
              </span>
            )}
            {workersState.stopped_workers !== undefined && workersState.stopped_workers > 0 && (
              <span className="text-red-600">
                Stopped: <span className="font-semibold">{workersState.stopped_workers}</span>
              </span>
            )}
            {workersState.total_batches_processed !== undefined && (
              <span className="text-blue-600">
                Batches Processed: <span className="font-semibold">{workersState.total_batches_processed}</span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {!workersState ? (
          <div className="text-center py-12 text-gray-500">
            <div className="text-lg mb-2">No worker data available</div>
            <div className="text-sm">Workers will appear here when job_status_update events are received</div>
            {!monitoringState.isConnected && (
              <div className="text-xs text-yellow-600 mt-2">
                Waiting for connection...
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="border rounded-lg p-4 bg-blue-50 border-blue-200">
                <div className="text-sm text-blue-600 font-medium mb-1">Total Workers</div>
                <div className="text-2xl font-bold text-blue-900">
                  {workersState.total_workers ?? 0}
                </div>
              </div>
              
              <div className="border rounded-lg p-4 bg-yellow-50 border-yellow-200">
                <div className="text-sm text-yellow-600 font-medium mb-1">Working</div>
                <div className="text-2xl font-bold text-yellow-900">
                  {workersState.working_workers ?? 0}
                </div>
              </div>
              
              <div className="border rounded-lg p-4 bg-green-50 border-green-200">
                <div className="text-sm text-green-600 font-medium mb-1">Idle</div>
                <div className="text-2xl font-bold text-green-900">
                  {workersState.idle_workers ?? 0}
                </div>
              </div>
              
              <div className="border rounded-lg p-4 bg-purple-50 border-purple-200">
                <div className="text-sm text-purple-600 font-medium mb-1">Batches Processed</div>
                <div className="text-2xl font-bold text-purple-900">
                  {workersState.total_batches_processed ?? 0}
                </div>
              </div>
            </div>

            {/* Workers List */}
            {Array.isArray(workersState.workers) && workersState.workers.length > 0 ? (
              <div className="border rounded-lg p-4 bg-white">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">
                  Workers ({workersState.workers.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {workersState.workers.map((worker: Worker, index: number) => (
                    <div
                      key={worker.worker_id || index}
                      className={`border rounded-lg p-4 ${getWorkerStateColor(worker.state)}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono text-sm font-semibold text-gray-800">
                          {worker.worker_id || `Worker ${index + 1}`}
                        </span>
                        <span className={`px-2 py-1 rounded text-xs font-semibold border ${getWorkerStateColor(worker.state)}`}>
                          {worker.state || 'unknown'}
                        </span>
                      </div>
                      {worker.task_id && (
                        <div className="text-xs text-gray-600 font-mono mt-1">
                          Task: {worker.task_id.substring(0, 16)}...
                        </div>
                      )}
                      {worker.batch_id && (
                        <div className="text-xs text-gray-600 font-mono mt-1">
                          Batch: {worker.batch_id.substring(0, 16)}...
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="border rounded-lg p-4 bg-gray-50">
                <p className="text-gray-600 text-sm">No individual worker details available</p>
              </div>
            )}

            {/* Worker Metrics */}
            {Array.isArray(workersState.worker_metrics) && workersState.worker_metrics.length > 0 && (
              <div className="border rounded-lg p-4 bg-white">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">
                  Worker Metrics ({workersState.worker_metrics.length})
                </h3>
                <div className="space-y-2">
                  {workersState.worker_metrics.map((metric: WorkerMetrics, index: number) => (
                    <div
                      key={metric.worker_id || index}
                      className="border rounded-lg p-3 bg-gray-50"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono text-sm font-semibold text-gray-800">
                          {metric.worker_id || `Worker ${index + 1}`}
                        </span>
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${getWorkerStateColor(metric.state)}`}>
                          {metric.state}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                        {metric.total_batches_processed !== undefined && (
                          <div>
                            <span className="font-medium">Batches:</span> {metric.total_batches_processed}
                          </div>
                        )}
                        {metric.total_tasks_processed !== undefined && (
                          <div>
                            <span className="font-medium">Tasks:</span> {metric.total_tasks_processed}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Updates Log */}
            {state.updates.length > 0 && (
              <div className="border-t border-gray-200 pt-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  Recent Updates ({state.updates.length})
                </h3>
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {state.updates.slice(0, 20).map((update) => (
                    <div key={update.id} className="text-xs font-mono bg-gray-50 p-2 rounded">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500">
                          {new Date(update.timestamp).toLocaleTimeString()}
                        </span>
                        <span className="text-blue-600">
                          Workers: {update.state.total_workers ?? 0}
                        </span>
                        <span className="text-yellow-600">
                          Working: {update.state.working_workers ?? 0}
                        </span>
                        <span className="text-green-600">
                          Idle: {update.state.idle_workers ?? 0}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

