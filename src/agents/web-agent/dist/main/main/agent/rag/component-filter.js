"use strict";
// Component Type Filter - Filters chunks by component type based on query intent
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectRelevantComponentTypes = detectRelevantComponentTypes;
exports.filterChunksByComponentType = filterChunksByComponentType;
exports.getComponentChunksByType = getComponentChunksByType;
exports.getInteractiveComponentChunks = getInteractiveComponentChunks;
exports.groupChunksByComponentType = groupChunksByComponentType;
const event_logger_1 = require("../../logging/event-logger");
const embeddings_1 = require("./embeddings");
const similarity_1 = require("./similarity");
// Semantic descriptions for each component type - these help understand query intent
const COMPONENT_TYPE_DESCRIPTIONS = {
    'form': 'HTML form element with input fields for user data entry, form submission, filling out information, entering data, submitting forms',
    'input-group': 'Input field, text field, form field, data entry field, user input, text input, email input, password input, checkbox, radio button, dropdown, select',
    'button': 'Button element, clickable button, submit button, action button, press button, trigger action, activate button, interactive button',
    'table': 'Data table, structured data, rows and columns, tabular data, data grid, information table, data list, chart data',
    'list': 'List of items, unordered list, ordered list, item list, collection of items',
    'text': 'Text content, paragraph, article text, written content, textual information',
    'section': 'Content section, page section, part of page, content area, section of content',
    'heading': 'Heading, title, header, section title, page heading, content heading',
};
// Cache for component type embeddings (computed once)
let componentTypeEmbeddings = null;
/**
 * Initialize component type embeddings (called once)
 */
async function initializeComponentTypeEmbeddings() {
    if (componentTypeEmbeddings) {
        return componentTypeEmbeddings;
    }
    event_logger_1.eventLogger.info('Component Filter', 'Initializing component type embeddings for semantic detection...');
    componentTypeEmbeddings = new Map();
    for (const [type, description] of Object.entries(COMPONENT_TYPE_DESCRIPTIONS)) {
        try {
            const embedding = await (0, embeddings_1.generateEmbedding)(description);
            componentTypeEmbeddings.set(type, embedding);
            event_logger_1.eventLogger.debug('Component Filter', `Generated embedding for component type: ${type}`);
        }
        catch (error) {
            event_logger_1.eventLogger.error('Component Filter', `Failed to generate embedding for ${type}`, error instanceof Error ? error.message : String(error));
        }
    }
    event_logger_1.eventLogger.success('Component Filter', `Initialized ${componentTypeEmbeddings.size} component type embeddings`);
    return componentTypeEmbeddings;
}
/**
 * Detects which component types are relevant based on the query using semantic similarity
 */
