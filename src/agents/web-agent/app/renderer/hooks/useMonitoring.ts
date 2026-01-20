/**
 * Standardized Monitoring Hook
 * Provides consistent event-driven state management for all monitoring components
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface MonitoringEvent {
  type: string;
  payload?: any;
  timestamp?: number;
}

export interface MonitoringState {
  isConnected: boolean;
  lastUpdate: number | null;
  error: string | null;
}

/**
 * Standardized hook for monitoring components
 * All monitors should use this pattern for consistency
 * 
 * @param eventChannel - IPC channel to listen on (e.g., 'embedding-service:event')
 * @param eventHandlers - Map of event types to handler functions
 * @param initialState - Initial state for the monitor
 */
export function useMonitoring<TState>(
  eventChannel: string,
  eventHandlers: Record<string, (state: TState, event: MonitoringEvent) => TState>,
  initialState: TState
): {
  state: TState;
  monitoringState: MonitoringState;
  reset: () => void;
  updateState: (updater: (prev: TState) => TState) => void;
} {
  const [state, setState] = useState<TState>(initialState);
  const [monitoringState, setMonitoringState] = useState<MonitoringState>({
    isConnected: false,
    lastUpdate: null,
    error: null,
  });
  
  const handlersRef = useRef(eventHandlers);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Update handlers ref when they change
  useEffect(() => {
    handlersRef.current = eventHandlers;
  }, [eventHandlers]);

  // Reset function
  const reset = useCallback(() => {
    setState(initialState);
    setMonitoringState({
      isConnected: false,
      lastUpdate: null,
      error: null,
    });
  }, [initialState]);

  // Manual state update function
  const updateState = useCallback((updater: (prev: TState) => TState) => {
    setState(updater);
  }, []);

  useEffect(() => {
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI?.on) {
      console.warn(`[useMonitoring] electronAPI.on not available for channel: ${eventChannel}`);
      setMonitoringState(prev => ({ ...prev, error: 'electronAPI not available' }));
      return;
    }

    console.log(`[useMonitoring] Setting up listener for channel: ${eventChannel}`);

    const handleEvent = (eventData: any) => {
      try {
        const event: MonitoringEvent = {
          type: eventData?.type || 'unknown',
          payload: eventData?.payload || eventData,
          timestamp: eventData?.timestamp || Date.now(),
        };

        console.log(`[useMonitoring] Received event: ${event.type}`, event);

        // Update monitoring state
        setMonitoringState(prev => ({
          ...prev,
          lastUpdate: Date.now(),
          error: null,
        }));

        // Handle connection events
        if (event.type === 'websocket_connected' || event.type === 'connected') {
          setMonitoringState(prev => ({ ...prev, isConnected: true }));
        } else if (event.type === 'websocket_closed' || event.type === 'websocket_error' || event.type === 'disconnected' || event.type === 'error') {
          setMonitoringState(prev => ({ ...prev, isConnected: false }));
        }

        // Find and call appropriate handler
        const handler = handlersRef.current[event.type];
        if (handler) {
          setState(prevState => handler(prevState, event));
        } else {
          // Try wildcard handler
          const wildcardHandler = handlersRef.current['*'];
          if (wildcardHandler) {
            setState(prevState => wildcardHandler(prevState, event));
          } else {
            console.debug(`[useMonitoring] No handler for event type: ${event.type}`);
          }
        }
      } catch (error: any) {
        console.error(`[useMonitoring] Error handling event:`, error);
        setMonitoringState(prev => ({
          ...prev,
          error: error.message || 'Unknown error processing event',
        }));
      }
    };

    // Register event listener
    electronAPI.on(eventChannel, handleEvent);
    console.log(`[useMonitoring] ✅ Event listener registered for: ${eventChannel}`);

    // Cleanup function
    const cleanup = () => {
      console.log(`[useMonitoring] Cleaning up listener for: ${eventChannel}`);
      if (electronAPI?.off) {
        electronAPI.off(eventChannel, handleEvent);
      }
    };

    cleanupRef.current = cleanup;

    return cleanup;
  }, [eventChannel]);

  return {
    state,
    monitoringState,
    reset,
    updateState,
  };
}

