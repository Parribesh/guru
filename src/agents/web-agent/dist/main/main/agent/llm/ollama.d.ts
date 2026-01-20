import { RetrievedContext } from '../../../shared/types';
import { ToolDefinition } from '../../agent/tools';
import { ToolCall, ToolResult } from '../../agent/types';
export declare function checkOllamaConnection(): Promise<boolean>;
export declare function ensureModelLoaded(): Promise<void>;
export declare function generateAnswer(question: string, context: RetrievedContext, pageMetadata: {
    url: string;
    title: string;
}): Promise<{
    answer: string;
    prompt: string;
}>;
export declare function generateAnswerFromPrompt(prompt: string): Promise<{
    answer: string;
    prompt: string;
}>;
export declare function buildQAPrompt(question: string, context: RetrievedContext, pageMetadata: {
    url: string;
    title: string;
}): string;
/**
 * Generate answer with tool calling support
 * This function handles AI responses that may include tool calls, executes them, and continues the conversation
 */
export declare function generateAnswerWithTools(question: string, pageContext: string, availableTools: ToolDefinition[], executeToolCallback: (toolCall: ToolCall) => Promise<ToolResult>): Promise<{
    success: boolean;
    answer?: string;
    error?: string;
}>;
//# sourceMappingURL=ollama.d.ts.map