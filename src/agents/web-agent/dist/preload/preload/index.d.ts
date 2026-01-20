declare const electronAPI: {
    tabs: {
        create: (url?: string) => Promise<any>;
        close: (tabId: string) => Promise<any>;
        switch: (tabId: string) => Promise<any>;
        getAll: () => Promise<any>;
    };
    navigation: {
        go: (tabId: string, url: string) => Promise<any>;
        back: (tabId: string) => Promise<any>;
        forward: (tabId: string) => Promise<any>;
        reload: (tabId: string) => Promise<any>;
        stop: (tabId: string) => Promise<any>;
    };
    qa: {
        ask: (request: {
            question: string;
            tabId: string;
            context?: {
                url: string;
                title: string;
            };
        }) => Promise<any>;
    };
    sessions: {
        create: (request?: {
            url?: string;
            initialMessage?: string;
        }) => Promise<any>;
        get: (sessionId: string) => Promise<any>;
        getAll: () => Promise<any>;
        getSessionIds: () => Promise<any>;
        delete: (sessionId: string) => Promise<any>;
        navigate: (sessionId: string, url: string) => Promise<any>;
        showView: (sessionId: string | null) => Promise<any>;
        updateViewBounds: (sessionId: string, bounds: {
            x: number;
            y: number;
            width: number;
            height: number;
        }) => Promise<any>;
        getTabId: (sessionId: string) => Promise<any>;
        getChunks: (sessionId: string) => Promise<any>;
    };
    agent: {
        sendMessage: (sessionId: string, content: string) => Promise<any>;
    };
    utils: {
        getTestBookingUrl: () => Promise<any>;
        invoke: (channel: string, ...args: any[]) => Promise<any>;
    };
    log: {
        getEvents: () => Promise<any>;
        clear: () => Promise<any>;
    };
    window: {
        minimize: () => Promise<any>;
        maximize: () => Promise<any>;
        close: () => Promise<any>;
    };
    devTools: {
        open: (tabId?: string) => Promise<any>;
    };
    dom: {
        extractContent: () => Promise<string>;
        getSelectedText: () => string;
        getPageInfo: () => {
            title: string;
            url: string;
            selectedText: string;
        };
    };
    on: (channel: string, callback: (...args: any[]) => void) => void;
    off: (channel: string, callback: (...args: any[]) => void) => void;
    sendAppEvent: (eventType: string, data: any) => void;
    send: (channel: string, data: any) => void;
    jobs: {
        list: (limit?: number, status?: string) => Promise<any>;
        get: (jobId: string) => Promise<any>;
        count: (status?: string) => Promise<any>;
        delete: (jobId: string) => Promise<any>;
    };
    queue: {
        getStatus: () => Promise<any>;
        getMetrics: () => Promise<any>;
    };
    invoke: (channel: string, ...args: any[]) => Promise<any>;
};
declare global {
    interface Window {
        electronAPI: typeof electronAPI;
    }
}
export {};
//# sourceMappingURL=index.d.ts.map