/**
 * Job Context - Centralized state management for all embedding jobs
 * Uses reducer pattern for predictable state updates
 */

import React, { createContext, useContext, useReducer, useCallback, useEffect, ReactNode } from 'react';

export interface JobMetrics {
  job_id?: string;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
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
  batches?: Array<{
    batch_id: string;
    status: string;
    tasks_count?: number;
    completed_count?: number;
    chunks_count?: number;
  }>;
}

export interface JobState {
  job_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  metrics: JobMetrics;
  firstSeen: number;
  lastUpdated: number;
  updates: Array<{
    timestamp: number;
    status: string;
    payload: any;
  }>;
}

interface JobsState {
  jobs: Map<string, JobState>;
  currentJobId: string | null; // Currently active job in session view
}

type JobAction =
  | { type: 'JOB_STARTED'; payload: { jobId: string; createdAt?: number } }
  | { type: 'JOB_STATUS_UPDATE'; payload: { jobId: string; statusUpdate: Partial<JobMetrics> } }
  | { type: 'JOB_COMPLETE'; payload: { jobId: string; metrics: Partial<JobMetrics> } }
  | { type: 'SET_CURRENT_JOB'; payload: { jobId: string | null } }
  | { type: 'CLEAR_JOBS' }
  | { type: 'LOAD_JOBS'; payload: { jobs: Map<string, JobState> } }
  | { type: 'DELETE_JOB'; payload: { jobId: string } };

const initialState: JobsState = {
  jobs: new Map(),
  currentJobId: null,
};

// Convert API job to JobState
const apiJobToJobState = (apiJob: any): JobState => {
  const now = Date.now();
  
  // Extract all metrics - they can be at root level or in job_metrics
  const jobMetrics = apiJob.job_metrics || {};
  
  return {
    job_id: apiJob.job_id,
    status: (apiJob.status || 'pending') as 'pending' | 'processing' | 'completed' | 'failed',
    metrics: {
      job_id: apiJob.job_id,
      status: apiJob.status,
      created_at: apiJob.created_at || (apiJob.createdAt ? new Date(apiJob.createdAt).getTime() : undefined),
      start_time: apiJob.started_at || (apiJob.start_time ? new Date(apiJob.start_time).getTime() : undefined),
      end_time: apiJob.completed_at || (apiJob.end_time ? new Date(apiJob.end_time).getTime() : undefined),
      duration_ms: apiJob.duration_ms || apiJob.duration,
      execution_time_sec: apiJob.execution_time_sec ?? jobMetrics.execution_time_sec,
      report_generated_at: apiJob.report_generated_at ?? jobMetrics.report_generated_at,
      total_chunks: apiJob.total_chunks ?? jobMetrics.total_chunks,
      completed_chunks: apiJob.completed_chunks ?? jobMetrics.completed_chunks,
      failed_chunks: apiJob.failed_chunks ?? jobMetrics.failed_chunks,
      pending_chunks: apiJob.pending_chunks ?? jobMetrics.pending_chunks,
      total_batches: apiJob.total_batches ?? jobMetrics.total_batches,
      completed_batches: apiJob.completed_batches ?? jobMetrics.completed_batches,
      failed_batches: apiJob.failed_batches ?? jobMetrics.failed_batches,
      processing_batches: apiJob.processing_batches ?? jobMetrics.processing_batches,
      pending_batches: apiJob.pending_batches ?? jobMetrics.pending_batches,
      avg_batch_size: apiJob.avg_batch_size ?? jobMetrics.avg_batch_size,
      min_batch_size: apiJob.min_batch_size ?? jobMetrics.min_batch_size,
      max_batch_size: apiJob.max_batch_size ?? jobMetrics.max_batch_size,
      success_rate: apiJob.success_rate ?? jobMetrics.success_rate,
      overall_throughput_chunks_per_sec: apiJob.overall_throughput_chunks_per_sec ?? jobMetrics.overall_throughput_chunks_per_sec,
      avg_batch_execution_time_sec: apiJob.avg_batch_execution_time_sec ?? jobMetrics.avg_batch_execution_time_sec,
      min_batch_execution_time_sec: apiJob.min_batch_execution_time_sec ?? jobMetrics.min_batch_execution_time_sec,
      max_batch_execution_time_sec: apiJob.max_batch_execution_time_sec ?? jobMetrics.max_batch_execution_time_sec,
      batch_metrics: apiJob.batch_metrics || jobMetrics.batch_metrics,
      batches: apiJob.batches || jobMetrics.batches,
      // Merge any remaining fields from job_metrics
      ...Object.fromEntries(
        Object.entries(jobMetrics).filter(([key]) => 
          !['execution_time_sec', 'report_generated_at', 'total_chunks', 'completed_chunks', 
            'failed_chunks', 'pending_chunks', 'total_batches', 'completed_batches', 
            'failed_batches', 'processing_batches', 'pending_batches', 'avg_batch_size',
            'min_batch_size', 'max_batch_size', 'success_rate', 'overall_throughput_chunks_per_sec',
            'avg_batch_execution_time_sec', 'min_batch_execution_time_sec', 
            'max_batch_execution_time_sec', 'batch_metrics', 'batches'].includes(key)
        )
      ),
    },
    firstSeen: apiJob.created_at || now,
    lastUpdated: apiJob.completed_at || apiJob.started_at || apiJob.created_at || now,
    updates: [],
  };
};

