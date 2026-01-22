/**
 * Embedding Progress Component (Refactored)
 * Shows progress for current job and auto-hides when completed
 * Uses JobContext for state management
 */

import React, { useEffect, useState } from 'react';
import { useJobs } from '../contexts/JobContext';

export const EmbeddingProgress: React.FC = () => {
  const { getCurrentJob } = useJobs();
  const [shouldShow, setShouldShow] = useState(true);
  const currentJob = getCurrentJob();

  // Auto-hide when job completes
  useEffect(() => {
    if (currentJob?.status === 'completed' || currentJob?.status === 'failed') {
      // Hide after 3 seconds when completed
      const timer = setTimeout(() => {
        setShouldShow(false);
      }, 3000);
      return () => clearTimeout(timer);
    } else if (currentJob) {
      // Show when there's an active job
      setShouldShow(true);
    } else {
      // Hide when no current job
      setShouldShow(false);
    }
  }, [currentJob?.status, currentJob]);

  if (!currentJob || !shouldShow) {
    return null;
  }

  const { metrics } = currentJob;
  const progress = metrics.total_chunks && metrics.total_chunks > 0
    ? ((metrics.completed_chunks || 0) / metrics.total_chunks) * 100
    : 0;

  return (
    <div className="fixed bottom-4 right-4 bg-white border border-gray-300 rounded-lg shadow-lg p-4 min-w-[300px] z-50">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">Embedding Progress</span>
        </div>
        <span className={`text-xs px-2 py-1 rounded ${
          currentJob.status === 'processing' ? 'bg-blue-100 text-blue-800' :
          currentJob.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
          currentJob.status === 'completed' ? 'bg-green-100 text-green-800' :
          'bg-red-100 text-red-800'
        }`}>
          {currentJob.status}
        </span>
      </div>
      
      <div className="mb-2">
        <div className="flex justify-between text-xs text-gray-600 mb-1">
          <span>{metrics.completed_chunks || 0} / {metrics.total_chunks || 0} chunks</span>
          <span>{progress.toFixed(1)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all duration-300 ${
              currentJob.status === 'completed' ? 'bg-green-500' :
              currentJob.status === 'failed' ? 'bg-red-500' :
              'bg-blue-500'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {metrics.total_batches && metrics.total_batches > 0 && (
        <div className="text-xs text-gray-500">
          {metrics.completed_batches || 0} / {metrics.total_batches} batches
        </div>
      )}

      {metrics.failed_chunks && metrics.failed_chunks > 0 && (
        <div className="text-xs text-red-600 mt-1">
          {metrics.failed_chunks} failed
        </div>
      )}
    </div>
  );
};
