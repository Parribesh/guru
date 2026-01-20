"use strict";
/**
 * Queue API Service
 * Handles queue status and metrics from the embedding service
 */
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
exports.QueueAPI = void 0;
exports.getQueueAPI = getQueueAPI;
const http = __importStar(require("http"));
const https = __importStar(require("https"));
const url_1 = require("url");
const config_1 = require("../../config");
class QueueAPI {
    constructor() {
        this.baseUrl = (0, config_1.getEmbeddingServiceUrl)();
        // Get API key from environment or config
        this.apiKey = process.env.EMBEDDING_SERVICE_API_KEY || undefined;
        console.log('[QueueAPI] Initialized with baseUrl:', this.baseUrl, 'apiKey:', this.apiKey ? '***' : 'none');
    }
    /**
     * Make HTTP request
     */
    async httpRequest(method, path) {
        return new Promise((resolve, reject) => {
            const url = new url_1.URL(path, this.baseUrl);
            const isHttps = url.protocol === 'https:';
            const headers = {
                'Content-Type': 'application/json',
            };
            // Add API key if available (API contract requires X-API-Key header)
            if (this.apiKey) {
                headers['X-API-Key'] = this.apiKey;
            }
            const options = {
                hostname: url.hostname,
                port: url.port || (isHttps ? 443 : 80),
                path: url.pathname + (url.search || ''),
                method: method,
                headers,
                timeout: 5000,
            };
            console.log('[QueueAPI] Making request:', method, url.toString(), 'headers:', Object.keys(headers));
            const client = isHttps ? https : http;
            const req = client.request(options, (res) => {
                let responseData = '';
                res.on('data', (chunk) => {
                    responseData += chunk.toString();
                });
                res.on('end', () => {
                    console.log('[QueueAPI] Response status:', res.statusCode, 'data length:', responseData.length);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            const json = responseData ? JSON.parse(responseData) : {};
                            console.log('[QueueAPI] Parsed JSON response successfully');
                            resolve(json);
                        }
                        catch (error) {
                            console.warn('[QueueAPI] Failed to parse JSON, returning raw data');
                            resolve(responseData || {});
                        }
                    }
                    else {
                        console.error('[QueueAPI] HTTP error:', res.statusCode, responseData.substring(0, 200));
                        reject(new Error(`HTTP ${res.statusCode}: ${responseData || res.statusMessage}`));
                    }
                });
            });
            req.on('error', (error) => {
                console.error('[QueueAPI] Request error:', error.message, error.stack);
                reject(error);
            });
            req.on('timeout', () => {
                console.error('[QueueAPI] Request timeout after 5s');
                req.destroy();
                reject(new Error('Request timeout'));
            });
            req.end();
        });
    }
    /**
     * Get queue status with worker information
     */
    async getStatus() {
        try {
            console.log('[QueueAPI] Fetching queue status from:', this.baseUrl);
            const response = await this.httpRequest('GET', '/api/queue/status');
            console.log('[QueueAPI] Queue status response:', JSON.stringify(response).substring(0, 200));
            return response;
        }
        catch (error) {
            console.error('[QueueAPI] Error getting queue status:', error.message || error);
            throw error;
        }
    }
    /**
     * Get detailed queue metrics
     */
    async getMetrics() {
        try {
            console.log('[QueueAPI] Fetching queue metrics from:', this.baseUrl);
            const response = await this.httpRequest('GET', '/api/queue/metrics');
            console.log('[QueueAPI] Queue metrics response:', JSON.stringify(response).substring(0, 200));
            return response;
        }
        catch (error) {
            console.error('[QueueAPI] Error getting queue metrics:', error.message || error);
            throw error;
        }
    }
    /**
     * Get health status (includes queue metrics)
     */
    async getHealth() {
        try {
            const response = await this.httpRequest('GET', '/health');
            return response;
        }
        catch (error) {
            console.error('[QueueAPI] Error getting health:', error);
            throw error;
        }
    }
}
exports.QueueAPI = QueueAPI;
let queueAPIInstance = null;
function getQueueAPI() {
    if (!queueAPIInstance) {
        queueAPIInstance = new QueueAPI();
    }
    return queueAPIInstance;
}
//# sourceMappingURL=queue-api.js.map