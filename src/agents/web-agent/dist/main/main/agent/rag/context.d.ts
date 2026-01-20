import { RetrievedContext, SearchResult } from '../../../shared/types';
import { getCachedContent } from './cache';
export interface ContextResult {
    context: RetrievedContext;
    searchResults: SearchResult[];
    cache: ReturnType<typeof getCachedContent>;
}
export declare function getContextForQuestion(question: string, tabId: string): Promise<ContextResult | null>;
//# sourceMappingURL=context.d.ts.map