function jobsReducer(state: JobsState, action: JobAction): JobsState {
  switch (action.type) {
    case 'JOB_STARTED': {
      const { jobId, createdAt } = action.payload;
      const now = Date.now();
      const updated = new Map(state.jobs);

      if (!updated.has(jobId)) {
        updated.set(jobId, {
          job_id: jobId,
          status: 'pending',
          metrics: {
            job_id: jobId,
            status: 'pending',
            created_at: createdAt || now,
          },
          firstSeen: now,
          lastUpdated: now,
          updates: [{
            timestamp: now,
            status: 'pending',
            payload: { created_at: createdAt || now },
          }],
        });
        console.log(`[JobContext] Created new job: ${jobId}`);
      }

      return { ...state, jobs: updated };
    }

    case 'JOB_STATUS_UPDATE': {
      const { jobId, statusUpdate } = action.payload;
      const updated = new Map(state.jobs);
      const existing = updated.get(jobId);
      const now = Date.now();

      if (!existing) {
        // Create job if it doesn't exist
        updated.set(jobId, {
          job_id: jobId,
          status: (statusUpdate.status || 'pending') as 'pending' | 'processing' | 'completed' | 'failed',
          metrics: {
            job_id: jobId,
            ...statusUpdate,
          },
          firstSeen: now,
          lastUpdated: now,
          updates: [{
            timestamp: now,
            status: statusUpdate.status || 'pending',
            payload: statusUpdate,
          }],
        });
      } else {
        // Merge metrics
        const mergedMetrics: JobMetrics = {
          job_id: jobId,
          status: statusUpdate.status ?? existing.metrics.status,
          created_at: statusUpdate.created_at ?? existing.metrics.created_at,
          start_time: statusUpdate.start_time ?? existing.metrics.start_time,
          end_time: statusUpdate.end_time ?? existing.metrics.end_time,
          duration_ms: statusUpdate.duration_ms ?? existing.metrics.duration_ms,
          execution_time_sec: statusUpdate.execution_time_sec ?? existing.metrics.execution_time_sec,
          report_generated_at: statusUpdate.report_generated_at ?? existing.metrics.report_generated_at,
          total_chunks: statusUpdate.total_chunks ?? existing.metrics.total_chunks,
          completed_chunks: statusUpdate.completed_chunks ?? existing.metrics.completed_chunks,
          failed_chunks: statusUpdate.failed_chunks ?? existing.metrics.failed_chunks,
          pending_chunks: statusUpdate.pending_chunks ?? existing.metrics.pending_chunks,
          total_batches: statusUpdate.total_batches ?? existing.metrics.total_batches,
          completed_batches: statusUpdate.completed_batches ?? existing.metrics.completed_batches,
          failed_batches: statusUpdate.failed_batches ?? existing.metrics.failed_batches,
          processing_batches: statusUpdate.processing_batches ?? existing.metrics.processing_batches,
          pending_batches: statusUpdate.pending_batches ?? existing.metrics.pending_batches,
          avg_batch_size: statusUpdate.avg_batch_size ?? existing.metrics.avg_batch_size,
          min_batch_size: statusUpdate.min_batch_size ?? existing.metrics.min_batch_size,
          max_batch_size: statusUpdate.max_batch_size ?? existing.metrics.max_batch_size,
          success_rate: statusUpdate.success_rate ?? existing.metrics.success_rate,
          overall_throughput_chunks_per_sec: statusUpdate.overall_throughput_chunks_per_sec ?? existing.metrics.overall_throughput_chunks_per_sec,
          avg_batch_execution_time_sec: statusUpdate.avg_batch_execution_time_sec ?? existing.metrics.avg_batch_execution_time_sec,
          min_batch_execution_time_sec: statusUpdate.min_batch_execution_time_sec ?? existing.metrics.min_batch_execution_time_sec,
          max_batch_execution_time_sec: statusUpdate.max_batch_execution_time_sec ?? existing.metrics.max_batch_execution_time_sec,
          batch_metrics: statusUpdate.batch_metrics || existing.metrics.batch_metrics,
          batches: statusUpdate.batches || existing.metrics.batches,
        };
        
        // Merge any additional job_metrics if they exist in the statusUpdate
        if (statusUpdate && typeof statusUpdate === 'object' && 'job_metrics' in statusUpdate) {
          const jobMetrics = (statusUpdate as any).job_metrics;
          if (jobMetrics && typeof jobMetrics === 'object') {
            Object.assign(mergedMetrics, jobMetrics);
          }
        }

        const finalStatus = statusUpdate.status || mergedMetrics.status || existing.status;
        
        if (finalStatus !== existing.status) {
          console.log(`[JobContext] Job ${jobId} status: ${existing.status} → ${finalStatus}`);
        }

        updated.set(jobId, {
          ...existing,
          status: finalStatus as 'pending' | 'processing' | 'completed' | 'failed',
          metrics: mergedMetrics,
          lastUpdated: now,
          updates: [
            {
              timestamp: now,
              status: finalStatus,
              payload: statusUpdate,
            },
            ...existing.updates,
          ].slice(0, 100),
        });
      }

      return { ...state, jobs: updated };
    }

    case 'JOB_COMPLETE': {
      const { jobId, metrics } = action.payload;
      const updated = new Map(state.jobs);
      const existing = updated.get(jobId);
      const now = Date.now();

      // Ensure completed_chunks equals total_chunks when job is completed
      const totalChunks = metrics.total_chunks ?? existing?.metrics.total_chunks ?? 0;
      const completedChunks = metrics.completed_chunks ?? existing?.metrics.completed_chunks ?? 0;
      
      // When job completes, ensure completed_chunks = total_chunks for 100% progress
      const finalCompletedChunks = metrics.status === 'completed' && totalChunks > 0
        ? totalChunks
        : completedChunks;

      const finalMetrics: JobMetrics = {
        ...existing?.metrics,
        ...metrics,
        status: 'completed',
        total_chunks: totalChunks,
        completed_chunks: finalCompletedChunks,
        end_time: metrics.end_time || now,
      };

      if (existing) {
        updated.set(jobId, {
          ...existing,
          status: 'completed',
          metrics: finalMetrics,
          lastUpdated: now,
          updates: [
            {
              timestamp: now,
              status: 'completed',
              payload: { ...metrics, completed_chunks: finalCompletedChunks },
            },
            ...existing.updates,
          ].slice(0, 100),
        });
      } else {
        updated.set(jobId, {
          job_id: jobId,
          status: 'completed',
          metrics: finalMetrics,
          firstSeen: now,
          lastUpdated: now,
          updates: [{
            timestamp: now,
            status: 'completed',
            payload: { ...metrics, completed_chunks: finalCompletedChunks },
          }],
        });
      }

      console.log(`[JobContext] Job ${jobId} marked as completed: ${finalCompletedChunks}/${totalChunks} chunks`);
      return { ...state, jobs: updated };
    }

    case 'SET_CURRENT_JOB':
      return { ...state, currentJobId: action.payload.jobId };

    case 'CLEAR_JOBS':
      return { ...state, jobs: new Map(), currentJobId: null };

    case 'LOAD_JOBS':
      return { ...state, jobs: action.payload.jobs };

    case 'DELETE_JOB': {
      const { jobId } = action.payload;
      const updated = new Map(state.jobs);
      updated.delete(jobId);
      if (state.currentJobId === jobId) {
        return { ...state, jobs: updated, currentJobId: null };
      }
      return { ...state, jobs: updated };
    }

    default:
      return state;
  }
}

