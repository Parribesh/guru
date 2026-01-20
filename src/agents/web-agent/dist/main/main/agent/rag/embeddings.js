"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeEmbeddings = initializeEmbeddings;
exports.generateEmbedding = generateEmbedding;
exports.generateChunkEmbeddings = generateChunkEmbeddings;
const event_logger_1 = require("../../logging/event-logger");
const embedding_service_1 = require("./embedding-service");
// Lazy load the embedding model
let embeddingPipeline = null;
let transformersModule = null;
const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2'; // Fast, lightweight sentence transformer
async function loadTransformers() {
    if (transformersModule) {
        return transformersModule;
    }
    // Dynamic import for ES module - use eval to prevent TypeScript from transpiling to require()
    // This is necessary because @xenova/transformers is an ES module and can't be required
    const importExpr = 'import("@xenova/transformers")';
    transformersModule = await eval(importExpr);
    return transformersModule;
}
let isInitializing = false;
let initPromise = null;
async function initializeEmbeddings() {
    if (embeddingPipeline) {
        return;
    }
    // Prevent multiple simultaneous initialization attempts
    if (isInitializing && initPromise) {
        return initPromise;
    }
    isInitializing = true;
    initPromise = (async () => {
        event_logger_1.eventLogger.info('Embeddings', 'Initializing sentence transformer embeddings...');
        try {
            const transformers = await loadTransformers();
            event_logger_1.eventLogger.info('Embeddings', 'Loading transformers module...');
            // Configure transformers environment for optimal caching
            const path = await Promise.resolve().then(() => __importStar(require('path')));
            const os = await Promise.resolve().then(() => __importStar(require('os')));
            const fs = await Promise.resolve().then(() => __importStar(require('fs')));
            if (transformers.env) {
                transformers.env.allowLocalModels = true;
                transformers.env.allowRemoteModels = true; // Allow downloading models
                transformers.env.remotePath = transformers.env.remotePath || 'https://huggingface.co';
                // transformers.js automatically caches models in ~/.cache/huggingface/transformers
                // We ensure this directory exists and log cache status
                const defaultCacheDir = path.join(os.homedir(), '.cache', 'huggingface', 'transformers');
                const cacheDir = process.env.TRANSFORMERS_CACHE || defaultCacheDir;
                // Ensure cache directory exists (transformers.js will create it, but we ensure it's ready)
                try {
                    if (!fs.existsSync(cacheDir)) {
                        fs.mkdirSync(cacheDir, { recursive: true });
                        event_logger_1.eventLogger.info('Embeddings', `Created transformers cache directory: ${cacheDir}`);
                    }
                }
                catch (err) {
                    event_logger_1.eventLogger.warning('Embeddings', `Could not create cache directory ${cacheDir}: ${err.message}`);
                }
                // Note: transformers.js automatically uses this cache directory
                // Models are cached after first download and reused automatically
                event_logger_1.eventLogger.info('Embeddings', `Transformers cache directory: ${cacheDir}`);
            }
            // Check if model is already cached
            const cacheDir = process.env.TRANSFORMERS_CACHE ||
                path.join(os.homedir(), '.cache', 'huggingface', 'transformers');
            const modelCachePath = path.join(cacheDir, 'models--' + MODEL_NAME.replace('/', '--'));
            const isCached = fs.existsSync(modelCachePath);
            if (isCached) {
                event_logger_1.eventLogger.info('Embeddings', `Model found in cache: ${MODEL_NAME} (loading from cache)`);
            }
            else {
                event_logger_1.eventLogger.info('Embeddings', `Model not in cache: ${MODEL_NAME} (will download and cache)`);
                event_logger_1.eventLogger.info('Embeddings', 'This may take a moment on first run as the model downloads...');
            }
            embeddingPipeline = await transformers.pipeline('feature-extraction', MODEL_NAME, {
                quantized: true, // Use quantized model for faster loading and smaller cache size
                revision: 'main', // Use main branch for consistency
                progress_callback: (progress) => {
                    // Log progress if available
                    if (progress && progress.status === 'progress') {
                        const percent = progress.progress ? Math.round(progress.progress * 100) : 0;
                        if (percent > 0 && percent % 10 === 0) { // Log every 10%
                            event_logger_1.eventLogger.info('Embeddings', `Downloading model: ${percent}%`);
                        }
                    }
                },
            });
            if (!isCached) {
                event_logger_1.eventLogger.info('Embeddings', `Model cached for future use at: ${modelCachePath}`);
            }
            event_logger_1.eventLogger.success('Embeddings', 'Embeddings initialized successfully');
        }
        catch (error) {
            event_logger_1.eventLogger.error('Embeddings', 'Failed to initialize embeddings', error.message || error);
            // Check if it's an EPIPE error (broken pipe)
            if (error.code === 'EPIPE' || error.message?.includes('EPIPE')) {
                event_logger_1.eventLogger.warning('Embeddings', 'EPIPE error detected - this may be due to model download');
                // Reset and allow retry
                embeddingPipeline = null;
                throw new Error('Model initialization failed. Please ensure you have internet connection for first-time model download.');
            }
            throw error;
        }
        finally {
            isInitializing = false;
            initPromise = null;
        }
    })();
    return initPromise;
}
async function generateEmbedding(text) {
    // Wait for initialization if in progress
    if (isInitializing && initPromise) {
        await initPromise;
    }
    else if (!embeddingPipeline) {
        await initializeEmbeddings();
    }
    if (!embeddingPipeline) {
        throw new Error('Embedding pipeline not initialized');
    }
    try {
        const output = await embeddingPipeline(text, {
            pooling: 'mean',
            normalize: true,
        });
        // Convert tensor to array
        const embedding = Array.from(output.data);
        // Validate embedding
        if (!embedding || embedding.length === 0) {
            throw new Error('Generated embedding is empty');
        }
        // Check if embedding has reasonable values (not all zeros or NaNs)
        const hasValidValues = embedding.some(v => !isNaN(v) && v !== 0);
        if (!hasValidValues) {
            throw new Error('Generated embedding contains only zeros or NaNs');
        }
        // Log embedding stats for debugging (first time only)
        if (Math.random() < 0.01) { // Log 1% of embeddings for debugging
            const min = Math.min(...embedding);
            const max = Math.max(...embedding);
            const mean = embedding.reduce((a, b) => a + b, 0) / embedding.length;
            const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
            event_logger_1.eventLogger.debug('Embeddings', `Embedding stats: dim=${embedding.length}, min=${min.toFixed(4)}, max=${max.toFixed(4)}, mean=${mean.toFixed(4)}, norm=${norm.toFixed(4)}`);
        }
        return embedding;
    }
    catch (error) {
        console.error('❌ Failed to generate embedding:', error);
        event_logger_1.eventLogger.error('Embeddings', `Failed to generate embedding for text: "${text.substring(0, 50)}..."`, error instanceof Error ? error.message : String(error));
        // Reset pipeline on error to allow retry
        embeddingPipeline = null;
        throw error;
    }
}
// Throttle progress callbacks to prevent bursts
let lastProgressTime = 0;
let lastProgressValue = { current: 0, total: 0 };
let progressThrottleTimeout = null;
const PROGRESS_THROTTLE_MS = 50; // Emit progress at most every 50ms
function throttledProgressCallback(callback, progress) {
    lastProgressValue = progress;
    const now = Date.now();
    // If enough time has passed, call immediately
    if (now - lastProgressTime >= PROGRESS_THROTTLE_MS) {
        lastProgressTime = now;
        callback(progress);
        // Clear any pending timeout
        if (progressThrottleTimeout) {
            clearTimeout(progressThrottleTimeout);
            progressThrottleTimeout = null;
        }
    }
    else {
        // Schedule a delayed call if not already scheduled
        // CRITICAL: Always schedule the timeout to ensure progress is emitted
        // This prevents gaps when chunks complete in parallel
        if (!progressThrottleTimeout) {
            const delay = Math.max(1, PROGRESS_THROTTLE_MS - (now - lastProgressTime));
            progressThrottleTimeout = setTimeout(() => {
                lastProgressTime = Date.now();
                callback(lastProgressValue);
                progressThrottleTimeout = null;
                // If there's a newer progress value queued, schedule another update immediately
                // This ensures continuous progress updates even during parallel batch processing
                if (lastProgressValue.current !== progress.current || lastProgressValue.total !== progress.total) {
                    // Progress has advanced, schedule another update
                    const newDelay = PROGRESS_THROTTLE_MS;
                    progressThrottleTimeout = setTimeout(() => {
                        lastProgressTime = Date.now();
                        callback(lastProgressValue);
                        progressThrottleTimeout = null;
                    }, newDelay);
                }
            }, delay);
        }
    }
}
async function generateChunkEmbeddings(chunks, progressCallback) {
    const startTime = Date.now();
    console.log(`[Embeddings] Starting embedding generation for ${chunks.length} chunks...`);
    event_logger_1.eventLogger.info('Embeddings', `Starting embedding generation for ${chunks.length} chunks...`);
    event_logger_1.eventLogger.info('Embeddings', 'This process converts text chunks into vector embeddings for semantic search via HTTP service');
    // Use HTTP-based embedding service
    const embeddingService = (0, embedding_service_1.getEmbeddingService)();
    const serviceBaseUrl = embeddingService.baseUrl;
    // Check if service is available
    console.log(`[Embeddings] Checking embedding service availability at ${serviceBaseUrl}...`);
    event_logger_1.eventLogger.info('Embeddings', `Checking embedding service availability at ${serviceBaseUrl}...`);
    const isAvailable = await embeddingService.healthCheck();
    console.log(`[Embeddings] Health check result: ${isAvailable}`);
    if (!isAvailable) {
        console.warn(`[Embeddings] HTTP embedding service not available, falling back to direct processing`);
        event_logger_1.eventLogger.warning('Embeddings', 'HTTP embedding service not available, falling back to direct processing');
        event_logger_1.eventLogger.warning('Embeddings', `Service URL was: ${serviceBaseUrl}`);
        // Fallback to direct processing
        return generateChunkEmbeddingsDirect(chunks, progressCallback);
    }
    console.log(`[Embeddings] Service is available, submitting ${chunks.length} chunks for embedding generation`);
    event_logger_1.eventLogger.info('Embeddings', `Service is available, submitting ${chunks.length} chunks for embedding generation`);
    try {
        // Use HTTP service to generate embeddings
        console.log(`[Embeddings] Calling embeddingService.generateEmbeddings with ${chunks.length} chunks`);
        const embeddings = await embeddingService.generateEmbeddings(chunks.map(chunk => ({ id: chunk.id, content: chunk.content })), progressCallback);
        console.log(`[Embeddings] Received ${embeddings.size} embeddings from service`);
        const processingTime = Date.now() - startTime;
        const successRate = ((embeddings.size / chunks.length) * 100).toFixed(1);
        const avgTimePerChunk = (processingTime / chunks.length).toFixed(1);
        const chunksPerSecond = ((chunks.length / processingTime) * 1000).toFixed(1);
        event_logger_1.eventLogger.success('Embeddings', `Generated ${embeddings.size} out of ${chunks.length} embeddings (${successRate}% success) in ${processingTime}ms`);
        event_logger_1.eventLogger.info('Embeddings', `Performance: ${chunksPerSecond} chunks/sec, ${avgTimePerChunk}ms avg per chunk`);
        event_logger_1.eventLogger.info('Embeddings', 'Embeddings are now ready for semantic similarity search');
        return embeddings;
    }
    catch (error) {
        event_logger_1.eventLogger.error('Embeddings', `HTTP embedding service failed: ${error.message}`);
        event_logger_1.eventLogger.warning('Embeddings', 'Falling back to direct processing');
        return generateChunkEmbeddingsDirect(chunks, progressCallback);
    }
}
/**
 * Fallback: Generate embeddings directly (for when HTTP service is unavailable)
 */
