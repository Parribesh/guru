"use strict";
/**
 * Application Configuration
 * Centralized configuration values for the application
 * All settings can be overridden via environment variables in .env file
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultConfig = void 0;
exports.getConfig = getConfig;
exports.reloadConfig = reloadConfig;
exports.getEmbeddingBatchSize = getEmbeddingBatchSize;
exports.getEmbeddingTimeout = getEmbeddingTimeout;
exports.getEmbeddingServiceUrl = getEmbeddingServiceUrl;
exports.getEmbeddingSocketUrl = getEmbeddingSocketUrl;
exports.getWebpackDevServerPort = getWebpackDevServerPort;
exports.getCLIServerPort = getCLIServerPort;
exports.isDevelopmentMode = isDevelopmentMode;
/**
 * Parse port from environment variable with fallback
 */
function parsePort(envVar, defaultPort) {
    if (!envVar)
        return defaultPort;
    const port = parseInt(envVar, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
        console.warn(`[Config] Invalid port "${envVar}", using default ${defaultPort}`);
        return defaultPort;
    }
    return port;
}
/**
 * Generate WebSocket URL from HTTP URL if not explicitly provided
 */
function getSocketUrl(httpUrl, explicitSocketUrl) {
    if (explicitSocketUrl)
        return explicitSocketUrl;
    try {
        const url = new URL(httpUrl);
        const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${protocol}//${url.host}/ws`;
    }
    catch {
        // Fallback if URL parsing fails
        return httpUrl.replace(/^https?:/, 'ws:').replace(/\/$/, '') + '/ws';
    }
}
/**
 * Default application configuration with environment variable support
 */
exports.defaultConfig = {
    ports: {
        webpackDevServer: parsePort(process.env.WEBPACK_DEV_SERVER_PORT, 3000),
        cliServer: parsePort(process.env.CLI_SERVER_PORT, 9876),
    },
    embedding: {
        serviceUrl: process.env.EMBEDDING_SERVICE_URL || 'http://127.0.0.1:8000',
        socketUrl: getSocketUrl(process.env.EMBEDDING_SERVICE_URL || 'http://127.0.0.1:8000', process.env.EMBEDDING_SERVICE_SOCKET_URL),
        apiKey: process.env.EMBEDDING_SERVICE_API_KEY,
        batchSize: parseInt(process.env.EMBEDDING_BATCH_SIZE || '4', 10),
        timeout: parseInt(process.env.EMBEDDING_TIMEOUT || '30000', 10),
    },
    dev: {
        hotReload: process.env.WEBPACK_HOT !== 'false',
        enabled: process.env.NODE_ENV === 'development',
    },
    ai: {
        ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
        model: process.env.AI_MODEL || 'llama3.2:1b',
    },
    paths: {
        transformersCache: process.env.TRANSFORMERS_CACHE,
    },
};
// Cache the config to avoid re-parsing
let cachedConfig = null;
/**
 * Get application configuration
 * Returns cached config or creates new one from environment
 */
function getConfig() {
    if (cachedConfig)
        return cachedConfig;
    cachedConfig = exports.defaultConfig;
    return cachedConfig;
}
/**
 * Reload configuration from environment variables
 * Useful for testing or runtime config changes
 */
function reloadConfig() {
    cachedConfig = null;
    return getConfig();
}
// Convenience getters
function getEmbeddingBatchSize() {
    return getConfig().embedding.batchSize;
}
function getEmbeddingTimeout() {
    return getConfig().embedding.timeout;
}
function getEmbeddingServiceUrl() {
    return getConfig().embedding.serviceUrl;
}
function getEmbeddingSocketUrl() {
    return getConfig().embedding.socketUrl;
}
function getWebpackDevServerPort() {
    return getConfig().ports.webpackDevServer;
}
function getCLIServerPort() {
    return getConfig().ports.cliServer;
}
function isDevelopmentMode() {
    return getConfig().dev.enabled;
}
//# sourceMappingURL=config.js.map