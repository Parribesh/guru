import { ContentChunk, SearchResult } from '../../../shared/types';
export declare function cosineSimilarity(vec1: number[], vec2: number[]): number;
export declare function searchSimilarChunks(questionEmbedding: number[], chunks: ContentChunk[], chunkEmbeddings: Map<string, number[]>, topK?: number, onProgress?: (current: number, total: number, similarity?: number) => void): SearchResult[];
//# sourceMappingURL=similarity.d.ts.map