async function generateChunkEmbeddingsDirect(chunks, progressCallback) {
    const startTime = Date.now();
    const embeddings = new Map();
    const totalChunks = chunks.length;
    let completedCount = 0;
    let failedCount = 0;
    event_logger_1.eventLogger.info('Embeddings', `Using direct processing for ${totalChunks} chunks (fallback mode)`);
    if (progressCallback) {
        progressCallback({ current: 0, total: totalChunks });
    }
    const embeddingPromises = chunks.map(async (chunk) => {
        let retries = 2;
        while (retries > 0) {
            try {
                const embedding = await generateEmbedding(chunk.content);
                completedCount++;
                embeddings.set(chunk.id, embedding);
                if (progressCallback) {
                    throttledProgressCallback(progressCallback, { current: completedCount, total: totalChunks });
                }
                return { success: true, chunkId: chunk.id };
            }
            catch (error) {
                retries--;
                if (retries > 0) {
                    event_logger_1.eventLogger.warning('Embeddings', `Failed to generate embedding for chunk ${chunk.id}, retrying... (${retries} retries left)`);
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
                else {
                    event_logger_1.eventLogger.error('Embeddings', `Failed to generate embedding for chunk ${chunk.id} after retries`, error.message || error);
                    failedCount++;
                    return { success: false, chunkId: chunk.id };
                }
            }
        }
        return { success: false, chunkId: chunk.id };
    });
    await Promise.all(embeddingPromises);
    if (progressCallback) {
        if (progressThrottleTimeout) {
            clearTimeout(progressThrottleTimeout);
            progressThrottleTimeout = null;
        }
        progressCallback({ current: totalChunks, total: totalChunks });
    }
    const processingTime = Date.now() - startTime;
    const successRate = ((embeddings.size / chunks.length) * 100).toFixed(1);
    event_logger_1.eventLogger.success('Embeddings', `Generated ${embeddings.size} out of ${chunks.length} embeddings (${successRate}% success) in ${processingTime}ms`);
    if (failedCount > 0) {
        event_logger_1.eventLogger.warning('Embeddings', `${failedCount} chunks failed to generate embeddings`);
    }
    return embeddings;
}
//# sourceMappingURL=embeddings.js.map