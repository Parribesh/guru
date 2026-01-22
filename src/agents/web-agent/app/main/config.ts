/**
 * Application Configuration
 * Centralized configuration values for the application
 * All settings can be overridden via environment variables in .env file
 */

/**
 * Complete application configuration interface
 */
export interface AppConfig {
  // Port configurations
  ports: {
    /** Webpack dev server port (for renderer process hot reload) */
    webpackDevServer: number;
    /** CLI server port (for command-line interface) */
    cliServer: number;
  };

  // Embedding service configuration
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

  // Development settings
  dev: {
    /** Enable hot module replacement */
    hotReload: boolean;
    /** Enable development mode features */
    enabled: boolean;
  };

  // AI/LLM configuration
  ai: {
    /** Ollama base URL */
    ollamaUrl: string;
    /** Default AI model */
    model: string;
  };

  // Paths
  paths: {
    /** Custom transformers cache directory */
    transformersCache?: string;
  };
}

/**
 * Parse port from environment variable with fallback
 */
function parsePort(envVar: string | undefined, defaultPort: number): number {
  if (!envVar) return defaultPort;
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
function getSocketUrl(httpUrl: string, explicitSocketUrl?: string): string {
  if (explicitSocketUrl) return explicitSocketUrl;
  
  try {
    const url = new URL(httpUrl);
    const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${url.host}/ws`;
  } catch {
    // Fallback if URL parsing fails
    return httpUrl.replace(/^https?:/, 'ws:').replace(/\/$/, '') + '/ws';
  }
}

/**
 * Default application configuration with environment variable support
 */
export const defaultConfig: AppConfig = {
  ports: {
    webpackDevServer: parsePort(process.env.WEBPACK_DEV_SERVER_PORT, 3000),
    cliServer: parsePort(process.env.CLI_SERVER_PORT, 9876),
  },

  embedding: {
    serviceUrl: process.env.EMBEDDING_SERVICE_URL || 'http://127.0.0.1:8000',
    socketUrl: getSocketUrl(
      process.env.EMBEDDING_SERVICE_URL || 'http://127.0.0.1:8000',
      process.env.EMBEDDING_SERVICE_SOCKET_URL
    ),
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
let cachedConfig: AppConfig | null = null;

/**
 * Get application configuration
 * Returns cached config or creates new one from environment
 */
export function getConfig(): AppConfig {
  if (cachedConfig) return cachedConfig;
  
  cachedConfig = defaultConfig;
  return cachedConfig;
}

/**
 * Reload configuration from environment variables
 * Useful for testing or runtime config changes
 */
export function reloadConfig(): AppConfig {
  cachedConfig = null;
  return getConfig();
}

// Convenience getters
export function getEmbeddingBatchSize(): number {
  return getConfig().embedding.batchSize;
}

export function getEmbeddingTimeout(): number {
  return getConfig().embedding.timeout;
}

export function getEmbeddingServiceUrl(): string {
  return getConfig().embedding.serviceUrl;
}

export function getEmbeddingSocketUrl(): string {
  return getConfig().embedding.socketUrl;
}

export function getWebpackDevServerPort(): number {
  return getConfig().ports.webpackDevServer;
}

export function getCLIServerPort(): number {
  return getConfig().ports.cliServer;
}

export function isDevelopmentMode(): boolean {
  return getConfig().dev.enabled;
}
