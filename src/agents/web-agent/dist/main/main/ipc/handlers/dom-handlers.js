"use strict";
// DOM Content Extraction IPC Handlers
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupDOMHandlers = setupDOMHandlers;
const electron_1 = require("electron");
const types_1 = require("../../../shared/types");
const cache_1 = require("../../agent/rag/cache");
const event_logger_1 = require("../../logging/event-logger");
const index_1 = require("../index");
function setupDOMHandlers(tabManager) {
    electron_1.ipcMain.handle(types_1.IPCChannels.dom.content, async (event, data) => {
        // Get the actual tabId by looking up which BrowserView sent this message
        let actualTabId = data.tabId;
        if (data.tabId === 'current-tab' || !data.tabId) {
            const senderWebContentsId = event.sender.id;
            const resolvedTabId = tabManager.getTabIdByWebContents(senderWebContentsId);
            if (resolvedTabId) {
                actualTabId = resolvedTabId;
                event_logger_1.eventLogger.debug('IPC', `Resolved tabId from "${data.tabId}" to "${actualTabId}" for URL: ${data.url}`);
            }
            else {
                event_logger_1.eventLogger.warning('IPC', `Could not resolve tabId for DOM_CONTENT from URL: ${data.url}. Using provided tabId: ${data.tabId}`);
            }
        }
        console.log(`DOM_CONTENT IPC handler called for tab ${actualTabId}: ${data.title}`);
        event_logger_1.eventLogger.info('QA Service', `Received page content for tab ${actualTabId}: ${data.title}`);
        // Filter out internal/UI URLs - only embed actual web pages
        const url = data.url.toLowerCase();
        const isDev = process.env.NODE_ENV === 'development';
        const isDevSampleFile = isDev && url.includes('dev-sample.html');
        const isTestBookingFile = isDev && url.includes('test-booking.html');
        const isInternalUrl = url.startsWith('http://localhost') ||
            url.startsWith('https://localhost') ||
            url.startsWith('http://127.0.0.1') ||
            url.startsWith('https://127.0.0.1') ||
            url.startsWith('about:') ||
            (url.startsWith('file://') && !isDevSampleFile && !isTestBookingFile) ||
            url.startsWith('chrome://') ||
            url.startsWith('chrome-extension://') ||
            url === '' ||
            url === 'about:blank';
        if (isInternalUrl) {
            console.log(`⏭️ Skipping embedding for internal URL: ${data.url}`);
            event_logger_1.eventLogger.info('QA Service', `Skipping internal URL: ${data.url}`);
            return { success: true, skipped: true };
        }
        // Cache page content for QA system (non-blocking)
        // Use setImmediate to make this async and not block the IPC handler
        setImmediate(async () => {
            try {
                // Try to get sessionId for this tab
                let sessionId;
                const sessionManager = (0, index_1.getSessionManager)();
                if (sessionManager) {
                    const foundSessionId = sessionManager.getSessionIdByTabId(actualTabId);
                    sessionId = foundSessionId || undefined;
                }
                await (0, cache_1.cachePageContent)(actualTabId, data.content, data.htmlContent || '', data.url, data.title, sessionId);
                console.log(`✅ Cached page content for tab ${actualTabId}`);
                event_logger_1.eventLogger.success('QA Service', `Successfully cached page content for tab ${actualTabId}`);
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error(`❌ Failed to cache page content for tab ${actualTabId}:`, error);
                event_logger_1.eventLogger.error('QA Service', `Failed to cache page content for tab ${actualTabId}`, errorMessage);
            }
        });
        // Return immediately - processing happens asynchronously
        return { success: true, processing: true };
    });
}
//# sourceMappingURL=dom-handlers.js.map