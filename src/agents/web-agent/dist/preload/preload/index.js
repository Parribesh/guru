"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/* eslint-env browser */
/* global window, document */
const electron_1 = require("electron");
// Import IPCChannels from shared types (will be available at runtime)
// For preload, we'll use the channel strings directly since we can't import from shared
const IPCChannels = {
    tab: {
        create: 'tab:create',
        close: 'tab:close',
        switch: 'tab:switch',
        update: 'tab:update',
        getAll: 'tab:get-all',
    },
    navigation: {
        navigate: 'navigation:navigate',
        goBack: 'navigation:go-back',
        goForward: 'navigation:go-forward',
        reload: 'navigation:reload',
        stopLoading: 'navigation:stop-loading',
    },
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
    agent: {
        sendMessage: 'agent:send-message',
    },
    qa: {
        ask: 'qa:ask',
    },
    dom: {
        extract: 'dom:extract',
        content: 'dom:content',
    },
    window: {
        minimize: 'window:minimize',
        maximize: 'window:maximize',
        close: 'window:close',
        resize: 'window:resize',
    },
    devTools: {
        open: 'dev-tools:open',
        close: 'dev-tools:close',
    },
    log: {
        getEvents: 'log:get-events',
        clear: 'log:clear',
    },
    zoom: {
        in: 'zoom:in',
        out: 'zoom:out',
        reset: 'zoom:reset',
    },
    utils: {
        getTestBookingUrl: 'utils:get-test-booking-url',
    },
    jobs: {
        list: 'jobs:list',
        get: 'jobs:get',
        count: 'jobs:count',
        delete: 'jobs:delete',
    },
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
// Security: Only expose specific, safe APIs to the renderer
const electronAPI = {
    // Tab management
    tabs: {
        create: (url) => electron_1.ipcRenderer.invoke(IPCChannels.tab.create, url),
        close: (tabId) => electron_1.ipcRenderer.invoke(IPCChannels.tab.close, tabId),
        switch: (tabId) => electron_1.ipcRenderer.invoke(IPCChannels.tab.switch, tabId),
        getAll: () => electron_1.ipcRenderer.invoke(IPCChannels.tab.getAll),
    },
    // Navigation
    navigation: {
        go: (tabId, url) => electron_1.ipcRenderer.invoke(IPCChannels.navigation.navigate, tabId, url),
        back: (tabId) => electron_1.ipcRenderer.invoke(IPCChannels.navigation.goBack, tabId),
        forward: (tabId) => electron_1.ipcRenderer.invoke(IPCChannels.navigation.goForward, tabId),
        reload: (tabId) => electron_1.ipcRenderer.invoke(IPCChannels.navigation.reload, tabId),
        stop: (tabId) => electron_1.ipcRenderer.invoke(IPCChannels.navigation.stopLoading, tabId),
    },
    // QA services
    qa: {
        ask: (request) => electron_1.ipcRenderer.invoke(IPCChannels.qa.ask, request),
    },
    // Session Management
    sessions: {
        create: (request) => electron_1.ipcRenderer.invoke(IPCChannels.session.create, request),
        get: (sessionId) => electron_1.ipcRenderer.invoke(IPCChannels.session.get, sessionId),
        getAll: () => electron_1.ipcRenderer.invoke(IPCChannels.session.getAll),
        getSessionIds: () => electron_1.ipcRenderer.invoke(IPCChannels.session.getIds),
        delete: (sessionId) => electron_1.ipcRenderer.invoke(IPCChannels.session.delete, sessionId),
        navigate: (sessionId, url) => electron_1.ipcRenderer.invoke(IPCChannels.session.navigate, sessionId, url),
        showView: (sessionId) => electron_1.ipcRenderer.invoke(IPCChannels.session.showView, sessionId),
        updateViewBounds: (sessionId, bounds) => electron_1.ipcRenderer.invoke(IPCChannels.session.updateBounds, sessionId, bounds),
        getTabId: (sessionId) => electron_1.ipcRenderer.invoke(IPCChannels.session.getTabId, sessionId),
        getChunks: (sessionId) => electron_1.ipcRenderer.invoke(IPCChannels.session.getChunks, sessionId),
    },
    // Agent Operations
    agent: {
        sendMessage: (sessionId, content) => electron_1.ipcRenderer.invoke(IPCChannels.agent.sendMessage, sessionId, content),
    },
    // Utility functions
    utils: {
        getTestBookingUrl: () => electron_1.ipcRenderer.invoke(IPCChannels.utils.getTestBookingUrl),
        invoke: (channel, ...args) => electron_1.ipcRenderer.invoke(channel, ...args),
    },
    // Logging services
    log: {
        getEvents: () => electron_1.ipcRenderer.invoke(IPCChannels.log.getEvents),
        clear: () => electron_1.ipcRenderer.invoke(IPCChannels.log.clear),
    },
    // Window management
    window: {
        minimize: () => electron_1.ipcRenderer.invoke(IPCChannels.window.minimize),
        maximize: () => electron_1.ipcRenderer.invoke(IPCChannels.window.maximize),
        close: () => electron_1.ipcRenderer.invoke(IPCChannels.window.close),
    },
    // Dev tools
    devTools: {
        open: (tabId) => electron_1.ipcRenderer.invoke(IPCChannels.devTools.open, tabId),
    },
    // DOM content extraction
    dom: {
        extractContent: () => {
            return new Promise((resolve) => {
                // Extract readable content from the page
                const content = extractPageContent();
                resolve(content);
            });
        },
        getSelectedText: () => {
            const selection = window.getSelection();
            return selection ? selection.toString() : "";
        },
        getPageInfo: () => ({
            title: document.title,
            url: window.location.href,
            selectedText: electronAPI.dom.getSelectedText(),
        }),
    },
    // Event listeners
    on: (channel, callback) => {
        // Security: Only allow specific channels
        const allowedChannels = [
            IPCChannels.tab.update,
            IPCChannels.events.tabCreated,
            IPCChannels.events.tabClosed,
            IPCChannels.dom.extract,
            IPCChannels.events.commandPaletteToggle,
            IPCChannels.events.aiTogglePanel,
            IPCChannels.events.logEvent,
            IPCChannels.log.clear,
            IPCChannels.events.sessionCreated,
            IPCChannels.events.sessionUpdated,
            IPCChannels.events.sessionDeleted,
            'embedding-service:event', // Allow embedding service events
        ];
        if (allowedChannels.includes(channel)) {
            // Wrap callback to forward only the data (not the IPC event object)
            const wrappedCallback = (ipcEvent, ...args) => {
                // Only log for embedding-service events to reduce noise
                if (channel === 'embedding-service:event') {
                    console.log(`[Preload] ✅ Received embedding-service event:`, args[0]?.type || 'unknown', {
                        type: args[0]?.type,
                        hasPayload: !!args[0]?.payload,
                        payloadJobId: args[0]?.payload?.job_id,
                        timestamp: args[0]?.timestamp
                    });
                }
                // Forward only the data arguments to the callback
                callback(...args);
            };
            electron_1.ipcRenderer.on(channel, wrappedCallback);
            console.log(`[Preload] ✅ Registered listener for channel: ${channel}`);
        }
        else {
            console.warn(`[Preload] ❌ Channel not allowed: ${channel}`);
        }
    },
    off: (channel, callback) => {
        electron_1.ipcRenderer.off(channel, callback);
    },
    // Send app events to main process
    sendAppEvent: (eventType, data) => {
        electron_1.ipcRenderer.send(IPCChannels.events.appEvent, eventType, data);
    },
    // Forward embedding service events from renderer to main process
    send: (channel, data) => {
        if (channel === 'embedding-service:forward-event') {
            electron_1.ipcRenderer.send('embedding-service:forward-event', data);
        }
    },
    // Jobs API
    jobs: {
        list: (limit, status) => electron_1.ipcRenderer.invoke(IPCChannels.jobs.list, limit, status),
        get: (jobId) => electron_1.ipcRenderer.invoke(IPCChannels.jobs.get, jobId),
        count: (status) => electron_1.ipcRenderer.invoke(IPCChannels.jobs.count, status),
        delete: (jobId) => electron_1.ipcRenderer.invoke(IPCChannels.jobs.delete, jobId),
    },
    // Queue API
    queue: {
        getStatus: () => electron_1.ipcRenderer.invoke('queue:status'),
        getMetrics: () => electron_1.ipcRenderer.invoke('queue:metrics'),
    },
    // Generic invoke for backward compatibility
    invoke: (channel, ...args) => electron_1.ipcRenderer.invoke(channel, ...args),
};
// Expose the API to the renderer process
// contextBridge may not be available in all contexts (like BrowserViews)
try {
    if (typeof electron_1.contextBridge !== 'undefined') {
        electron_1.contextBridge.exposeInMainWorld("electronAPI", electronAPI);
    }
}
catch (error) {
    console.warn('contextBridge not available in this context');
}
// DOM content extraction functions
function extractPageContent() {
    // Remove script and style elements
    const clonedDoc = document.cloneNode(true);
    // Remove scripts, styles, and navigation/sidebar elements
    const toRemove = clonedDoc.querySelectorAll("script, style, noscript, nav, aside, header, footer, " +
        ".nav, .navigation, .sidebar, .menu, .sidebar-content, " +
        ".mw-navigation, .vector-menu, .vector-page-toolbar, " +
        ".infobox, .sidebar-box, .navbox, .vertical-navbox");
    toRemove.forEach((el) => el.remove());
    // Try to find main content area first (Wikipedia, news sites, etc.)
    let content = "";
    // Priority 1: Article or main content
    const mainContent = clonedDoc.querySelector("article, main, [role='main'], #content, #mw-content-text, .mw-parser-output");
    if (mainContent) {
        // Remove navigation and sidebar elements from main content
        const navElements = mainContent.querySelectorAll("nav, .nav, .navigation, .sidebar, .infobox, .navbox");
        navElements.forEach((el) => el.remove());
        // Extract text from main content (paragraphs, headings, lists)
        const paragraphs = mainContent.querySelectorAll("p, h1, h2, h3, h4, h5, h6, li, blockquote, dd, dt");
        paragraphs.forEach((el) => {
            const text = el.textContent?.trim();
            if (text && text.length > 30) { // Minimum 30 chars to avoid short labels
                content += text + "\n\n";
            }
        });
        // Extract table data - important for numerical data and statistics
        const tables = mainContent.querySelectorAll("table");
        tables.forEach((table) => {
            const rows = table.querySelectorAll("tr");
            if (rows.length > 0) {
                content += "\n[Table Data]\n";
                rows.forEach((row) => {
                    const cells = row.querySelectorAll("th, td");
                    if (cells.length > 0) {
                        const rowData = Array.from(cells).map((cell) => {
                            return (cell.textContent || '').trim();
                        }).filter(cell => cell.length > 0);
                        if (rowData.length > 0) {
                            content += rowData.join(" | ") + "\n";
                        }
                    }
                });
                content += "\n";
            }
        });
        // Extract stat boxes and highlighted numbers
        const statBoxes = mainContent.querySelectorAll(".stat-box, .stat-number, [class*='stat'], [class*='number']");
        statBoxes.forEach((box) => {
            const text = box.textContent?.trim();
            if (text && text.length > 5) {
                content += text + "\n\n";
            }
        });
    }
    // Priority 2: If no main content found, use structured selectors
    if (!content.trim()) {
        const contentSelectors = [
            "article",
            "main",
            '[role="main"]',
            ".content",
            ".post",
            ".article",
            "p",
            "h1",
            "h2",
            "h3",
            "h4",
            "h5",
            "h6",
        ];
        contentSelectors.forEach((selector) => {
            const elements = clonedDoc.querySelectorAll(selector);
            elements.forEach((el) => {
                // Skip if element is in nav/sidebar
                if (el.closest("nav, aside, .nav, .sidebar, .menu")) {
                    return;
                }
                const text = el.textContent?.trim();
                if (text && text.length > 30) {
                    content += text + "\n\n";
                }
            });
        });
    }
    // Priority 3: Fallback to body text (filtered)
    if (!content.trim()) {
        const body = clonedDoc.body;
        if (body) {
            // Remove navigation and sidebar from body
            const navElements = body.querySelectorAll("nav, aside, .nav, .sidebar, .menu, header, footer");
            navElements.forEach((el) => el.remove());
            // Extract paragraphs and headings
            const paragraphs = body.querySelectorAll("p, h1, h2, h3, h4, h5, h6");
            paragraphs.forEach((el) => {
                const text = el.textContent?.trim();
                if (text && text.length > 30) {
                    content += text + "\n\n";
                }
            });
            // Extract tables from body as fallback
            const tables = body.querySelectorAll("table");
            tables.forEach((table) => {
                const rows = table.querySelectorAll("tr");
                if (rows.length > 0) {
                    content += "\n[Table Data]\n";
                    rows.forEach((row) => {
                        const cells = row.querySelectorAll("th, td");
                        if (cells.length > 0) {
                            const rowData = Array.from(cells).map((cell) => {
                                return (cell.textContent || '').trim();
                            }).filter(cell => cell.length > 0);
                            if (rowData.length > 0) {
                                content += rowData.join(" | ") + "\n";
                            }
                        }
                    });
                    content += "\n";
                }
            });
        }
    }
    // Clean up whitespace and remove very short lines (likely navigation items)
    return content
        .split("\n")
        .filter(line => line.trim().length > 20) // Filter out short lines
        .join("\n")
        .replace(/\s+/g, " ")
        .replace(/\n\s*\n/g, "\n\n")
        .trim();
}
// Auto-extract content when page loads (for AI analysis)
// Only extract from actual web pages, not internal/UI pages
if (typeof window !== 'undefined') {
    let isExtracting = false;
    let lastExtractedUrl = null;
    const extractAndSendContent = async () => {
        const currentUrl = window.location.href;
        // Prevent duplicate extractions
        if (isExtracting) {
            console.log('[Preload] Extraction already in progress, skipping...');
            return;
        }
        // Prevent duplicate extractions for the same URL
        if (lastExtractedUrl === currentUrl) {
            console.log('[Preload] Content already extracted for this URL, skipping...');
            return;
        }
        isExtracting = true;
        try {
            const url = window.location.href.toLowerCase();
            // Skip internal/UI URLs - only process actual web pages
            // But allow file:// URLs for dev sample and test booking in development mode
            // Note: process.env may not be available in preload, so check for specific files
            const isDevSampleFile = url.includes('dev-sample.html');
            const isTestBookingFile = url.includes('test-booking.html');
            const isInternalUrl = url.startsWith('http://localhost') ||
                url.startsWith('https://localhost') ||
                url.startsWith('http://127.0.0.1') ||
                url.startsWith('https://127.0.0.1') ||
                url.startsWith('about:') ||
                (url.startsWith('file://') && !isDevSampleFile && !isTestBookingFile) || // Allow dev sample and test booking files
                url.startsWith('chrome://') ||
                url.startsWith('chrome-extension://') ||
                url === '' ||
                url === 'about:blank';
            if (isInternalUrl) {
                console.log(`[Preload] Skipping DOM extraction for internal URL: ${window.location.href}`);
                return;
            }
            console.log(`[Preload] Extracting DOM content for URL: ${window.location.href}`);
            const content = extractPageContent();
            const wordCount = content ? content.trim().split(/\s+/).length : 0;
            const tableCount = (content.match(/\[Table Data\]/g) || []).length;
            console.log(`[Preload] Extracted ${wordCount} words from page, found ${tableCount} table(s)`);
            // Only send if we have meaningful content (more than just a few words)
            if (!content || wordCount < 10) {
                console.log(`[Preload] Skipping DOM extraction - insufficient content (${wordCount} words, need at least 10)`);
                return;
            }
            const pageInfo = {
                url: window.location.href,
                title: document.title,
                selectedText: '' // Can't get selection in preload context
            };
            console.log(`[Preload] Sending DOM content to main process: ${wordCount} words, title: "${pageInfo.title}"`);
            // Send to main process for AI processing
            await electron_1.ipcRenderer.invoke(IPCChannels.dom.content, {
                tabId: getCurrentTabId(), // TODO: Get actual tab ID
                content,
                htmlContent: document.documentElement.outerHTML, // Include HTML for structure extraction
                url: pageInfo.url,
                title: pageInfo.title,
            });
            console.log(`[Preload] DOM content sent successfully`);
            lastExtractedUrl = currentUrl;
        }
        catch (error) {
            console.error("Failed to extract DOM content:", error);
        }
        finally {
            isExtracting = false;
        }
    };
    // Try multiple events - file:// URLs might not fire 'load' event reliably
    window.addEventListener("load", extractAndSendContent);
    document.addEventListener("DOMContentLoaded", () => {
        console.log('[Preload] DOMContentLoaded event fired');
        // For file:// URLs, DOMContentLoaded might fire before load
        setTimeout(extractAndSendContent, 500);
    });
    // Fallback: if document is already ready, extract immediately
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        console.log('[Preload] Document already ready, extracting immediately');
        setTimeout(extractAndSendContent, 500);
    }
}
// Helper function to get current tab ID
function getCurrentTabId() {
    // Try to get tabId from window context (injected by main process)
    if (typeof window !== 'undefined' && window.__TAB_ID__) {
        return window.__TAB_ID__;
    }
    // Fallback to placeholder if not available
    return "current-tab";
}
// Handle keyboard shortcuts (only if document is available)
if (typeof document !== 'undefined') {
    document.addEventListener("keydown", (event) => {
        // Command palette shortcut
        if ((event.ctrlKey || event.metaKey) && event.key === "k") {
            event.preventDefault();
            electron_1.ipcRenderer.send(IPCChannels.events.commandPaletteToggle);
        }
        // AI panel toggle
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === "A") {
            event.preventDefault();
            electron_1.ipcRenderer.send(IPCChannels.events.aiTogglePanel);
        }
        // Zoom shortcuts (fallback if global shortcuts don't work)
        if ((event.ctrlKey || event.metaKey)) {
            if (event.key === "=" || event.key === "+") {
                console.log('Preload: Zoom in triggered, preventing default');
                event.preventDefault();
                electron_1.ipcRenderer.send(IPCChannels.zoom.in);
            }
            else if (event.key === "-") {
                console.log('Preload: Zoom out triggered, preventing default');
                event.preventDefault();
                electron_1.ipcRenderer.send(IPCChannels.zoom.out);
            }
            else if (event.key === "0") {
                console.log('Preload: Zoom reset triggered, preventing default');
                event.preventDefault();
                electron_1.ipcRenderer.send(IPCChannels.zoom.reset);
            }
        }
    });
}
//# sourceMappingURL=index.js.map