interface JobContextType {
  state: JobsState;
  dispatch: React.Dispatch<JobAction>;
  getJob: (jobId: string) => JobState | undefined;
  getCurrentJob: () => JobState | undefined;
  getJobsByStatus: (status: 'pending' | 'processing' | 'completed' | 'failed') => JobState[];
  getAllJobs: () => JobState[];
  deleteJob: (jobId: string) => Promise<boolean>;
  refreshJobs: () => Promise<void>;
}

const JobContext = createContext<JobContextType | undefined>(undefined);

export function JobProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(jobsReducer, initialState);

  // Load jobs from API on mount and periodically refresh
  const loadJobsFromAPI = useCallback(async () => {
    try {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.jobs?.list) {
        console.error('[JobContext] electronAPI.jobs.list not available');
        return;
      }

      const result = await electronAPI.jobs.list(100); // Load up to 100 jobs
      if (result?.success && Array.isArray(result.data)) {
        const jobsMap = new Map<string, JobState>();
        result.data.forEach((apiJob: any) => {
          const jobState = apiJobToJobState(apiJob);
          jobsMap.set(apiJob.job_id, jobState);
        });
        dispatch({ type: 'LOAD_JOBS', payload: { jobs: jobsMap } });
        console.log(`[JobContext] Loaded ${jobsMap.size} jobs from API`);
      }
    } catch (error) {
      console.error('[JobContext] Error loading jobs from API:', error);
    }
  }, []);

  // Initial load on mount
  useEffect(() => {
    loadJobsFromAPI();
    
    // Refresh jobs every 30 seconds
    const interval = setInterval(loadJobsFromAPI, 30000);
    return () => clearInterval(interval);
  }, [loadJobsFromAPI]);

  // Listen to embedding service events
  useEffect(() => {
    const electronAPI = (window as any).electronAPI;
    
    if (!electronAPI?.on) {
      console.error('[JobContext] electronAPI.on not available');
      return;
    }

    const handleEvent = (eventData: any) => {
      try {
        // Handle job_started
        if (eventData.type === 'job_started') {
          const jobId = eventData.jobId || eventData.job_id || eventData.payload?.jobId || eventData.payload?.job_id;
          if (jobId) {
            dispatch({
              type: 'JOB_STARTED',
              payload: { jobId, createdAt: Date.now() },
            });
            dispatch({ type: 'SET_CURRENT_JOB', payload: { jobId } });
          }
          return;
        }

        // Handle job_complete
        if (eventData.type === 'job_complete') {
          const stats = eventData.stats || eventData.payload?.stats;
          const jobId = eventData.jobId || eventData.job_id || eventData.payload?.jobId || eventData.payload?.job_id;
          
          if (jobId) {
            const jobMetrics = stats?.job_metrics || stats || {};
            dispatch({
              type: 'JOB_COMPLETE',
              payload: {
                jobId,
                metrics: {
                  status: 'completed',
                  ...jobMetrics,
                },
              },
            });
          }
          return;
        }

        // Handle job_status_update
        // New contract: { type: 'job_status_update', payload: { job: {...}, queue: {...}, workers: {...} } }
        if (eventData.type === 'job_status_update') {
          const payload = eventData.payload || eventData;
          
          // Extract job state from payload.job (new contract) or fallback to old structure
          const jobState = payload.job || payload.jobStatus || payload;
          const jobId = jobState.jobId || jobState.job_id || payload.jobId || payload.job_id;
          
          if (!jobId) return;

          const jobStatus = jobState;
          const isCompleted = jobStatus.status === 'completed' || jobStatus.status === 'failed';
          
          // When status is completed, ensure completed_chunks = total_chunks for 100% progress
          const totalChunks = jobStatus.total_chunks;
          const completedChunks = isCompleted && totalChunks && totalChunks > 0
            ? totalChunks
            : jobStatus.completed_chunks;

          dispatch({
            type: 'JOB_STATUS_UPDATE',
            payload: {
              jobId,
              statusUpdate: {
                status: jobStatus.status || 'processing',
                created_at: jobStatus.created_at,
                start_time: jobStatus.start_time,
                end_time: jobStatus.end_time || (isCompleted ? Date.now() : undefined),
                duration_ms: jobStatus.duration_ms,
                execution_time_sec: jobStatus.execution_time_sec,
                report_generated_at: jobStatus.report_generated_at,
                total_chunks: totalChunks,
                completed_chunks: completedChunks,
                failed_chunks: jobStatus.failed_chunks,
                pending_chunks: jobStatus.pending_chunks,
                total_batches: jobStatus.total_batches,
                completed_batches: jobStatus.completed_batches,
                failed_batches: jobStatus.failed_batches,
                processing_batches: jobStatus.processing_batches,
                pending_batches: jobStatus.pending_batches,
                avg_batch_size: jobStatus.avg_batch_size,
                min_batch_size: jobStatus.min_batch_size,
                max_batch_size: jobStatus.max_batch_size,
                success_rate: jobStatus.success_rate,
                overall_throughput_chunks_per_sec: jobStatus.overall_throughput_chunks_per_sec,
                avg_batch_execution_time_sec: jobStatus.avg_batch_execution_time_sec,
                min_batch_execution_time_sec: jobStatus.min_batch_execution_time_sec,
                max_batch_execution_time_sec: jobStatus.max_batch_execution_time_sec,
                batch_metrics: jobStatus.batch_metrics,
                batches: jobStatus.batches,
                ...(jobStatus.job_metrics || {}),
              },
            },
          });
        }
      } catch (error: any) {
        console.error('[JobContext] Error processing event:', error);
      }
    };

    electronAPI.on('embedding-service:event', handleEvent);

    return () => {
      if (electronAPI?.off) {
        electronAPI.off('embedding-service:event', handleEvent);
      }
    };
  }, []);

  const getJob = useCallback((jobId: string) => {
    return state.jobs.get(jobId);
  }, [state.jobs]);

  const getCurrentJob = useCallback(() => {
    if (!state.currentJobId) return undefined;
    return state.jobs.get(state.currentJobId);
  }, [state.currentJobId, state.jobs]);

  const getJobsByStatus = useCallback((status: 'pending' | 'processing' | 'completed' | 'failed') => {
    return Array.from(state.jobs.values()).filter(job => job.status === status);
  }, [state.jobs]);

  const getAllJobs = useCallback(() => {
    return Array.from(state.jobs.values());
  }, [state.jobs]);

  const deleteJob = useCallback(async (jobId: string): Promise<boolean> => {
    try {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.jobs?.delete) {
        console.error('[JobContext] electronAPI.jobs.delete not available');
        return false;
      }

      const result = await electronAPI.jobs.delete(jobId);
      if (result?.success) {
        dispatch({ type: 'DELETE_JOB', payload: { jobId } });
        console.log(`[JobContext] Deleted job ${jobId} via API`);
        return true;
      }
      return false;
    } catch (error) {
      console.error(`[JobContext] Error deleting job ${jobId}:`, error);
      return false;
    }
  }, []);

  const refreshJobs = useCallback(async () => {
    await loadJobsFromAPI();
  }, [loadJobsFromAPI]);

  const value: JobContextType = {
    state,
    dispatch,
    getJob,
    getCurrentJob,
    getJobsByStatus,
    getAllJobs,
    deleteJob,
    refreshJobs,
  };

  return <JobContext.Provider value={value}>{children}</JobContext.Provider>;
}

export function useJobs() {
  const context = useContext(JobContext);
  if (context === undefined) {
    throw new Error('useJobs must be used within a JobProvider');
  }
  return context;
}

