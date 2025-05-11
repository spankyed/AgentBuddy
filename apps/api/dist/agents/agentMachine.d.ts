interface Ctx {
    sessionId: string;
    model: string;
    userPrompt?: string;
    abortController?: AbortController;
}
export declare const agentMachine: import("xstate").StateMachine<Ctx, {
    type: "USER_MSG";
    content: string;
} | {
    type: "LLM_DONE";
} | {
    type: "CANCEL";
}, {}, never, import("xstate").Values<{
    storePrompt: {
        type: "storePrompt";
        params: import("xstate").NonReducibleUnknown;
    };
    spawnLlmTask: {
        type: "spawnLlmTask";
        params: import("xstate").NonReducibleUnknown;
    };
}>, never, never, "idle" | "thinking", string, import("xstate").NonReducibleUnknown, import("xstate").NonReducibleUnknown, import("xstate").EventObject, import("xstate").MetaObject, {
    readonly id: "agent";
    readonly initial: "idle";
    readonly context: {
        readonly sessionId: "";
        readonly model: "gpt-4o";
    };
    readonly states: {
        readonly idle: {
            readonly on: {
                readonly USER_MSG: {
                    readonly target: "thinking";
                    readonly actions: "storePrompt";
                };
            };
        };
        readonly thinking: {
            readonly entry: readonly ["spawnLlmTask"];
            readonly on: {
                readonly LLM_DONE: "idle";
                readonly CANCEL: {
                    readonly target: "idle";
                };
            };
        };
    };
}>;
export {};
//# sourceMappingURL=agentMachine.d.ts.map