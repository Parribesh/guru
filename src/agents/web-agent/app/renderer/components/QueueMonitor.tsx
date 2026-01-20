/**
 * Queue Monitor Component (Refactored)
 * Uses QueueContext for state management
 */

import React, { useState, useEffect, useRef } from 'react';
import { useQueue } from '../contexts/QueueContext';

interface QueueDataPoint {
  timestamp: number;
  queueSize: number;
  processing: number;
  completed: number;
  failed: number;
}

export const QueueMonitor: React.FC = () => {
  const { status, metrics, isConnected, refresh } = useQueue();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [history, setHistory] = useState<QueueDataPoint[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Merge status and metrics for comprehensive display
  // API returns: size, maxsize, usage_percent, state, total_submitted, total_processed, 
  // available_slots, last_updated, num_workers, working_workers, idle_workers, workers
  const queueData = React.useMemo(() => {
    if (!status && !metrics) return null;
    
    // Use status endpoint first (has worker info), fallback to metrics
    const source = status || metrics || {};
    
    return {
      // Queue metrics (from API contract)
      queue_size: source.size ?? source.queue_size ?? 0,
      queue_maxsize: source.maxsize ?? source.queue_maxsize ?? source.maxsize,
      queue_usage_percent: source.usage_percent ?? source.queue_usage_percent ?? source.usage_percent ?? 0,
      state: source.state,
      total_submitted: source.total_submitted,
      total_processed: source.total_processed,
      available_slots: source.available_slots,
      last_updated: source.last_updated,
      
      // Worker information (from status endpoint or worker_state_update events)
      num_workers: status?.total_workers ?? status?.num_workers,
      total_workers: status?.total_workers ?? status?.num_workers,
      working_workers: status?.working_workers,
      idle_workers: status?.idle_workers,
      stopped_workers: status?.stopped_workers,
      active_workers: status?.working_workers ?? status?.active_workers,
      workers: status?.workers,
      worker_metrics: status?.worker_metrics,
      total_batches_processed: status?.total_batches_processed,
      total_tasks_processed: status?.total_tasks_processed,
      queue_type: status?.queue_type,
      
      // Legacy fields for compatibility
      processing: status?.processing,
      completed: status?.completed ?? source.total_processed,
      failed: status?.failed,
      pending: status?.pending,
    };
  }, [status, metrics]);

  // Add to history when queue data updates
  useEffect(() => {
    if (queueData) {
      const dataPoint: QueueDataPoint = {
        timestamp: queueData.last_updated ?? Date.now(),
        queueSize: queueData.queue_size || 0,
        processing: queueData.working_workers ?? queueData.active_workers ?? 0,
        completed: queueData.total_processed ?? queueData.completed ?? 0,
        failed: queueData.failed || 0,
      };
      
      setHistory(prev => {
        // Avoid duplicate entries with same timestamp
        const last = prev[prev.length - 1];
        if (last && last.timestamp === dataPoint.timestamp) {
          return prev;
        }
        return [...prev, dataPoint].slice(-100); // Keep last 100 data points
      });
    }
  }, [queueData]);

  useEffect(() => {
    refresh(); // Initial fetch
    
    if (autoRefresh) {
      const interval = setInterval(() => refresh(), 5000); // Refresh every 5 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refresh]);

  // Draw graph
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || history.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size based on container
    const container = canvas.parentElement;
    if (container) {
      const rect = container.getBoundingClientRect();
      canvas.width = Math.max(800, rect.width - 32);
      canvas.height = 300;
    }

    const width = canvas.width;
    const height = canvas.height;
    const padding = 40;
    const graphWidth = width - padding * 2;
    const graphHeight = height - padding * 2;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw background
    ctx.fillStyle = '#f9fafb';
    ctx.fillRect(0, 0, width, height);

    // Find max values for scaling
    const maxQueueSizeValue = typeof queueData?.queue_maxsize === 'number' && queueData.queue_maxsize > 0
      ? queueData.queue_maxsize
      : Math.max(...history.map((d) => d.queueSize), 10);
    const maxQueueSize = Math.max(
      ...history.map((d) => d.queueSize),
      maxQueueSizeValue,
      1
    );
    const maxProcessing = Math.max(...history.map((d) => d.processing), 1);
    const maxValue = Math.max(maxQueueSize, maxProcessing, 1);

    // Draw grid
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = padding + (graphHeight / 5) * i;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
    }

    // Draw axes
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();

    // Draw labels
    ctx.fillStyle = '#6b7280';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
      const value = Math.round((maxValue / 5) * (5 - i));
      const y = padding + (graphHeight / 5) * i;
      ctx.fillText(value.toString(), padding - 10, y + 4);
    }

    // Draw queue size line
    if (history.length > 1) {
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.beginPath();
      history.forEach((point, index) => {
        const x = padding + (graphWidth / (history.length - 1)) * index;
        const y = height - padding - (point.queueSize / maxValue) * graphHeight;
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();

      // Fill area under queue size
      ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
      ctx.beginPath();
      ctx.moveTo(padding, height - padding);
      history.forEach((point, index) => {
        const x = padding + (graphWidth / (history.length - 1)) * index;
        const y = height - padding - (point.queueSize / maxValue) * graphHeight;
        ctx.lineTo(x, y);
      });
      ctx.lineTo(width - padding, height - padding);
      ctx.closePath();
      ctx.fill();
    }

    // Draw processing line
    if (history.length > 1) {
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      history.forEach((point, index) => {
        const x = padding + (graphWidth / (history.length - 1)) * index;
        const y = height - padding - (point.processing / maxValue) * graphHeight;
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
    }

    // Draw legend
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(width - 150, 20, 15, 2);
    ctx.fillStyle = '#374151';
    ctx.fillText('Queue Size', width - 130, 25);

    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(width - 150, 40, 15, 2);
    ctx.fillStyle = '#374151';
    ctx.fillText('Processing', width - 130, 45);
  }, [history, queueData]);

  const getQueuePercentage = () => {
    if (!queueData) return 0;
    if (queueData.queue_usage_percent !== undefined && queueData.queue_usage_percent !== null) {
      return queueData.queue_usage_percent;
    }
    if (queueData.queue_maxsize && typeof queueData.queue_maxsize === 'number' && queueData.queue_maxsize > 0) {
      const current = queueData.queue_size || 0;
      return Math.min((current / queueData.queue_maxsize) * 100, 100);
    }
    return 0;
  };
  
  const formatMaxSize = (maxsize: number | string | undefined): string => {
    if (maxsize === undefined || maxsize === null) return '?';
    if (maxsize === 'unlimited' || maxsize === 0) return 'unlimited';
    return String(maxsize);
  };
  
  const formatAvailableSlots = (slots: number | string | undefined): string => {
    if (slots === undefined || slots === null) return '?';
    if (slots === 'unlimited') return 'unlimited';
    return String(slots);
  };

  const getQueueColor = () => {
    const percentage = getQueuePercentage();
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 70) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  if (!queueData && history.length === 0) {
    return (
      <div className="p-4">
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <p className="text-gray-800">Loading queue status...</p>
          <div className="flex items-center gap-2 mt-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-400'}`} />
            <span className="text-sm text-gray-600">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          {!isConnected && (
            <p className="text-xs text-gray-500 mt-2">
              Attempting to connect to queue API... Check console for errors.
            </p>
          )}
          <button
            onClick={refresh}
            className="mt-3 px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 p-4 bg-gray-50">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">Queue Monitor</h2>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-400'}`} />
              <span className="text-sm text-gray-600">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            {history.length > 0 && (
              <span className="text-sm text-gray-500">
                Last update: {new Date(history[history.length - 1].timestamp).toLocaleTimeString()}
              </span>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded"
              />
              <span>Auto-refresh</span>
            </label>
            <button
              onClick={refresh}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {queueData ? (
          <>
            {/* Queue Size Card */}
            <div className="border rounded-lg p-6 bg-white">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-800">Queue Size</h3>
                <span className="text-2xl font-bold text-gray-900">
                  {queueData.queue_size || 0}
                  {queueData.queue_maxsize && (
                    <span className="text-sm font-normal text-gray-500 ml-2">
                      / {formatMaxSize(queueData.queue_maxsize)}
                    </span>
                  )}
                </span>
                {queueData.available_slots !== undefined && (
                  <div className="text-sm text-gray-600 mt-1">
                    Available: {formatAvailableSlots(queueData.available_slots)} slots
                  </div>
                )}
              </div>
              {queueData.queue_usage_percent !== undefined && (
                <div className="text-sm text-gray-600 mb-2">
                  Usage: {typeof queueData.queue_usage_percent === 'number' ? queueData.queue_usage_percent.toFixed(2) : queueData.queue_usage_percent}%
                </div>
              )}
              {queueData.state && (
                <div className="text-sm text-gray-600 mb-2">
                  State: <span className={`font-medium ${
                    queueData.state === 'healthy' ? 'text-green-600' :
                    queueData.state === 'warning' ? 'text-yellow-600' :
                    queueData.state === 'critical' ? 'text-orange-600' :
                    queueData.state === 'full' ? 'text-red-600' : 'text-gray-600'
                  }`}>{queueData.state}</span>
                </div>
              )}
              
              {/* Progress Bar */}
              {queueData.queue_maxsize && typeof queueData.queue_maxsize === 'number' && queueData.queue_maxsize > 0 && (
                <div className="w-full bg-gray-200 rounded-full h-6 mb-2">
                  <div
                    className={`${getQueueColor()} h-6 rounded-full transition-all duration-300 flex items-center justify-center`}
                    style={{ width: `${getQueuePercentage()}%` }}
                  >
                    {getQueuePercentage() > 10 && (
                      <span className="text-white text-xs font-semibold">
                        {Math.round(getQueuePercentage())}%
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="border rounded-lg p-4 bg-blue-50 border-blue-200">
                <div className="text-sm text-blue-600 font-medium mb-1">Working Workers</div>
                <div className="text-2xl font-bold text-blue-900">
                  {queueData.working_workers ?? queueData.active_workers ?? 0}
                </div>
                {queueData.num_workers !== undefined && (
                  <div className="text-xs text-blue-500 mt-1">
                    of {queueData.num_workers} total
                  </div>
                )}
              </div>
              
              <div className="border rounded-lg p-4 bg-green-50 border-green-200">
                <div className="text-sm text-green-600 font-medium mb-1">Total Processed</div>
                <div className="text-2xl font-bold text-green-900">
                  {queueData.total_processed ?? queueData.completed ?? 0}
                </div>
                {queueData.total_submitted !== undefined && (
                  <div className="text-xs text-green-500 mt-1">
                    of {queueData.total_submitted} submitted
                  </div>
                )}
              </div>
              
              <div className="border rounded-lg p-4 bg-purple-50 border-purple-200">
                <div className="text-sm text-purple-600 font-medium mb-1">Idle Workers</div>
                <div className="text-2xl font-bold text-purple-900">
                  {queueData.idle_workers ?? 0}
                </div>
              </div>
              
              <div className="border rounded-lg p-4 bg-indigo-50 border-indigo-200">
                <div className="text-sm text-indigo-600 font-medium mb-1">Total Workers</div>
                <div className="text-2xl font-bold text-indigo-900">
                  {queueData.num_workers ?? (Array.isArray(queueData.workers) ? queueData.workers.length : 0)}
                </div>
                {queueData.queue_type && (
                  <div className="text-xs text-indigo-500 mt-1">
                    Type: {queueData.queue_type}
                  </div>
                )}
              </div>
            </div>

            {/* Workers Detail */}
            {Array.isArray(queueData.workers) && queueData.workers.length > 0 && (
              <div className="border rounded-lg p-4 bg-white">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">
                  Worker Status ({queueData.workers.length} workers)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  {queueData.workers.map((worker: any, index: number) => (
                    <div
                      key={worker.worker_id || index}
                      className={`border rounded-lg p-3 ${
                        worker.state === 'idle' || worker.state === 'ready'
                          ? 'bg-green-50 border-green-200'
                          : worker.state === 'working' || worker.state === 'processing' || worker.state === 'busy'
                          ? 'bg-yellow-50 border-yellow-200'
                          : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-700">
                          {worker.worker_id || `Worker ${index + 1}`}
                        </span>
                        <span
                          className={`px-2 py-1 rounded text-xs font-semibold ${
                            worker.state === 'idle' || worker.state === 'ready'
                              ? 'bg-green-600 text-white'
                              : worker.state === 'working' || worker.state === 'processing' || worker.state === 'busy'
                              ? 'bg-yellow-600 text-white'
                              : 'bg-gray-600 text-white'
                          }`}
                        >
                          {worker.state || 'unknown'}
                        </span>
                      </div>
                      {worker.task_id && (
                        <div className="text-xs text-gray-500 font-mono mt-1">
                          Task: {worker.task_id.substring(0, 12)}...
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Graph */}
            <div className="border rounded-lg p-4 bg-white">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Queue Size Over Time</h3>
              <div className="w-full overflow-x-auto">
                <canvas
                  ref={canvasRef}
                  width={800}
                  height={300}
                  className="border border-gray-200 rounded"
                  style={{ maxWidth: '100%', height: 'auto' }}
                />
              </div>
              {history.length === 0 && (
                <div className="text-center text-gray-400 py-8">
                  No data yet. Waiting for queue updates...
                </div>
              )}
            </div>

            {/* Raw Status (for debugging) */}
            <details className="border rounded-lg p-4 bg-gray-50">
              <summary className="cursor-pointer text-sm font-semibold text-gray-700">
                Raw Queue Data (Debug)
              </summary>
              <div className="mt-2 space-y-2">
                {status && (
                  <div>
                    <div className="text-xs font-medium text-gray-600 mb-1">Status:</div>
                    <pre className="text-xs bg-white p-3 rounded border border-gray-200 overflow-auto">
                      {JSON.stringify(status, null, 2)}
                    </pre>
                  </div>
                )}
                {metrics && (
                  <div>
                    <div className="text-xs font-medium text-gray-600 mb-1">Metrics:</div>
                    <pre className="text-xs bg-white p-3 rounded border border-gray-200 overflow-auto">
                      {JSON.stringify(metrics, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </details>
          </>
        ) : (
          <div className="text-gray-500 text-center py-8">
            No queue status available
          </div>
        )}
      </div>
    </div>
  );
};
