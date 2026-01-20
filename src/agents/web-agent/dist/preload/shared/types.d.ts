export interface Tab {
    id: string;
    url: string;
    title: string;
    favicon?: string;
    isLoading: boolean;
    canGoBack: boolean;
    canGoForward: boolean;
}
export interface BrowserViewConfig {
    url: string;
    partition?: string;
    webSecurity?: boolean;
    nodeIntegration?: boolean;
    contextIsolation?: boolean;
    preload?: string;
}
export interface AIServiceConfig {
    provider: 'openai' | 'anthropic' | 'local' | 'mock' | 'ollama';
    apiKey?: string;
    model?: string;
    endpoint?: string;
}
export interface AIRequest {
    type: 'summarize' | 'analyze' | 'chat' | 'extract' | 'qa';
    content: string;
    tabId?: string;
    context?: {
        url: string;
        title: string;
        selectedText?: string;
    };
    options?: Record<string, any>;
}
export type ComponentType = 'form' | 'button' | 'input-group' | 'table' | 'list' | 'text' | 'section' | 'heading';
export interface DOMComponent {
    type: ComponentType;
    id: string;
    selector: string;
    attributes: Record<string, string>;
    textContent: string;
    metadata: {
        isInteractive: boolean;
        formId?: string;
        inputType?: string;
        label?: string;
        placeholder?: string;
        required?: boolean;
        children?: string[];
        parentId?: string;
        formPurpose?: string;
        formHeading?: string;
        formDescription?: string;
    };
}
export interface ContentChunk {
    id: string;
    content: string;
    componentType: ComponentType;
    componentData?: DOMComponent;
    nestedChunks?: ContentChunk[];
    metadata: {
        sectionId?: string;
        heading?: string;
        position: number;
        wordCount: number;
        domPath?: string;
        surroundingContext?: {
            previousChunk?: string;
            nextChunk?: string;
        };
    };
    embedding?: number[];
}
export interface PageContent {
    url: string;
    title: string;
    extractedText: string;
    structure: ContentStructure;
    metadata: {
        extractedAt: number;
        wordCount: number;
        language?: string;
    };
}
export interface ContentStructure {
    sections: Section[];
    headings: Heading[];
}
export interface Section {
    id: string;
    heading?: string;
    level: number;
    startIndex: number;
    endIndex: number;
    content: string;
    domPath?: string;
}
export interface Heading {
    level: number;
    text: string;
    position: number;
}
export interface SearchResult {
    chunk: ContentChunk;
    similarity: number;
    rank: number;
}
export interface RetrievedContext {
    primaryChunks: ContentChunk[];
    surroundingChunks: ContentChunk[];
    sectionContext: {
        heading: string;
        fullSection?: string;
    };
    metadata: {
        totalChunks: number;
        searchTime: number;
    };
}
export interface QARequest {
    question: string;
    tabId: string;
    context?: {
        url: string;
        title: string;
    };
}
export interface QAResponse {
    success: boolean;
    answer: string;
    explanation: string;
    relevantChunks: {
        chunkId: string;
        excerpt: string;
        relevance: string;
    }[];
    confidence: number;
    prompt?: string;
    sourceLocation: {
        section?: string;
        approximatePosition: string;
    };
    metadata?: {
        processingTime?: number;
        chunksSearched?: number;
        model?: string;
    };
    error?: string;
}
export interface AIResponse {
    success: boolean;
    content: string;
    metadata?: {
        tokens?: number;
        model?: string;
        processingTime?: number;
    };
    error?: string;
    prompt?: string;
    relevantChunks?: {
        chunkId: string;
        excerpt: string;
        relevance: string;
    }[];
    sourceLocation?: {
        section?: string;
        approximatePosition: string;
    };
}
export declare const IPCChannels: {
    readonly tab: {
        readonly create: "tab:create";
        readonly close: "tab:close";
        readonly switch: "tab:switch";
        readonly update: "tab:update";
        readonly getAll: "tab:get-all";
    };
    readonly navigation: {
        readonly navigate: "navigate";
        readonly goBack: "go-back";
        readonly goForward: "go-forward";
        readonly reload: "reload";
        readonly stopLoading: "stop-loading";
    };
    readonly session: {
        readonly create: "session:create";
        readonly get: "session:get";
        readonly getAll: "session:get-all";
        readonly getIds: "session:get-ids";
        readonly delete: "session:delete";
        readonly getTabId: "session:get-tab-id";
        readonly navigate: "session:navigate";
        readonly showView: "session:show-view";
        readonly updateBounds: "session:update-bounds";
        readonly getChunks: "session:get-chunks";
    };
    readonly agent: {
        readonly sendMessage: "agent:send-message";
    };
    readonly qa: {
        readonly ask: "qa:ask";
    };
    readonly dom: {
        readonly extract: "dom:extract";
        readonly content: "dom:content";
    };
    readonly window: {
        readonly minimize: "window:minimize";
        readonly maximize: "window:maximize";
        readonly close: "window:close";
        readonly resize: "window:resize";
    };
    readonly devTools: {
        readonly open: "dev-tools:open";
        readonly close: "dev-tools:close";
    };
    readonly log: {
        readonly getEvents: "log:get-events";
        readonly clear: "log:clear";
    };
    readonly zoom: {
        readonly in: "zoom:in";
        readonly out: "zoom:out";
        readonly reset: "zoom:reset";
    };
    readonly utils: {
        readonly getTestBookingUrl: "utils:get-test-booking-url";
    };
    readonly jobs: {
        readonly list: "jobs:list";
        readonly get: "jobs:get";
        readonly count: "jobs:count";
        readonly delete: "jobs:delete";
    };
    readonly events: {
        readonly tabCreated: "tab:created";
        readonly tabClosed: "tab:closed";
        readonly tabUpdated: "tab:update";
        readonly sessionCreated: "agent:session-created";
        readonly sessionUpdated: "agent:session-updated";
        readonly sessionDeleted: "agent:session-deleted";
        readonly logEvent: "log:event";
        readonly logClear: "log:clear";
        readonly commandPaletteToggle: "command-palette:toggle";
        readonly aiTogglePanel: "ai:toggle-panel";
        readonly appEvent: "app-event";
    };
};
export type IPCChannel = typeof IPCChannels[keyof typeof IPCChannels][keyof typeof IPCChannels[keyof typeof IPCChannels]];
export interface IPCMessage<T = any> {
    channel: IPCChannel;
    data: T;
}
export interface PageLoadEvent {
    tabId: string;
    url: string;
    title: string;
    isLoading: boolean;
}
export interface DOMContentEvent {
    tabId: string;
    content: string;
    url: string;
    title: string;
}
export interface Command {
    id: string;
    label: string;
    description?: string;
    shortcut?: string;
    action: () => void;
    category?: string;
}
export interface CommandPaletteState {
    isOpen: boolean;
    query: string;
    commands: Command[];
    filteredCommands: Command[];
    selectedIndex: number;
}
export interface TabBarProps {
    tabs: Tab[];
    activeTabId: string;
    onTabClick: (tabId: string) => void;
    onTabClose: (tabId: string) => void;
    onNewTab: () => void;
}
export interface AddressBarProps {
    url: string;
    isLoading: boolean;
    canGoBack: boolean;
    canGoForward: boolean;
    onNavigate: (url: string) => void;
    onBack: () => void;
    onForward: () => void;
    onReload: () => void;
    onStop: () => void;
}
export interface AISidePanelProps {
    isOpen: boolean;
    onToggle: () => void;
    onRequest: (request: AIRequest) => void;
    currentResponse?: AIResponse;
    isProcessing: boolean;
}
//# sourceMappingURL=types.d.ts.map