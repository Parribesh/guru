import { ContentChunk, PageContent, DOMComponent } from '../../../shared/types';
export interface TabCache {
    pageContent: PageContent;
    chunks: ContentChunk[];
    chunkEmbeddings: Map<string, number[]>;
    components: DOMComponent[];
    cachedAt: number;
}
export declare function cachePageContent(tabId: string, extractedText: string, htmlContent: string, url: string, title: string, sessionId?: string): Promise<void>;
export declare function getCachedContent(tabId: string): TabCache | null;
export declare function clearCache(tabId?: string): void;
//# sourceMappingURL=cache.d.ts.map