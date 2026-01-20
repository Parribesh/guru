/**
 * Application Configuration
 * Centralized configuration values for the application
 * All settings can be overridden via environment variables in .env file
 */
/**
 * Complete application configuration interface
 */
export interface AppConfig {
    ports: {
        /** Webpack dev server port (for renderer process hot reload) */
        webpackDevServer: number;
        /** CLI server port (for command-line interface) */
        cliServer: number;
    };
    embedding: {
        /** Base URL for the Python embedding service */
        serviceUrl: string;
        /** WebSocket URL for real-time progress monitoring */
        socketUrl: string;
        /** Optional API key for embedding service authentication */
        apiKey?: string;
        /** Batch size for embedding generation (number of chunks per batch) */
        batchSize: number;
        /** Timeout for embedding task completion (in milliseconds) */
        timeout: number;
    };
    dev: {
        /** Enable hot module replacement */
        hotReload: boolean;
        /** Enable development mode features */
        enabled: boolean;
    };
    ai: {
        /** Ollama base URL */
        ollamaUrl: string;
        /** Default AI model */
        model: string;
    };
    paths: {
        /** Custom transformers cache directory */
        transformersCache?: string;
    };
}
/**
 * Default application configuration with environment variable support
 */
export declare const defaultConfig: AppConfig;
/**
 * Get application configuration
 * Returns cached config or creates new one from environment
 */
export declare function getConfig(): AppConfig;
/**
 * Reload configuration from environment variables
 * Useful for testing or runtime config changes
 */
export declare function reloadConfig(): AppConfig;
export declare function getEmbeddingBatchSize(): number;
export declare function getEmbeddingTimeout(): number;
export declare function getEmbeddingServiceUrl(): string;
export declare function getEmbeddingSocketUrl(): string;
export declare function getWebpackDevServerPort(): number;
export declare function getCLIServerPort(): number;
export declare function isDevelopmentMode(): boolean;
//# sourceMappingURL=config.d.ts.map