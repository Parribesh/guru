"use strict";
// Agent System Types
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageRole = exports.AgentState = void 0;
var AgentState;
(function (AgentState) {
    AgentState["IDLE"] = "idle";
    AgentState["THINKING"] = "thinking";
    AgentState["EXECUTING_TOOL"] = "executing_tool";
    AgentState["WAITING_INPUT"] = "waiting_input";
    AgentState["ERROR"] = "error";
    AgentState["COMPLETED"] = "completed";
})(AgentState || (exports.AgentState = AgentState = {}));
var MessageRole;
(function (MessageRole) {
    MessageRole["USER"] = "user";
    MessageRole["ASSISTANT"] = "assistant";
    MessageRole["SYSTEM"] = "system";
    MessageRole["TOOL"] = "tool";
})(MessageRole || (exports.MessageRole = MessageRole = {}));
//# sourceMappingURL=types.js.map