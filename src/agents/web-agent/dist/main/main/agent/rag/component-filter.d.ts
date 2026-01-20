import { ContentChunk, ComponentType } from '../../../shared/types';
/**
 * Detects which component types are relevant based on the query using semantic similarity
 */
export declare function detectRelevantComponentTypes(question: string): Promise<ComponentType[]>;
/**
 * Filters chunks by component type
 */
export declare function filterChunksByComponentType(chunks: ContentChunk[], componentTypes: ComponentType[]): ContentChunk[];
/**
 * Gets all component chunks of a specific type
 */
export declare function getComponentChunksByType(chunks: ContentChunk[], componentType: ComponentType): ContentChunk[];
/**
 * Gets all interactive component chunks (forms, buttons, inputs)
 */
export declare function getInteractiveComponentChunks(chunks: ContentChunk[]): ContentChunk[];
/**
 * Groups chunks by component type for analysis
 */
export declare function groupChunksByComponentType(chunks: ContentChunk[]): Map<ComponentType, ContentChunk[]>;
//# sourceMappingURL=component-filter.d.ts.map