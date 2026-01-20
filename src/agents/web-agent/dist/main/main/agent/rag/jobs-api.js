"use strict";
/**
 * Jobs API Service
 * Handles CRUD operations for embedding jobs via HTTP API
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
exports.JobsAPI = void 0;
exports.getJobsAPI = getJobsAPI;
const http = __importStar(require("http"));
const https = __importStar(require("https"));
const url_1 = require("url");
const config_1 = require("../../config");
class JobsAPI {
    constructor() {
        this.baseUrl = (0, config_1.getEmbeddingServiceUrl)();
    }
    /**
     * Make HTTP request
     */
    async httpRequest(method, path, data) {
        return new Promise((resolve, reject) => {
            const url = new url_1.URL(path, this.baseUrl);
            const isHttps = url.protocol === 'https:';
            const options = {
                hostname: url.hostname,
                port: url.port || (isHttps ? 443 : 80),
                path: url.pathname + (url.search || ''),
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                },
                timeout: 10000,
            };
            const client = isHttps ? https : http;
            const req = client.request(options, (res) => {
                let responseData = '';
                res.on('data', (chunk) => {
                    responseData += chunk.toString();
                });
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            const json = responseData ? JSON.parse(responseData) : {};
                            resolve(json);
                        }
                        catch (error) {
                            resolve(responseData || {});
                        }
                    }
                    else {
                        reject(new Error(`HTTP ${res.statusCode}: ${responseData || res.statusMessage}`));
                    }
                });
            });
            req.on('error', (error) => {
                reject(error);
            });
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });
            if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
                req.write(JSON.stringify(data));
            }
            req.end();
        });
    }
    /**
     * List all jobs with optional filters
     */
    async listJobs(limit, status) {
        try {
            const params = new URLSearchParams();
            if (limit)
                params.append('limit', limit.toString());
            if (status)
                params.append('status', status);
            const queryString = params.toString();
            const path = `/api/embeddings/jobs${queryString ? `?${queryString}` : ''}`;
            const response = await this.httpRequest('GET', path);
            return Array.isArray(response) ? response : (response.jobs || []);
        }
        catch (error) {
            console.error('[JobsAPI] Error listing jobs:', error);
            throw error;
        }
    }
    /**
     * Get a single job by ID
     */
    async getJob(jobId) {
        try {
            const response = await this.httpRequest('GET', `/api/embeddings/job/${jobId}`);
            return response;
        }
        catch (error) {
            if (error.message.includes('404')) {
                return null;
            }
            console.error(`[JobsAPI] Error getting job ${jobId}:`, error);
            throw error;
        }
    }
    /**
     * Get job count with optional status filter
     */
    async getJobCount(status) {
        try {
            const path = `/api/embeddings/jobs/count${status ? `?status=${status}` : ''}`;
            const response = await this.httpRequest('GET', path);
            return typeof response === 'number' ? response : (response.count || response.total || 0);
        }
        catch (error) {
            console.error('[JobsAPI] Error getting job count:', error);
            throw error;
        }
    }
    /**
     * Delete a job by ID
     */
    async deleteJob(jobId) {
        try {
            await this.httpRequest('DELETE', `/api/embeddings/job/${jobId}`);
            return true;
        }
        catch (error) {
            console.error(`[JobsAPI] Error deleting job ${jobId}:`, error);
            throw error;
        }
    }
}
exports.JobsAPI = JobsAPI;
let jobsAPIInstance = null;
function getJobsAPI() {
    if (!jobsAPIInstance) {
        jobsAPIInstance = new JobsAPI();
    }
    return jobsAPIInstance;
}
//# sourceMappingURL=jobs-api.js.map