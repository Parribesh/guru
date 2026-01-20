"use strict";
// Shared types for Electron AI Browser
Object.defineProperty(exports, "__esModule", { value: true });
exports.IPCChannels = void 0;
// IPC Channel definitions - Organized by feature
exports.IPCChannels = {
    // Tab management
    tab: {
        create: 'tab:create',
        close: 'tab:close',
        switch: 'tab:switch',
        update: 'tab:update',
        getAll: 'tab:get-all',
    },
    // Navigation
    navigation: {
        navigate: 'navigate',
        goBack: 'go-back',
        goForward: 'go-forward',
        reload: 'reload',
        stopLoading: 'stop-loading',
    },
    // Session management
    session: {
        create: 'session:create',
        get: 'session:get',
        getAll: 'session:get-all',
        getIds: 'session:get-ids',
        delete: 'session:delete',
        getTabId: 'session:get-tab-id',
        navigate: 'session:navigate',
        showView: 'session:show-view',
        updateBounds: 'session:update-bounds',
        getChunks: 'session:get-chunks',
    },
    // Agent operations
    agent: {
        sendMessage: 'agent:send-message',
    },
    // QA service
    qa: {
        ask: 'qa:ask',
    },
    // DOM extraction
    dom: {
        extract: 'dom:extract',
        content: 'dom:content',
    },
    // Window management
    window: {
        minimize: 'window:minimize',
        maximize: 'window:maximize',
        close: 'window:close',
        resize: 'window:resize',
    },
    // Dev tools
    devTools: {
        open: 'dev-tools:open',
        close: 'dev-tools:close',
    },
    // Logging
    log: {
        getEvents: 'log:get-events',
        clear: 'log:clear',
    },
    // Zoom
    zoom: {
        in: 'zoom:in',
        out: 'zoom:out',
        reset: 'zoom:reset',
    },
    // Utilities
    utils: {
        getTestBookingUrl: 'utils:get-test-booking-url',
    },
    // Jobs API
    jobs: {
        list: 'jobs:list',
        get: 'jobs:get',
        count: 'jobs:count',
        delete: 'jobs:delete',
    },
    // Events (one-way communication)
    events: {
        tabCreated: 'tab:created',
        tabClosed: 'tab:closed',
        tabUpdated: 'tab:update',
        sessionCreated: 'agent:session-created',
        sessionUpdated: 'agent:session-updated',
        sessionDeleted: 'agent:session-deleted',
        logEvent: 'log:event',
        logClear: 'log:clear',
        commandPaletteToggle: 'command-palette:toggle',
        aiTogglePanel: 'ai:toggle-panel',
        appEvent: 'app-event',
    },
};
//# sourceMappingURL=types.js.map