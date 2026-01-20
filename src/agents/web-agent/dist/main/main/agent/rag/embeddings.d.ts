import { ContentChunk } from '../../../shared/types';
export declare function initializeEmbeddings(): Promise<void>;
export declare function generateEmbedding(text: string): Promise<number[]>;
export declare function generateChunkEmbeddings(chunks: ContentChunk[], progressCallback?: (progress: {
    current: number;
    total: number;
}) => void): Promise<Map<string, number[]>>;
//# sourceMappingURL=embeddings.d.ts.map