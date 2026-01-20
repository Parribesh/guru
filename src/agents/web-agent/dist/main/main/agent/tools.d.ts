import { BrowserView } from 'electron';
export interface ToolDefinition {
    name: string;
    description: string;
    parameters: {
        type: 'object';
        properties: Record<string, {
            type: string;
            description: string;
            required?: boolean;
        }>;
        required?: string[];
    };
}
import { ToolCall, ToolResult } from './types';
export declare const DOM_TOOLS: ToolDefinition[];
export declare function executeTool(toolCall: ToolCall, browserView: BrowserView): Promise<ToolResult>;
//# sourceMappingURL=tools.d.ts.map