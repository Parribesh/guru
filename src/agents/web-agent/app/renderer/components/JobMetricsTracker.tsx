/**
 * Job Metrics Tracker Component
 * Tracks job_metrics from all events and displays them persistently
 * Never removes metrics once found, even if events stop coming
 */

import React, { useState, useEffect, useRef } from 'react';

interface JobMetrics {
  job_id?: string;
  status?: string;
  created_at?: number;
  start_time?: number;
  end_time?: number;
  duration_ms?: number;
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
}

interface JobMetricsEntry {
  job_id: string;
  metrics: JobMetrics;
  firstSeen: number;
  lastUpdated: number;
}

export const JobMetricsTracker: React.FC = () => {
  const [jobMetricsMap, setJobMetricsMap] = useState<Map<string, JobMetricsEntry>>(new Map());
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    const electronAPI = (window as any).electronAPI;
    
    if (!electronAPI?.on) {
      console.error('[JobMetricsTracker] electronAPI.on not available');
      return;
    }

    console.log('[JobMetricsTracker] Setting up event listener');

    const handleEvent = (eventData: any) => {
      if (!isMounted.current) return;

      try {
        // Log all events for debugging
        console.log('[JobMetricsTracker] Received event:', eventData?.type, eventData);
        
        // Handle different event types and structures
        let jobMetrics: any = null;
        let jobId: string | null = null;

        // Case 1: job_complete event from embedding service forwarder
        // Structure: { type: 'job_complete', jobId, stats: { job_metrics: {...} or stats itself contains metrics }, timestamp }
        if (eventData.type === 'job_complete') {
          const stats = eventData.stats || eventData.payload?.stats;
          jobId = eventData.jobId || eventData.job_id || eventData.payload?.jobId || eventData.payload?.job_id;
          if (stats) {
            // Stats might contain job_metrics or be the metrics themselves
            jobMetrics = stats.job_metrics || stats;
          }
        }
        
        // Case 2: job_status_update event from WebSocket
        // WebSocket structure: { type: 'job_status_update', payload: { job_id, status, total_chunks, completed_chunks, ... } }
        // After useMonitoring wrapper: event.payload = { job_id, status, ... }
        else if (eventData.type === 'job_status_update') {
          // useMonitoring wraps it: { type, payload, timestamp }
          // payload is the actual data from WebSocket: { job_id, status, total_chunks, ... }
          const payload = eventData.payload || eventData;
          
          // Extract job_id
          jobId = payload.jobId || payload.job_id;
          
          if (!jobId) {
            console.warn('[JobMetricsTracker] job_status_update missing job_id in payload:', payload);
            return;
          }
          
          // Capture metrics from ANY job_status_update that contains metric fields
          // Don't wait for 'completed' status - capture as soon as metrics appear
          // Check for comprehensive metrics (execution_time_sec, throughput, etc.) OR job_metrics field
          if (payload.job_metrics) {
            // Explicit job_metrics field
            jobMetrics = payload.job_metrics;
            console.log('[JobMetricsTracker] Found explicit job_metrics in job_status_update for job:', jobId);
          } else if (payload.execution_time_sec !== undefined || 
                     payload.overall_throughput_chunks_per_sec !== undefined ||
                     payload.success_rate !== undefined ||
                     payload.avg_batch_execution_time_sec !== undefined) {
            // Metrics embedded in payload itself
            jobMetrics = payload;
            console.log('[JobMetricsTracker] Found metrics in job_status_update payload for job:', jobId, {
              hasExecutionTime: payload.execution_time_sec !== undefined,
              hasThroughput: payload.overall_throughput_chunks_per_sec !== undefined,
              hasSuccessRate: payload.success_rate !== undefined,
              status: payload.status,
            });
          } else if (payload.status === 'completed' || payload.status === 'failed') {
            // Even if no metrics fields, capture completed/failed jobs for tracking
            jobMetrics = payload;
            console.log('[JobMetricsTracker] Capturing completed/failed job status for job:', jobId, payload.status);
          }
        }
        
        // Case 3: Direct job_metrics in payload (any other event type)
        else {
          const payload = eventData.payload || eventData;
          
          // Check for explicit job_metrics field
          if (payload.job_metrics) {
            jobMetrics = payload.job_metrics;
            jobId = jobMetrics.job_id || payload.jobId || payload.job_id || eventData.jobId || eventData.job_id;
          }
          // Check if payload itself contains metrics
          else if (payload.execution_time_sec !== undefined || 
                   payload.overall_throughput_chunks_per_sec !== undefined) {
            jobMetrics = payload;
            jobId = payload.job_id || payload.jobId || eventData.jobId || eventData.job_id;
          }
        }

        // Extract and store if we found metrics
        // Always try to update existing entries, even with partial data
        if (jobId && jobId !== 'unknown') {
          if (jobMetrics) {
            console.log('[JobMetricsTracker] Extracting and storing metrics for job:', jobId);
            extractAndStoreMetrics(jobMetrics, jobId);
          } else {
            // Even without metrics, update lastUpdate timestamp for existing jobs
            // This keeps jobs visible even when events temporarily stop
            setJobMetricsMap(prev => {
              const existing = prev.get(jobId);
              if (existing) {
                const updated = new Map(prev);
                updated.set(jobId, {
                  ...existing,
                  lastUpdated: Date.now(),
                });
                return updated;
              }
              return prev;
            });
            console.debug('[JobMetricsTracker] No metrics in event, but updating timestamp for existing job:', jobId);
          }
        } else {
          console.debug('[JobMetricsTracker] No metrics found in event:', eventData.type, {
            hasJobId: !!jobId,
            hasMetrics: !!jobMetrics,
            jobId: jobId || 'none',
          });
        }
      } catch (error: any) {
        console.error('[JobMetricsTracker] Error processing event:', error, eventData);
      }
    };

    const extractAndStoreMetrics = (metrics: any, jobId: string) => {
      if (!jobId || jobId === 'unknown') {
        console.warn('[JobMetricsTracker] Missing job_id, skipping metrics');
        return;
      }

      setJobMetricsMap(prev => {
        const updated = new Map(prev);
        const existing = updated.get(jobId);
        
        const now = Date.now();
        
        // Merge new metrics with existing metrics - preserve all fields
        // Only update fields that are actually provided in the new metrics
        const mergedMetrics: JobMetrics = {
          job_id: jobId,
          // Preserve existing or use new
          status: metrics.status ?? existing?.metrics.status,
          created_at: metrics.created_at ?? existing?.metrics.created_at,
          start_time: metrics.start_time ?? existing?.metrics.start_time,
          end_time: metrics.end_time ?? existing?.metrics.end_time,
          duration_ms: metrics.duration_ms ?? existing?.metrics.duration_ms,
          execution_time_sec: metrics.execution_time_sec ?? existing?.metrics.execution_time_sec,
          report_generated_at: metrics.report_generated_at ?? existing?.metrics.report_generated_at,
          total_chunks: metrics.total_chunks ?? existing?.metrics.total_chunks,
          completed_chunks: metrics.completed_chunks ?? existing?.metrics.completed_chunks,
          failed_chunks: metrics.failed_chunks ?? existing?.metrics.failed_chunks,
          pending_chunks: metrics.pending_chunks ?? existing?.metrics.pending_chunks,
          total_batches: metrics.total_batches ?? existing?.metrics.total_batches,
          completed_batches: metrics.completed_batches ?? existing?.metrics.completed_batches,
          failed_batches: metrics.failed_batches ?? existing?.metrics.failed_batches,
          processing_batches: metrics.processing_batches ?? existing?.metrics.processing_batches,
          pending_batches: metrics.pending_batches ?? existing?.metrics.pending_batches,
          avg_batch_size: metrics.avg_batch_size ?? existing?.metrics.avg_batch_size,
          min_batch_size: metrics.min_batch_size ?? existing?.metrics.min_batch_size,
          max_batch_size: metrics.max_batch_size ?? existing?.metrics.max_batch_size,
          success_rate: metrics.success_rate ?? existing?.metrics.success_rate,
          overall_throughput_chunks_per_sec: metrics.overall_throughput_chunks_per_sec ?? existing?.metrics.overall_throughput_chunks_per_sec,
          avg_batch_execution_time_sec: metrics.avg_batch_execution_time_sec ?? existing?.metrics.avg_batch_execution_time_sec,
          min_batch_execution_time_sec: metrics.min_batch_execution_time_sec ?? existing?.metrics.min_batch_execution_time_sec,
          max_batch_execution_time_sec: metrics.max_batch_execution_time_sec ?? existing?.metrics.max_batch_execution_time_sec,
          batch_metrics: metrics.batch_metrics || existing?.metrics.batch_metrics,
        };

        const entry: JobMetricsEntry = {
          job_id: jobId,
          metrics: mergedMetrics,
          firstSeen: existing?.firstSeen || now,
          lastUpdated: now,
        };

        updated.set(jobId, entry);
        console.log(`[JobMetricsTracker] Stored/updated metrics for job ${jobId}`, {
          hasExecutionTime: !!entry.metrics.execution_time_sec,
          hasThroughput: !!entry.metrics.overall_throughput_chunks_per_sec,
          status: entry.metrics.status,
          totalChunks: entry.metrics.total_chunks,
        });
        return updated;
      });
    };

    // Listen to embedding service events
    electronAPI.on('embedding-service:event', handleEvent);

    return () => {
      isMounted.current = false;
      if (electronAPI?.off) {
        electronAPI.off('embedding-service:event', handleEvent);
      }
    };
  }, []);

  const jobsArray = Array.from(jobMetricsMap.values()).sort((a, b) => b.lastUpdated - a.lastUpdated);

  const formatNumber = (value: number | undefined, decimals: number = 2): string => {
    if (value === undefined || value === null) return 'N/A';
    return typeof value === 'number' ? value.toFixed(decimals) : String(value);
  };

  const formatPercentage = (value: number | undefined): string => {
    if (value === undefined || value === null) return 'N/A';
    if (typeof value === 'number') {
      return value < 1 ? `${(value * 100).toFixed(1)}%` : `${value.toFixed(1)}%`;
    }
    return String(value);
  };

  const formatTimestamp = (timestamp: number | undefined): string => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleString();
  };

  const getStatusColor = (status?: string): string => {
    switch (status) {
      case 'completed': return 'text-green-600 bg-green-50';
      case 'failed': return 'text-red-600 bg-red-50';
      case 'processing': return 'text-blue-600 bg-blue-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 p-4 bg-gray-50">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">Job Metrics Tracker</h2>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">
              {jobsArray.length} job{jobsArray.length !== 1 ? 's' : ''} tracked
            </span>
            <button
              onClick={() => setJobMetricsMap(new Map())}
              className="px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm"
            >
              Clear All
            </button>
          </div>
        </div>
        <p className="text-sm text-gray-500 mt-2">
          Persistently tracks job_metrics from all events. Metrics never disappear once captured.
        </p>
      </div>

      {/* Jobs List */}
      <div className="flex-1 overflow-y-auto p-4">
        {jobsArray.length === 0 ? (
          <div className="text-center text-gray-500 py-12">
            <p>No job metrics captured yet.</p>
            <p className="text-sm mt-2">Waiting for events with job_metrics...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {jobsArray.map((entry) => {
              const m = entry.metrics;
              return (
                <div key={entry.job_id} className="border border-gray-200 rounded-lg p-4 bg-white shadow-sm">
                  {/* Job Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-sm font-semibold text-gray-800">{m.job_id}</span>
                        {m.status && (
                          <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(m.status)}`}>
                            {m.status}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        First seen: {formatTimestamp(entry.firstSeen)} | 
                        Last updated: {formatTimestamp(entry.lastUpdated)}
                      </div>
                    </div>
                  </div>

                  {/* Metrics Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Execution Time */}
                    <div className="bg-gray-50 rounded p-3">
                      <div className="text-xs font-medium text-gray-500 mb-1">Execution Time</div>
                      <div className="text-lg font-semibold text-gray-900">
                        {formatNumber(m.execution_time_sec)}s
                      </div>
                    </div>

                    {/* Throughput */}
                    <div className="bg-gray-50 rounded p-3">
                      <div className="text-xs font-medium text-gray-500 mb-1">Throughput</div>
                      <div className="text-lg font-semibold text-gray-900">
                        {formatNumber(m.overall_throughput_chunks_per_sec)} chunks/s
                      </div>
                    </div>

                    {/* Success Rate */}
                    <div className="bg-gray-50 rounded p-3">
                      <div className="text-xs font-medium text-gray-500 mb-1">Success Rate</div>
                      <div className={`text-lg font-semibold ${
                        (m.success_rate ?? 0) >= 0.95 ? 'text-green-600' :
                        (m.success_rate ?? 0) >= 0.80 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {formatPercentage(m.success_rate)}
                      </div>
                    </div>

                    {/* Chunks */}
                    <div className="bg-gray-50 rounded p-3">
                      <div className="text-xs font-medium text-gray-500 mb-1">Chunks</div>
                      <div className="text-sm text-gray-900">
                        {m.completed_chunks ?? 0} / {m.total_chunks ?? 0} completed
                        {m.failed_chunks ? `, ${m.failed_chunks} failed` : ''}
                      </div>
                    </div>

                    {/* Batches */}
                    <div className="bg-gray-50 rounded p-3">
                      <div className="text-xs font-medium text-gray-500 mb-1">Batches</div>
                      <div className="text-sm text-gray-900">
                        {m.completed_batches ?? 0} / {m.total_batches ?? 0} completed
                        {m.failed_batches ? `, ${m.failed_batches} failed` : ''}
                      </div>
                    </div>

                    {/* Average Batch Time */}
                    <div className="bg-gray-50 rounded p-3">
                      <div className="text-xs font-medium text-gray-500 mb-1">Avg Batch Time</div>
                      <div className="text-sm text-gray-900">
                        {formatNumber(m.avg_batch_execution_time_sec)}s
                      </div>
                    </div>

                    {/* Batch Size Stats */}
                    {m.avg_batch_size !== undefined && (
                      <div className="bg-gray-50 rounded p-3">
                        <div className="text-xs font-medium text-gray-500 mb-1">Batch Size</div>
                        <div className="text-sm text-gray-900">
                          Avg: {formatNumber(m.avg_batch_size, 0)}
                          {m.min_batch_size !== undefined && m.max_batch_size !== undefined && (
                            <span className="text-gray-500"> (min: {m.min_batch_size}, max: {m.max_batch_size})</span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Batch Time Range */}
                    {m.min_batch_execution_time_sec !== undefined && m.max_batch_execution_time_sec !== undefined && (
                      <div className="bg-gray-50 rounded p-3">
                        <div className="text-xs font-medium text-gray-500 mb-1">Batch Time Range</div>
                        <div className="text-sm text-gray-900">
                          {formatNumber(m.min_batch_execution_time_sec)}s - {formatNumber(m.max_batch_execution_time_sec)}s
                        </div>
                      </div>
                    )}

                    {/* Timestamps */}
                    {m.start_time && m.end_time && (
                      <div className="bg-gray-50 rounded p-3">
                        <div className="text-xs font-medium text-gray-500 mb-1">Timestamps</div>
                        <div className="text-xs text-gray-900 space-y-1">
                          <div>Start: {formatTimestamp(m.start_time)}</div>
                          <div>End: {formatTimestamp(m.end_time)}</div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Full Metrics JSON (collapsible) */}
                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm font-medium text-gray-600 hover:text-gray-800">
                      View Full JSON
                    </summary>
                    <pre className="mt-2 p-3 bg-gray-50 rounded text-xs overflow-x-auto">
                      {JSON.stringify(m, null, 2)}
                    </pre>
                  </details>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

