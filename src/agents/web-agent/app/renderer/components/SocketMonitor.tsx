/**
 * Socket Monitor Component
 * Monitors WebSocket connection state and event frequency
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useMonitoring } from '../hooks/useMonitoring';

interface SocketEvent {
  id: string;
  type: string;
  timestamp: number;
  payload?: any;
}

interface SocketMonitorState {
  events: SocketEvent[];
  connectionState: 'connected' | 'disconnected' | 'connecting' | 'error';
  lastConnectionChange: number | null;
  reconnectAttempts: number;
}

const initialState: SocketMonitorState = {
  events: [],
  connectionState: 'disconnected',
  lastConnectionChange: null,
  reconnectAttempts: 0,
};

let eventIdCounter = 0;

export const SocketMonitor: React.FC = () => {
  const { state, monitoringState, reset } = useMonitoring<SocketMonitorState>(
    'embedding-service:event',
    {
      // Track all WebSocket events
      '*': (prevState, event) => {
        const socketEvent: SocketEvent = {
          id: `event-${++eventIdCounter}`,
          type: event.type || 'unknown',
          timestamp: event.timestamp || Date.now(),
          payload: event.payload,
        };

        return {
          ...prevState,
          events: [socketEvent, ...prevState.events].slice(0, 500), // Keep last 500 events
        };
      },

      // Track connection state changes
      websocket_connected: (prevState, event) => {
        return {
          ...prevState,
          connectionState: 'connected',
          lastConnectionChange: event.timestamp || Date.now(),
          reconnectAttempts: 0,
        };
      },

      websocket_closed: (prevState, event) => {
        return {
          ...prevState,
          connectionState: 'disconnected',
          lastConnectionChange: event.timestamp || Date.now(),
        };
      },

      websocket_error: (prevState, event) => {
        return {
          ...prevState,
          connectionState: 'error',
          lastConnectionChange: event.timestamp || Date.now(),
        };
      },

      connected: (prevState, event) => {
        return {
          ...prevState,
          connectionState: 'connected',
          lastConnectionChange: event.timestamp || Date.now(),
          reconnectAttempts: 0,
        };
      },

      disconnected: (prevState, event) => {
        return {
          ...prevState,
          connectionState: 'disconnected',
          lastConnectionChange: event.timestamp || Date.now(),
        };
      },
    },
    initialState
  );

  // Calculate event frequency metrics
  const metrics = useMemo(() => {
    const now = Date.now();
    const oneSecondAgo = now - 1000;
    const oneMinuteAgo = now - 60000;
    const fiveMinutesAgo = now - 300000;

    const eventsLastSecond = state.events.filter(e => e.timestamp >= oneSecondAgo).length;
    const eventsLastMinute = state.events.filter(e => e.timestamp >= oneMinuteAgo).length;
    const eventsLastFiveMinutes = state.events.filter(e => e.timestamp >= fiveMinutesAgo).length;

    // Group events by type
    const eventsByType = new Map<string, number>();
    state.events.forEach(event => {
      const count = eventsByType.get(event.type) || 0;
      eventsByType.set(event.type, count + 1);
    });

    // Get most frequent event types
    const topEventTypes = Array.from(eventsByType.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
      eventsPerSecond: eventsLastSecond,
      eventsPerMinute: eventsLastMinute,
      eventsPerFiveMinutes: eventsLastFiveMinutes,
      totalEvents: state.events.length,
      topEventTypes,
      eventsByType: Object.fromEntries(eventsByType),
    };
  }, [state.events]);

  // Calculate connection uptime
  const connectionUptime = useMemo(() => {
    if (state.connectionState !== 'connected' || !state.lastConnectionChange) {
      return null;
    }
    const uptimeMs = Date.now() - state.lastConnectionChange;
    const seconds = Math.floor(uptimeMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }, [state.connectionState, state.lastConnectionChange]);

  const getConnectionStateColor = (state: string): string => {
    switch (state) {
      case 'connected':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'connecting':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'error':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'disconnected':
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getConnectionStateIcon = (state: string): string => {
    switch (state) {
      case 'connected':
        return '🟢';
      case 'connecting':
        return '🟡';
      case 'error':
        return '🔴';
      case 'disconnected':
      default:
        return '⚪';
    }
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 p-4 bg-gray-50">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">Socket Monitor</h2>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xl">{getConnectionStateIcon(state.connectionState)}</span>
              <span className={`px-3 py-1 rounded text-sm font-semibold border ${getConnectionStateColor(state.connectionState)}`}>
                {state.connectionState.toUpperCase()}
              </span>
            </div>
            {monitoringState.lastUpdate && (
              <span className="text-xs text-gray-500">
                Last update: {new Date(monitoringState.lastUpdate).toLocaleTimeString()}
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
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Connection Status Card */}
        <div className="border rounded-lg p-4 bg-white">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Connection Status</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="border rounded-lg p-3 bg-gray-50">
              <div className="text-xs text-gray-500 mb-1">State</div>
              <div className={`text-sm font-semibold ${getConnectionStateColor(state.connectionState)} px-2 py-1 rounded inline-block`}>
                {state.connectionState}
              </div>
            </div>
            {connectionUptime && (
              <div className="border rounded-lg p-3 bg-gray-50">
                <div className="text-xs text-gray-500 mb-1">Uptime</div>
                <div className="text-sm font-semibold text-gray-900">{connectionUptime}</div>
              </div>
            )}
            {state.lastConnectionChange && (
              <div className="border rounded-lg p-3 bg-gray-50">
                <div className="text-xs text-gray-500 mb-1">Last Change</div>
                <div className="text-sm font-semibold text-gray-900">
                  {new Date(state.lastConnectionChange).toLocaleTimeString()}
                </div>
              </div>
            )}
            <div className="border rounded-lg p-3 bg-gray-50">
              <div className="text-xs text-gray-500 mb-1">Total Events</div>
              <div className="text-sm font-semibold text-gray-900">{metrics.totalEvents}</div>
            </div>
          </div>
        </div>

        {/* Event Frequency Metrics */}
        <div className="border rounded-lg p-4 bg-white">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Event Frequency</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="border rounded-lg p-4 bg-blue-50 border-blue-200">
              <div className="text-sm text-blue-600 font-medium mb-1">Events/Second</div>
              <div className="text-2xl font-bold text-blue-900">{metrics.eventsPerSecond}</div>
            </div>
            <div className="border rounded-lg p-4 bg-green-50 border-green-200">
              <div className="text-sm text-green-600 font-medium mb-1">Events/Minute</div>
              <div className="text-2xl font-bold text-green-900">{metrics.eventsPerMinute}</div>
            </div>
            <div className="border rounded-lg p-4 bg-purple-50 border-purple-200">
              <div className="text-sm text-purple-600 font-medium mb-1">Events/5 Min</div>
              <div className="text-2xl font-bold text-purple-900">{metrics.eventsPerFiveMinutes}</div>
            </div>
          </div>
        </div>

        {/* Top Event Types */}
        {metrics.topEventTypes.length > 0 && (
          <div className="border rounded-lg p-4 bg-white">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Top Event Types</h3>
            <div className="space-y-2">
              {metrics.topEventTypes.map(([type, count]) => (
                <div key={type} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                  <span className="text-sm font-mono text-gray-700">{type}</span>
                  <span className="text-sm font-semibold text-gray-900">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Events */}
        {state.events.length > 0 && (
          <div className="border rounded-lg p-4 bg-white">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              Recent Events ({state.events.length})
            </h3>
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {state.events.slice(0, 100).map((event) => (
                <div
                  key={event.id}
                  className="text-xs font-mono bg-gray-50 p-2 rounded border border-gray-200"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-gray-500">
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                      event.type === 'job_status_update' ? 'bg-blue-100 text-blue-800' :
                      event.type === 'websocket_connected' ? 'bg-green-100 text-green-800' :
                      event.type === 'websocket_closed' || event.type === 'websocket_error' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {event.type}
                    </span>
                    {event.payload?.job_id && (
                      <span className="text-blue-600 font-mono">
                        Job: {event.payload.job_id.substring(0, 8)}...
                      </span>
                    )}
                  </div>
                  {event.payload && typeof event.payload === 'object' && (
                    <div className="text-gray-600 mt-1 text-xs">
                      {JSON.stringify(event.payload).substring(0, 200)}
                      {JSON.stringify(event.payload).length > 200 ? '...' : ''}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {state.events.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <div className="text-lg mb-2">No events received</div>
            <div className="text-sm">Events will appear here when WebSocket messages are received</div>
          </div>
        )}
      </div>
    </div>
  );
};


