export interface LLMResponse {
    answer: string;
    prompt: string;
}
export interface LLMService {
    generateAnswer(prompt: string): Promise<LLMResponse>;
    checkConnection(): Promise<boolean>;
    ensureModelLoaded(): Promise<void>;
}
export declare function setLLMService(service: LLMService): void;
export declare function getLLMService(): LLMService;
export declare function generateAnswer(prompt: string): Promise<LLMResponse>;
export declare function initializeLLMService(): Promise<void>;
//# sourceMappingURL=service.d.ts.map