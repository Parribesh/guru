/**
 * Job Monitor Component
 * Standardized monitoring component using useMonitoring hook
 * Tracks multiple embedding jobs with detailed progress
 */

import React, { useCallback, useEffect } from 'react';
import { useMonitoring } from '../hooks/useMonitoring';

interface JobUpdate {
  id: string;
  timestamp: number;
  job_id: string;
  status: string;
  payload: any;
}

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

interface JobData {
  job_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  total_chunks: number;
  completed_chunks: number;
  failed_chunks: number;
  total_batches: number;
  completed_batches?: number;
  batches?: any[];
  batch_metrics?: Record<string, any>;
  created_at?: number;
  start_time?: number;
  end_time?: number;
  lastUpdate: number;
  job_metrics?: JobMetrics; // Full job execution metrics
}

interface JobMonitorState {
  jobs: Map<string, JobData>;
  updates: JobUpdate[];
}

const initialState: JobMonitorState = {
  jobs: new Map(),
  updates: [],
};

let updateIdCounter = 0;

export const JobMonitor: React.FC = () => {
  const { state, monitoringState, reset, updateState } = useMonitoring<JobMonitorState>(
    'embedding-service:event',
    {
      // Handle job complete events (final metrics)
      job_complete: (prevState, event) => {
        // Event structure: useMonitoring wraps it as { type, payload, timestamp }
        // payload is the original eventData: { type: 'job_complete', jobId, stats, timestamp }
        const eventData = event.payload || event;
        const jobId = eventData.jobId || eventData.job_id;
        const stats = eventData.stats;
        if (!jobId) return prevState;

        const existingJob = prevState.jobs.get(jobId);
        
        // Update job with final metrics (create job if it doesn't exist yet)
        const updatedJobs = new Map(prevState.jobs);
        updatedJobs.set(jobId, {
          job_id: jobId,
          status: (stats?.status || existingJob?.status || 'completed') as 'pending' | 'processing' | 'completed' | 'failed',
          total_chunks: stats?.totalChunks || stats?.total_chunks || existingJob?.total_chunks || 0,
          completed_chunks: stats?.completed_chunks || stats?.successCount || existingJob?.completed_chunks || 0,
          failed_chunks: stats?.failed_chunks || stats?.failedCount || existingJob?.failed_chunks || 0,
          total_batches: stats?.totalBatches || stats?.total_batches || existingJob?.total_batches || 0,
          completed_batches: stats?.completed_batches ?? existingJob?.completed_batches,
          batches: existingJob?.batches || [],
          batch_metrics: existingJob?.batch_metrics || {},
          created_at: existingJob?.created_at,
          start_time: existingJob?.start_time,
          end_time: existingJob?.end_time || Date.now(),
          lastUpdate: Date.now(),
          job_metrics: stats ? {
            job_id: jobId,
            status: stats.status || 'completed',
            execution_time_sec: stats.execution_time_sec,
            overall_throughput_chunks_per_sec: stats.overall_throughput_chunks_per_sec,
            success_rate: stats.success_rate !== undefined ? stats.success_rate : (stats.successRate ? stats.successRate / 100 : undefined),
            avg_batch_execution_time_sec: stats.avg_batch_execution_time_sec,
            min_batch_execution_time_sec: stats.min_batch_execution_time_sec,
            max_batch_execution_time_sec: stats.max_batch_execution_time_sec,
            total_chunks: stats.totalChunks || stats.total_chunks,
            completed_chunks: stats.completed_chunks || stats.successCount,
            failed_chunks: stats.failed_chunks || stats.failedCount,
            total_batches: stats.totalBatches || stats.total_batches,
            completed_batches: stats.completed_batches,
            avg_batch_size: stats.avg_batch_size,
            min_batch_size: stats.min_batch_size,
            max_batch_size: stats.max_batch_size,
            ...(stats.job_metrics || {}),
          } : existingJob?.job_metrics,
        });

        return {
          ...prevState,
          jobs: updatedJobs,
        };
      },
      
      // Handle job status updates
      // New contract: { type: 'job_status_update', payload: { job: {...}, queue: {...}, workers: {...} } }
      job_status_update: (prevState, event) => {
        const payload = event.payload || event;
        
        // Extract job state from payload.job (new contract structure)
        const jobState = payload.job || payload.jobStatus || payload;
        
        // Extract jobId - try multiple possible locations for backward compatibility
        const jobId = jobState.jobId || jobState.job_id || payload.jobId || payload.job_id;
        if (!jobId) {
          console.warn('[JobMonitor] job_status_update event missing jobId', payload);
          return prevState;
        }

        // Use job state from payload.job (new contract) or fallback to old structure
        const jobStatus = jobState;
        const existingJob = prevState.jobs.get(jobId);

        // Build job_metrics object - ALWAYS preserve existing metrics, merge with new data
        let jobMetrics: JobMetrics | undefined = existingJob?.job_metrics;
        
        // Update job_metrics if we have any metric fields (don't wait for completed status)
        // Merge new metrics with existing to preserve all data
        if (jobStatus.job_metrics || 
            jobStatus.execution_time_sec !== undefined || 
            jobStatus.overall_throughput_chunks_per_sec !== undefined || 
            jobStatus.success_rate !== undefined ||
            jobStatus.avg_batch_execution_time_sec !== undefined ||
            jobStatus.status === 'completed' || 
            jobStatus.status === 'failed') {
          
          // Merge with existing metrics to preserve all fields
          jobMetrics = {
            job_id: jobId,
            status: jobStatus.status || existingJob?.job_metrics?.status || 'processing',
            created_at: jobStatus.created_at ?? existingJob?.job_metrics?.created_at,
            start_time: jobStatus.start_time ?? existingJob?.job_metrics?.start_time,
            end_time: jobStatus.end_time ?? existingJob?.job_metrics?.end_time,
            duration_ms: jobStatus.duration_ms ?? existingJob?.job_metrics?.duration_ms,
            execution_time_sec: jobStatus.execution_time_sec ?? existingJob?.job_metrics?.execution_time_sec,
            report_generated_at: jobStatus.report_generated_at ?? existingJob?.job_metrics?.report_generated_at,
            total_chunks: jobStatus.total_chunks ?? existingJob?.job_metrics?.total_chunks,
            completed_chunks: jobStatus.completed_chunks ?? existingJob?.job_metrics?.completed_chunks,
            failed_chunks: jobStatus.failed_chunks ?? existingJob?.job_metrics?.failed_chunks,
            pending_chunks: jobStatus.pending_chunks ?? existingJob?.job_metrics?.pending_chunks,
            total_batches: jobStatus.total_batches ?? existingJob?.job_metrics?.total_batches,
            completed_batches: jobStatus.completed_batches ?? existingJob?.job_metrics?.completed_batches,
            failed_batches: jobStatus.failed_batches ?? existingJob?.job_metrics?.failed_batches,
            processing_batches: jobStatus.processing_batches ?? existingJob?.job_metrics?.processing_batches,
            pending_batches: jobStatus.pending_batches ?? existingJob?.job_metrics?.pending_batches,
            avg_batch_size: jobStatus.avg_batch_size ?? existingJob?.job_metrics?.avg_batch_size,
            min_batch_size: jobStatus.min_batch_size ?? existingJob?.job_metrics?.min_batch_size,
            max_batch_size: jobStatus.max_batch_size ?? existingJob?.job_metrics?.max_batch_size,
            success_rate: jobStatus.success_rate ?? existingJob?.job_metrics?.success_rate,
            overall_throughput_chunks_per_sec: jobStatus.overall_throughput_chunks_per_sec ?? existingJob?.job_metrics?.overall_throughput_chunks_per_sec,
            avg_batch_execution_time_sec: jobStatus.avg_batch_execution_time_sec ?? existingJob?.job_metrics?.avg_batch_execution_time_sec,
            min_batch_execution_time_sec: jobStatus.min_batch_execution_time_sec ?? existingJob?.job_metrics?.min_batch_execution_time_sec,
            max_batch_execution_time_sec: jobStatus.max_batch_execution_time_sec ?? existingJob?.job_metrics?.max_batch_execution_time_sec,
            batch_metrics: jobStatus.batch_metrics || existingJob?.job_metrics?.batch_metrics,
            // If jobStatus has a job_metrics field, use that and merge with existing
            ...(jobStatus.job_metrics || {}),
          };
        }

        // Update jobs map with job_metrics if available (comprehensive metrics)
        const updatedJobs = new Map(prevState.jobs);
        updatedJobs.set(jobId, {
          job_id: jobId,
          status: (jobStatus.status || existingJob?.status || 'processing') as 'pending' | 'processing' | 'completed' | 'failed',
          total_chunks: jobStatus.total_chunks ?? existingJob?.total_chunks ?? 0,
          completed_chunks: jobStatus.completed_chunks ?? existingJob?.completed_chunks ?? 0,
          failed_chunks: jobStatus.failed_chunks ?? existingJob?.failed_chunks ?? 0,
          total_batches: jobStatus.total_batches ?? existingJob?.total_batches ?? 0,
          completed_batches: jobStatus.completed_batches ?? existingJob?.completed_batches,
          batches: jobStatus.batches || existingJob?.batches || [],
          batch_metrics: jobStatus.batch_metrics || existingJob?.batch_metrics || {},
          created_at: jobStatus.created_at || existingJob?.created_at,
          start_time: jobStatus.start_time || existingJob?.start_time,
          end_time: jobStatus.end_time || existingJob?.end_time,
          lastUpdate: Date.now(),
          // Always preserve job_metrics once set (don't let them vanish)
          job_metrics: jobMetrics,
        });

        // Add to updates list
        const jobUpdate: JobUpdate = {
          id: `update-${++updateIdCounter}`,
          timestamp: event.timestamp || Date.now(),
          job_id: jobId,
          status: payload.status || 'processing',
          payload: payload,
        };

        const updatedUpdates = [jobUpdate, ...prevState.updates].slice(0, 100); // Keep last 100

        return {
          jobs: updatedJobs,
          updates: updatedUpdates,
        };
      },
    },
    initialState
  );

  const jobsArray = Array.from(state.jobs.values());
  const activeJobs = jobsArray.filter(job => job.status !== 'completed' && job.status !== 'failed');
  const completedJobs = jobsArray.filter(job => job.status === 'completed');
  const failedJobs = jobsArray.filter(job => job.status === 'failed');

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 p-4 bg-gray-50">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">Job Monitor</h2>
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
        {jobsArray.length > 0 && (
          <div className="mt-2 flex items-center gap-4 text-sm">
            <span className="text-gray-600">
              Total: <span className="font-semibold">{jobsArray.length}</span>
            </span>
            {activeJobs.length > 0 && (
              <span className="text-blue-600">
                Active: <span className="font-semibold">{activeJobs.length}</span>
              </span>
            )}
            {completedJobs.length > 0 && (
              <span className="text-green-600">
                Completed: <span className="font-semibold">{completedJobs.length}</span>
              </span>
            )}
            {failedJobs.length > 0 && (
              <span className="text-red-600">
                Failed: <span className="font-semibold">{failedJobs.length}</span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {jobsArray.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <div className="text-lg mb-2">No jobs detected</div>
            <div className="text-sm">Jobs will appear here when embedding tasks are submitted</div>
            {!monitoringState.isConnected && (
              <div className="text-xs text-yellow-600 mt-2">
                Waiting for connection...
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Active Jobs First */}
            {activeJobs.length > 0 && (
              <>
                {activeJobs.length > 0 && jobsArray.length > activeJobs.length && (
                  <div className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
                    Active Jobs ({activeJobs.length})
                  </div>
                )}
                {activeJobs.map((job) => {
                  const progress = job.total_chunks > 0 
                    ? (job.completed_chunks / job.total_chunks) * 100 
                    : 0;

                  return (
                    <div key={job.job_id} className="border rounded-lg p-4 bg-white border-blue-200">
                      {/* Job Header */}
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="font-semibold text-gray-800">Job: {job.job_id.substring(0, 8)}...</div>
                          <div className="text-xs text-gray-500 font-mono">{job.job_id}</div>
                        </div>
                        <span className={`px-3 py-1 rounded text-sm font-semibold ${
                          job.status === 'completed' ? 'bg-green-100 text-green-800' :
                          job.status === 'processing' ? 'bg-blue-100 text-blue-800' :
                          job.status === 'failed' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {job.status}
                        </span>
                      </div>

                      {/* Progress */}
                      <div className="mb-3">
                        <div className="flex justify-between text-sm text-gray-600 mb-1">
                          <span>{job.completed_chunks} / {job.total_chunks} chunks</span>
                          <span>{progress.toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-3">
                          <div
                            className={`h-3 rounded-full transition-all duration-300 ${
                              job.status === 'completed' ? 'bg-green-500' :
                              job.status === 'failed' ? 'bg-red-500' :
                              'bg-blue-500'
                            }`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="grid grid-cols-4 gap-4 text-sm">
                        <div>
                          <div className="text-xs text-gray-500">Batches</div>
                          <div className="font-semibold">{job.completed_batches || 0} / {job.total_batches}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">Completed</div>
                          <div className="font-semibold text-green-600">{job.completed_chunks}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">Failed</div>
                          <div className="font-semibold text-red-600">{job.failed_chunks}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">Last Update</div>
                          <div className="font-semibold text-xs">
                            {new Date(job.lastUpdate).toLocaleTimeString()}
                          </div>
                        </div>
                      </div>

                      {/* Batch Details */}
                      {job.batches && job.batches.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-gray-200">
                          <div className="text-xs font-semibold text-gray-700 mb-2">Batches ({job.batches.length})</div>
                          <div className="space-y-2">
                            {job.batches.slice(0, 5).map((batch: any, idx: number) => (
                              <div key={batch.batch_id || idx} className="flex items-center justify-between text-xs">
                                <span className="text-gray-600">
                                  Batch {batch.batch_index !== undefined ? batch.batch_index + 1 : idx + 1}
                                </span>
                                <span className={`px-2 py-0.5 rounded ${
                                  batch.status === 'completed' ? 'bg-green-100 text-green-800' :
                                  batch.status === 'processing' ? 'bg-blue-100 text-blue-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {batch.status} ({batch.completed_count || 0}/{batch.tasks_count || batch.chunks_count || 0})
                                </span>
                              </div>
                            ))}
                            {job.batches.length > 5 && (
                              <div className="text-xs text-gray-500">... and {job.batches.length - 5} more</div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Execution Metrics for completed/failed active jobs */}
                      {job.job_metrics && (job.status === 'completed' || job.status === 'failed') && (
                        <div className="mt-4 pt-4 border-t border-gray-200">
                          <div className="text-xs font-semibold text-gray-700 mb-2">Execution Metrics</div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            {job.job_metrics.execution_time_sec !== undefined && (
                              <div>
                                <span className="text-gray-500">Execution Time:</span>
                                <span className="ml-1 font-semibold">{job.job_metrics.execution_time_sec.toFixed(2)}s</span>
                              </div>
                            )}
                            {job.job_metrics.overall_throughput_chunks_per_sec !== undefined && (
                              <div>
                                <span className="text-gray-500">Throughput:</span>
                                <span className="ml-1 font-semibold">{job.job_metrics.overall_throughput_chunks_per_sec.toFixed(2)} chunks/s</span>
                              </div>
                            )}
                            {job.job_metrics.success_rate !== undefined && (
                              <div>
                                <span className="text-gray-500">Success Rate:</span>
                                <span className={`ml-1 font-semibold ${job.job_metrics.success_rate >= 0.95 ? 'text-green-600' : job.job_metrics.success_rate >= 0.8 ? 'text-yellow-600' : 'text-red-600'}`}>
                                  {(job.job_metrics.success_rate * 100).toFixed(1)}%
                                </span>
                              </div>
                            )}
                            {job.job_metrics.avg_batch_execution_time_sec !== undefined && (
                              <div>
                                <span className="text-gray-500">Avg Batch Time:</span>
                                <span className="ml-1 font-semibold">{job.job_metrics.avg_batch_execution_time_sec.toFixed(2)}s</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}

            {/* Completed Jobs Summary */}
            {(completedJobs.length > 0 || failedJobs.length > 0) && (
              <>
                {(completedJobs.length > 0 || failedJobs.length > 0) && activeJobs.length > 0 && (
                  <div className="border-t border-gray-300 my-4 pt-4">
                    <div className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
                      Completed Jobs ({completedJobs.length + failedJobs.length})
                    </div>
                  </div>
                )}
                {[...completedJobs, ...failedJobs].map((job) => {
                  const progress = job.total_chunks > 0 
                    ? (job.completed_chunks / job.total_chunks) * 100 
                    : 0;
                  const metrics = job.job_metrics;

                  return (
                    <div key={job.job_id} className={`border rounded-lg p-3 bg-white ${
                      job.status === 'completed' ? 'border-green-200 bg-green-50' :
                      job.status === 'failed' ? 'border-red-200 bg-red-50' :
                      'border-gray-200'
                    }`}>
                      {/* Compact Summary */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-gray-600">{job.job_id.substring(0, 12)}...</span>
                            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                              job.status === 'completed' ? 'bg-green-100 text-green-800' :
                              job.status === 'failed' ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {job.status}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-4 text-xs text-gray-600">
                            <span>{job.completed_chunks}/{job.total_chunks} chunks</span>
                            <span>{job.completed_batches || 0}/{job.total_batches} batches</span>
                            {job.end_time && (
                              <span className="text-gray-500">
                                Completed: {new Date(job.end_time * 1000).toLocaleTimeString()}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-xs text-gray-500">
                          {progress.toFixed(0)}%
                        </div>
                      </div>
                      
                      {/* Execution Metrics */}
                      {metrics && (metrics.status === 'completed' || metrics.status === 'failed') && (
                        <div className="mt-2 pt-2 border-t border-gray-200">
                          <div className="text-xs font-semibold text-gray-700 mb-1">Execution Metrics</div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            {metrics.execution_time_sec !== undefined && (
                              <div>
                                <span className="text-gray-500">Execution Time:</span>
                                <span className="ml-1 font-semibold">{metrics.execution_time_sec.toFixed(2)}s</span>
                              </div>
                            )}
                            {metrics.overall_throughput_chunks_per_sec !== undefined && (
                              <div>
                                <span className="text-gray-500">Throughput:</span>
                                <span className="ml-1 font-semibold">{metrics.overall_throughput_chunks_per_sec.toFixed(2)} chunks/s</span>
                              </div>
                            )}
                            {metrics.success_rate !== undefined && (
                              <div>
                                <span className="text-gray-500">Success Rate:</span>
                                <span className={`ml-1 font-semibold ${metrics.success_rate >= 0.95 ? 'text-green-600' : metrics.success_rate >= 0.8 ? 'text-yellow-600' : 'text-red-600'}`}>
                                  {(metrics.success_rate * 100).toFixed(1)}%
                                </span>
                              </div>
                            )}
                            {metrics.avg_batch_execution_time_sec !== undefined && (
                              <div>
                                <span className="text-gray-500">Avg Batch Time:</span>
                                <span className="ml-1 font-semibold">{metrics.avg_batch_execution_time_sec.toFixed(2)}s</span>
                              </div>
                            )}
                            {metrics.avg_batch_size !== undefined && (
                              <div>
                                <span className="text-gray-500">Avg Batch Size:</span>
                                <span className="ml-1 font-semibold">{metrics.avg_batch_size.toFixed(1)}</span>
                              </div>
                            )}
                            {metrics.min_batch_execution_time_sec !== undefined && metrics.max_batch_execution_time_sec !== undefined && (
                              <div>
                                <span className="text-gray-500">Batch Time Range:</span>
                                <span className="ml-1 font-semibold">
                                  {metrics.min_batch_execution_time_sec.toFixed(2)}s - {metrics.max_batch_execution_time_sec.toFixed(2)}s
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {/* Updates Log */}
        {state.updates.length > 0 && (
          <div className="mt-6 border-t border-gray-200 pt-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              Recent Updates ({state.updates.length})
            </h3>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {state.updates.slice(0, 20).map((update) => (
                <div key={update.id} className="text-xs font-mono bg-gray-50 p-2 rounded">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">{new Date(update.timestamp).toLocaleTimeString()}</span>
                    <span className="text-blue-600">{update.job_id.substring(0, 8)}</span>
                    <span className="text-gray-700">{update.status}</span>
                    <span className="text-gray-500">
                      {update.payload.completed_chunks}/{update.payload.total_chunks} chunks
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
