import { ContentChunk, PageContent, DOMComponent } from '../../../shared/types';
interface SessionData {
    sessionId: string;
    url: string;
    title: string;
    pageContent: PageContent;
    chunks: ContentChunk[];
    components: DOMComponent[];
    chunkEmbeddings: Map<string, number[]>;
    cachedAt: number;
}
export declare function saveSessionData(sessionId: string, url: string, title: string, pageContent: PageContent, chunks: ContentChunk[], components: DOMComponent[], chunkEmbeddings: Map<string, number[]>): void;
export declare function loadSessionData(sessionId: string): SessionData | null;
export declare function findSessionByUrl(url: string): SessionData | null;
export declare function getAllSessionIds(): string[];
export declare function deleteSessionData(sessionId: string): void;
export declare function initializeUrlMapping(): void;
export {};
//# sourceMappingURL=session-storage.d.ts.map