async function detectRelevantComponentTypes(question) {
    event_logger_1.eventLogger.info('Component Filter', `Detecting component types for query: "${question.substring(0, 50)}..."`);
    // Initialize embeddings if needed
    const typeEmbeddings = await initializeComponentTypeEmbeddings();
    // Generate embedding for the question
    let questionEmbedding;
    try {
        questionEmbedding = await (0, embeddings_1.generateEmbedding)(question);
    }
    catch (error) {
        event_logger_1.eventLogger.error('Component Filter', 'Failed to generate question embedding, falling back to all chunks', error instanceof Error ? error.message : String(error));
        return []; // Return empty to search all chunks
    }
    // Calculate similarity between question and each component type
    const similarities = [];
    for (const [type, typeEmbedding] of typeEmbeddings.entries()) {
        try {
            const similarity = (0, similarity_1.cosineSimilarity)(questionEmbedding, typeEmbedding);
            similarities.push({ type, similarity });
            event_logger_1.eventLogger.debug('Component Filter', `Similarity for ${type}: ${similarity.toFixed(3)}`);
        }
        catch (error) {
            event_logger_1.eventLogger.warning('Component Filter', `Failed to calculate similarity for ${type}`, error instanceof Error ? error.message : String(error));
        }
    }
    // Sort by similarity (descending)
    similarities.sort((a, b) => b.similarity - a.similarity);
    // Use a threshold to determine relevant types
    // We'll use a dynamic threshold: top 2 types OR any type above 0.3 similarity
    const SIMILARITY_THRESHOLD = 0.3;
    const TOP_N_TYPES = 2;
    const relevantTypes = [];
    // Always include top N types
    for (let i = 0; i < Math.min(TOP_N_TYPES, similarities.length); i++) {
        if (similarities[i].similarity > 0.2) { // Minimum threshold even for top types
            relevantTypes.push(similarities[i].type);
            event_logger_1.eventLogger.debug('Component Filter', `Top ${i + 1} type: ${similarities[i].type} (similarity: ${similarities[i].similarity.toFixed(3)})`);
        }
    }
    // Also include any types above the threshold
    for (const { type, similarity } of similarities) {
        if (similarity >= SIMILARITY_THRESHOLD && !relevantTypes.includes(type)) {
            relevantTypes.push(type);
            event_logger_1.eventLogger.debug('Component Filter', `Above-threshold type: ${type} (similarity: ${similarity.toFixed(3)})`);
        }
    }
    // Remove text, section, heading from results if we have more specific types
    // (these are too generic and will match almost everything)
    if (relevantTypes.length > 1) {
        const genericTypes = ['text', 'section', 'heading'];
        const hasSpecificTypes = relevantTypes.some(t => !genericTypes.includes(t));
        if (hasSpecificTypes) {
            const filtered = relevantTypes.filter(t => !genericTypes.includes(t));
            if (filtered.length > 0) {
                relevantTypes.length = 0;
                relevantTypes.push(...filtered);
            }
        }
    }
    if (relevantTypes.length === 0) {
        event_logger_1.eventLogger.info('Component Filter', 'No specific component types detected with sufficient similarity - will search all chunks');
    }
    else {
        event_logger_1.eventLogger.info('Component Filter', `Detected relevant component types (semantic): ${relevantTypes.join(', ')}`);
        // Log similarities for debugging
        relevantTypes.forEach(type => {
            const sim = similarities.find(s => s.type === type);
            if (sim) {
                event_logger_1.eventLogger.debug('Component Filter', `  - ${type}: ${sim.similarity.toFixed(3)} similarity`);
            }
        });
    }
    return relevantTypes;
}
/**
 * Filters chunks by component type
 */
function filterChunksByComponentType(chunks, componentTypes) {
    if (componentTypes.length === 0) {
        // No filter - return all chunks
        return chunks;
    }
    const filtered = chunks.filter(chunk => {
        // Include chunks that match any of the specified component types
        if (chunk.componentType && componentTypes.includes(chunk.componentType)) {
            return true;
        }
        // Also include text chunks if we're looking for forms/inputs (they might contain form descriptions)
        if (componentTypes.includes('form') || componentTypes.includes('input-group')) {
            if (chunk.componentType === 'text' || !chunk.componentType) {
                // Check if text content mentions forms/inputs
                const content = chunk.content.toLowerCase();
                if (/\b(form|input|field|submit|button)\b/i.test(content)) {
                    return true;
                }
            }
        }
        return false;
    });
    event_logger_1.eventLogger.info('Component Filter', `Filtered ${chunks.length} chunks to ${filtered.length} chunks (types: ${componentTypes.join(', ')})`);
    return filtered;
}
/**
 * Gets all component chunks of a specific type
 */
function getComponentChunksByType(chunks, componentType) {
    return chunks.filter(chunk => chunk.componentType === componentType);
}
/**
 * Gets all interactive component chunks (forms, buttons, inputs)
 */
function getInteractiveComponentChunks(chunks) {
    return chunks.filter(chunk => {
        if (!chunk.componentType || chunk.componentType === 'text' || chunk.componentType === 'section' || chunk.componentType === 'heading') {
            return false;
        }
        return chunk.componentData?.metadata.isInteractive === true;
    });
}
/**
 * Groups chunks by component type for analysis
 */
function groupChunksByComponentType(chunks) {
    const grouped = new Map();
    chunks.forEach(chunk => {
        const type = chunk.componentType || 'text';
        if (!grouped.has(type)) {
            grouped.set(type, []);
        }
        grouped.get(type).push(chunk);
    });
    return grouped;
}
//# sourceMappingURL=component-filter.js.map