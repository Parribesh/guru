/**
 * Session Progress Bar Component (Refactored)
 * Shows progress for current job with expandable details
 * Uses JobContext - does NOT auto-hide (shows summary when completed)
 */

import React, { useState } from 'react';
import { useJobs } from '../contexts/JobContext';

export const SessionProgressBar: React.FC = () => {
  const { getCurrentJob } = useJobs();
  const [isExpanded, setIsExpanded] = useState(false);
  const currentJob = getCurrentJob();

  if (!currentJob) {
    return null;
  }

  const { metrics, status } = currentJob;
  const progress = metrics.total_chunks && metrics.total_chunks > 0
    ? ((metrics.completed_chunks || 0) / metrics.total_chunks) * 100
    : 0;

  const isCompleted = status === 'completed' || status === 'failed';

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  return (
    <div className={`border-b border-gray-200 bg-white ${isCompleted ? 'bg-gray-50' : ''}`}>
      {/* Compact Progress Bar */}
      <div 
        className="px-4 py-2 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-700">
              {isCompleted ? 'Embedding Complete' : 'Embedding Progress'}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded ${
              status === 'processing' ? 'bg-blue-100 text-blue-800' :
              status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
              status === 'completed' ? 'bg-green-100 text-green-800' :
              status === 'failed' ? 'bg-red-100 text-red-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {status}
            </span>
          </div>
          <div className="text-xs text-gray-500">
            {metrics.completed_chunks || 0} / {metrics.total_chunks || 0} chunks
            {isCompleted && metrics.end_time && (
              <span className="ml-2">• {formatTime(metrics.end_time)}</span>
            )}
            {isExpanded ? ' ▼' : ' ▶'}
          </div>
        </div>
        
        <div className="w-full bg-gray-200 rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full transition-all duration-300 ${
              status === 'completed' ? 'bg-green-500' :
              status === 'failed' ? 'bg-red-500' :
              'bg-blue-500'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
        
        {/* Summary for completed jobs */}
        {isCompleted && (
          <div className="mt-2 text-xs text-gray-600">
            {status === 'completed' && (
              <span className="text-green-700">
                ✅ Completed {metrics.total_chunks || 0} chunks in {metrics.total_batches || 0} batches
              </span>
            )}
            {status === 'failed' && (
              <span className="text-red-700">
                ❌ Failed: {metrics.failed_chunks || 0} chunks failed
              </span>
            )}
          </div>
        )}
      </div>

      {/* Expanded Updates List */}
      {isExpanded && (
        <div className="border-t border-gray-200 bg-gray-50 max-h-64 overflow-y-auto">
          <div className="px-4 py-2">
            <div className="text-xs font-semibold text-gray-700 mb-2">Recent Updates</div>
            <div className="space-y-1">
              {currentJob.updates.length === 0 ? (
                <div className="text-xs text-gray-500 py-2">No updates yet</div>
              ) : (
                currentJob.updates.slice(0, 20).map((update, idx) => (
                  <div 
                    key={idx}
                    className="text-xs bg-white rounded px-2 py-1 border border-gray-200"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-gray-700">
                        {formatTime(update.timestamp)}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-xs ${
                        update.status === 'processing' ? 'bg-blue-100 text-blue-800' :
                        update.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        update.status === 'completed' ? 'bg-green-100 text-green-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {update.status}
                      </span>
                    </div>
                    <div className="text-gray-600">
                      {update.payload.completed_chunks || 0} / {update.payload.total_chunks || 0} chunks
                      {update.payload.completed_batches !== undefined && (
                        <span className="ml-2">
                          • {update.payload.completed_batches} / {update.payload.total_batches || 0} batches
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
