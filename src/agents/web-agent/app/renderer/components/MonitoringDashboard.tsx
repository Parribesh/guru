/**
 * Comprehensive Monitoring Dashboard (Refactored)
 * Uses JobContext and QueueContext for state management
 */

import React, { useState, useMemo } from 'react';
import { useJobs, JobState } from '../contexts/JobContext';
import { useQueue } from '../contexts/QueueContext';

type FilterType = 'all' | 'active' | 'completed' | 'failed';

export const MonitoringDashboard: React.FC = () => {
  const { state, getAllJobs, getJob, dispatch, deleteJob, refreshJobs } = useJobs();
  const { status: queueStatus, isConnected: queueConnected } = useQueue();
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  // Compute statistics from job state
  const stats = useMemo(() => {
    const jobsList = getAllJobs();
    const completedJobs = jobsList.filter(j => j.status === 'completed');
    const failedJobs = jobsList.filter(j => j.status === 'failed');
    const activeJobs = jobsList.filter(j => j.status !== 'completed' && j.status !== 'failed');

    const totalExecutionTime = completedJobs.reduce((sum, j) => sum + (j.metrics.execution_time_sec || 0), 0);
    const totalChunks = completedJobs.reduce((sum, j) => sum + (j.metrics.total_chunks || 0), 0);
    const totalBatches = completedJobs.reduce((sum, j) => sum + (j.metrics.total_batches || 0), 0);
    const avgThroughput = completedJobs.length > 0
      ? completedJobs.reduce((sum, j) => sum + (j.metrics.overall_throughput_chunks_per_sec || 0), 0) / completedJobs.length
      : 0;
    const avgSuccessRate = completedJobs.length > 0
      ? completedJobs.reduce((sum, j) => sum + (j.metrics.success_rate || 0), 0) / completedJobs.length
      : 0;

    return {
      total: jobsList.length,
      active: activeJobs.length,
      completed: completedJobs.length,
      failed: failedJobs.length,
      totalExecutionTime,
      totalChunks,
      totalBatches,
      avgThroughput,
      avgSuccessRate,
    };
  }, [getAllJobs]);

  // Filter jobs by status
  const filteredJobs = useMemo(() => {
    const jobsList = getAllJobs().sort((a, b) => b.lastUpdated - a.lastUpdated);
    
    switch (filter) {
      case 'active':
        return jobsList.filter(j => j.status !== 'completed' && j.status !== 'failed');
      case 'completed':
        return jobsList.filter(j => j.status === 'completed');
      case 'failed':
        return jobsList.filter(j => j.status === 'failed');
      default:
        return jobsList;
    }
  }, [getAllJobs, filter]);

  const selectedJob = selectedJobId ? getJob(selectedJobId) : null;

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
      case 'completed': return 'bg-green-100 text-green-800 border-green-200';
      case 'failed': return 'bg-red-100 text-red-800 border-red-200';
      case 'processing': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header with Stats */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-gray-900">Monitoring Dashboard</h1>
            <div className="flex gap-2">
              <button
                onClick={refreshJobs}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
              >
                Refresh
              </button>
              <button
                onClick={() => {
                  dispatch({ type: 'CLEAR_JOBS' });
                  setSelectedJobId(null);
                }}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm font-medium"
              >
                Clear View
              </button>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="text-xs font-medium text-blue-600 mb-1">Total Jobs</div>
              <div className="text-2xl font-bold text-blue-900">{stats.total}</div>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <div className="text-xs font-medium text-yellow-600 mb-1">Active</div>
              <div className="text-2xl font-bold text-yellow-900">{stats.active}</div>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="text-xs font-medium text-green-600 mb-1">Completed</div>
              <div className="text-2xl font-bold text-green-900">{stats.completed}</div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <div className="text-xs font-medium text-red-600 mb-1">Failed</div>
              <div className="text-2xl font-bold text-red-900">{stats.failed}</div>
            </div>
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
              <div className="text-xs font-medium text-purple-600 mb-1">Avg Throughput</div>
              <div className="text-lg font-bold text-purple-900">{formatNumber(stats.avgThroughput)} chunks/s</div>
            </div>
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
              <div className="text-xs font-medium text-indigo-600 mb-1">Avg Success Rate</div>
              <div className="text-lg font-bold text-indigo-900">{formatPercentage(stats.avgSuccessRate)}</div>
            </div>
            {queueStatus && (
              <div className="bg-teal-50 border border-teal-200 rounded-lg p-3">
                <div className="text-xs font-medium text-teal-600 mb-1">Queue</div>
                <div className="text-lg font-bold text-teal-900">
                  {(queueStatus.pending || 0) + (queueStatus.processing || 0)} / {queueStatus.total || 0}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex border-t border-gray-200">
          {(['all', 'active', 'completed', 'failed'] as FilterType[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                filter === f
                  ? 'border-blue-500 text-blue-600 bg-blue-50'
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)} ({f === 'all' ? stats.total : f === 'active' ? stats.active : f === 'completed' ? stats.completed : stats.failed})
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Jobs List */}
        <div className="w-1/2 border-r border-gray-200 bg-white overflow-y-auto">
          <div className="p-4 space-y-3">
            {filteredJobs.length === 0 ? (
              <div className="text-center text-gray-500 py-12">
                <p>No jobs found</p>
                <p className="text-sm mt-2">Waiting for events...</p>
              </div>
            ) : (
              filteredJobs.map((entry) => {
                const m = entry.metrics;
                const isSelected = selectedJobId === entry.job_id;
                const progress = m.total_chunks && m.total_chunks > 0
                  ? ((m.completed_chunks || 0) / m.total_chunks) * 100
                  : 0;

                return (
                  <div
                    key={entry.job_id}
                    onClick={() => setSelectedJobId(entry.job_id)}
                    className={`border rounded-lg p-4 cursor-pointer transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50 shadow-md'
                        : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-sm font-semibold text-gray-800 truncate">
                            {entry.job_id.substring(0, 8)}...
                          </span>
                          <span className={`px-2 py-1 rounded text-xs font-medium border ${getStatusColor(entry.status)}`}>
                            {entry.status}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500">
                          Updated: {formatTimestamp(entry.lastUpdated)}
                          {entry.firstSeen !== entry.lastUpdated && (
                            <span className="ml-2">• First seen: {formatTimestamp(entry.firstSeen)}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    {m.total_chunks !== undefined && m.total_chunks > 0 && (
                      <div className="mb-2">
                        <div className="flex justify-between text-xs text-gray-600 mb-1">
                          <span>{m.completed_chunks || 0} / {m.total_chunks} chunks</span>
                          <span>{progress.toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full ${
                              entry.status === 'completed' ? 'bg-green-500' :
                              entry.status === 'failed' ? 'bg-red-500' :
                              'bg-blue-500'
                            }`}
                            style={{ width: `${Math.min(progress, 100)}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Quick Metrics */}
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      {m.execution_time_sec !== undefined && (
                        <div className="text-gray-600">
                          <span className="font-medium">Time:</span> {formatNumber(m.execution_time_sec)}s
                        </div>
                      )}
                      {m.overall_throughput_chunks_per_sec !== undefined && (
                        <div className="text-gray-600">
                          <span className="font-medium">Throughput:</span> {formatNumber(m.overall_throughput_chunks_per_sec)}/s
                        </div>
                      )}
                      {m.success_rate !== undefined && (
                        <div className="text-gray-600">
                          <span className="font-medium">Success:</span> {formatPercentage(m.success_rate)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Detail Panel */}
        <div className="w-1/2 bg-white overflow-y-auto">
          {selectedJob ? (
            <div className="p-6">
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-gray-900">Job Details</h2>
                  <span className={`px-3 py-1 rounded-lg text-sm font-medium border ${getStatusColor(selectedJob.status)}`}>
                    {selectedJob.status}
                  </span>
                </div>
                <div className="font-mono text-sm text-gray-600 bg-gray-50 p-2 rounded mb-2">
                  {selectedJob.job_id}
                </div>
                <div className="text-xs text-gray-500">
                  First seen: {formatTimestamp(selectedJob.firstSeen)} • 
                  Last updated: {formatTimestamp(selectedJob.lastUpdated)} • 
                  Updates: {selectedJob.updates.length}
                </div>
              </div>

              {/* Job Updates Timeline */}
              {selectedJob.updates.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Updates</h3>
                  <div className="bg-gray-50 rounded-lg p-4 max-h-48 overflow-y-auto">
                    <div className="space-y-2">
                      {selectedJob.updates.slice(0, 10).map((update, idx) => (
                        <div key={idx} className="flex items-start gap-3 text-xs">
                          <div className="flex-shrink-0 w-20 text-gray-500">
                            {formatTimestamp(update.timestamp)}
                          </div>
                          <div className="flex-1">
                            <span className={`px-2 py-1 rounded text-xs font-medium border ${getStatusColor(update.status)}`}>
                              {update.status}
                            </span>
                            {update.payload.completed_chunks !== undefined && (
                              <span className="ml-2 text-gray-600">
                                {update.payload.completed_chunks} / {update.payload.total_chunks || 0} chunks
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Execution Metrics */}
              {/* Delete Button */}
              <div className="mb-6 flex justify-end">
                <button
                  onClick={async () => {
                    if (selectedJob && await deleteJob(selectedJob.job_id)) {
                      setSelectedJobId(null);
                    }
                  }}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium"
                >
                  Delete Job
                </button>
              </div>

              {/* Execution Metrics */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Execution Metrics</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-xs font-medium text-gray-500 mb-1">Execution Time</div>
                    <div className="text-2xl font-bold text-gray-900">
                      {formatNumber(selectedJob.metrics.execution_time_sec)}s
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-xs font-medium text-gray-500 mb-1">Throughput</div>
                    <div className="text-2xl font-bold text-gray-900">
                      {formatNumber(selectedJob.metrics.overall_throughput_chunks_per_sec)} chunks/s
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-xs font-medium text-gray-500 mb-1">Success Rate</div>
                    <div className={`text-2xl font-bold ${
                      (selectedJob.metrics.success_rate ?? 0) >= 0.95 ? 'text-green-600' :
                      (selectedJob.metrics.success_rate ?? 0) >= 0.80 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {formatPercentage(selectedJob.metrics.success_rate)}
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-xs font-medium text-gray-500 mb-1">Avg Batch Time</div>
                    <div className="text-2xl font-bold text-gray-900">
                      {formatNumber(selectedJob.metrics.avg_batch_execution_time_sec)}s
                    </div>
                  </div>
                </div>
              </div>

              {/* Chunk & Batch Stats */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Chunk & Batch Statistics</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-xs font-medium text-gray-500 mb-2">Chunks</div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Total:</span>
                        <span className="font-semibold">{selectedJob.metrics.total_chunks ?? 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Completed:</span>
                        <span className="font-semibold text-green-600">{selectedJob.metrics.completed_chunks ?? 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Failed:</span>
                        <span className="font-semibold text-red-600">{selectedJob.metrics.failed_chunks ?? 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Pending:</span>
                        <span className="font-semibold text-yellow-600">{selectedJob.metrics.pending_chunks ?? 0}</span>
                      </div>
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-xs font-medium text-gray-500 mb-2">Batches</div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Total:</span>
                        <span className="font-semibold">{selectedJob.metrics.total_batches ?? 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Completed:</span>
                        <span className="font-semibold text-green-600">{selectedJob.metrics.completed_batches ?? 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Failed:</span>
                        <span className="font-semibold text-red-600">{selectedJob.metrics.failed_batches ?? 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Processing:</span>
                        <span className="font-semibold text-blue-600">{selectedJob.metrics.processing_batches ?? 0}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Batch Details */}
              {(selectedJob.metrics.avg_batch_size !== undefined || selectedJob.metrics.avg_batch_execution_time_sec !== undefined) && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Batch Details</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {selectedJob.metrics.avg_batch_size !== undefined && (
                      <div className="bg-gray-50 rounded-lg p-4">
                        <div className="text-xs font-medium text-gray-500 mb-1">Batch Size</div>
                        <div className="text-lg font-bold text-gray-900">
                          Avg: {formatNumber(selectedJob.metrics.avg_batch_size, 0)}
                          {selectedJob.metrics.min_batch_size !== undefined && selectedJob.metrics.max_batch_size !== undefined && (
                            <span className="text-sm font-normal text-gray-600 ml-2">
                              (min: {selectedJob.metrics.min_batch_size}, max: {selectedJob.metrics.max_batch_size})
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    {selectedJob.metrics.min_batch_execution_time_sec !== undefined && selectedJob.metrics.max_batch_execution_time_sec !== undefined && (
                      <div className="bg-gray-50 rounded-lg p-4">
                        <div className="text-xs font-medium text-gray-500 mb-1">Batch Time Range</div>
                        <div className="text-lg font-bold text-gray-900">
                          {formatNumber(selectedJob.metrics.min_batch_execution_time_sec)}s - {formatNumber(selectedJob.metrics.max_batch_execution_time_sec)}s
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Timestamps */}
              {(selectedJob.metrics.start_time || selectedJob.metrics.end_time) && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Timestamps</h3>
                  <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
                    {selectedJob.metrics.created_at && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Created:</span>
                        <span className="font-mono text-gray-900">{formatTimestamp(selectedJob.metrics.created_at)}</span>
                      </div>
                    )}
                    {selectedJob.metrics.start_time && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Started:</span>
                        <span className="font-mono text-gray-900">{formatTimestamp(selectedJob.metrics.start_time)}</span>
                      </div>
                    )}
                    {selectedJob.metrics.end_time && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Ended:</span>
                        <span className="font-mono text-gray-900">{formatTimestamp(selectedJob.metrics.end_time)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Batches List */}
              {selectedJob.metrics.batches && selectedJob.metrics.batches.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Batches</h3>
                  <div className="bg-gray-50 rounded-lg p-4 max-h-64 overflow-y-auto">
                    <div className="space-y-2">
                      {selectedJob.metrics.batches.map((batch: any, idx: number) => (
                        <div key={batch.batch_id || idx} className="bg-white rounded p-3 border border-gray-200">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-mono text-xs font-medium text-gray-700">
                              {batch.batch_id || `Batch ${idx + 1}`}
                            </span>
                            <span className={`px-2 py-1 rounded text-xs font-medium border ${getStatusColor(batch.status)}`}>
                              {batch.status}
                            </span>
                          </div>
                          {(batch.tasks_count !== undefined || batch.chunks_count !== undefined) && (
                            <div className="text-xs text-gray-600">
                              {batch.completed_count || 0} / {batch.tasks_count || batch.chunks_count || 0} tasks
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Full JSON */}
              <details className="mt-6">
                <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900 mb-2">
                  View Raw JSON
                </summary>
                <pre className="p-4 bg-gray-900 text-gray-100 rounded-lg text-xs overflow-x-auto">
                  {JSON.stringify(selectedJob, null, 2)}
                </pre>
              </details>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <p className="text-lg mb-2">No job selected</p>
                <p className="text-sm">Select a job from the list to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

