import * as ai from 'ai';
import { ToolSet, LanguageModelUsage, CoreMessage, FinishReason } from 'ai';
import { z } from 'zod';
export { z } from 'zod';
import { allDefs } from '@/registries/systems';
export { ActionService } from '@/systems/actions/services/action';
export { PromptService } from '@/systems/prompts/services/prompt';
export { LibraryService } from '@/systems/library/services/library';
export { ActionEntity } from '@/systems/actions/types';
export { SettingsData } from '@/systems/settings/types';

/**
 * Type definitions for the OpenAI ChatGPT OAuth auth service.
 *
 * Mirrors the auth flow used by Codex CLI — browser OAuth with PKCE
 * to auth.openai.com, storing tokens in ~/.codex/auth.json.
 */
type AuthMode = 'chatgpt' | 'api-key';
interface ChatGPTTokens {
    /** JWT with claims (plan type, account ID, email, etc.) */
    idToken: string;
    /** Bearer token for API requests. */
    accessToken: string;
    /** For token refresh when access_token expires. */
    refreshToken: string;
    /** ChatGPT account/workspace ID (from JWT claims). Used as ChatGPT-Account-ID header. */
    accountId: string;
}
interface AuthState {
    mode: AuthMode;
    /** Present when mode === 'chatgpt'. */
    tokens?: ChatGPTTokens;
    /** Present when mode === 'api-key'. */
    apiKey?: string;
    /** ISO timestamp of last token refresh. */
    lastRefresh?: string;
}

/**
 * Type definitions for the model-client service.
 *
 * Maps OpenAI Responses API concepts to a typed service interface,
 * built on top of the Vercel AI SDK.
 */

/** Model + provider configuration for API calls. Only OpenAI Responses API is supported. */
interface ModelClientConfig {
    /** Provider — must be 'openai' or 'openai.responses' (Responses API only). */
    provider: 'openai' | 'openai.responses';
    /** Model ID (e.g. 'gpt-4o', 'o3'). */
    model: string;
    /** Explicit API key (overrides settings/env). */
    apiKey?: string;
    /** Custom base URL for the API. */
    baseURL?: string;
}
/** Configuration for a conversation (persists across turns). */
interface ConversationConfig extends ModelClientConfig {
    /** System instructions for the model. */
    instructions?: string;
    /** Reasoning configuration for reasoning models. */
    reasoning?: ReasoningConfig;
    /** Tools available to the model across all turns. */
    tools?: ToolSet;
    /** Whether to store the conversation for analytics. */
    store?: boolean;
    /** Arbitrary metadata attached to requests. */
    metadata?: Record<string, string>;
    /** Maximum agentic tool-use steps per turn. */
    maxSteps?: number;
}
/** Reasoning configuration for reasoning models (o3, etc). */
interface ReasoningConfig {
    effort: 'low' | 'medium' | 'high';
    summary?: 'auto' | 'concise' | 'detailed';
}
/** Parameters for a single turn. */
interface TurnParams {
    /** User input — string prompt or structured messages. */
    input: string | CoreMessage[];
    /** Per-turn tool overrides (merged with conversation tools). */
    tools?: ToolSet;
    /** Per-turn instruction overrides. */
    instructions?: string;
    /** Per-turn reasoning overrides. */
    reasoning?: ReasoningConfig;
    /** Max agentic steps for this turn (overrides conversation config). */
    maxSteps?: number;
    /** AbortSignal for cancellation. */
    signal?: AbortSignal;
}
/** Result of a completed turn. */
interface TurnResult {
    /** The response ID from the Responses API. */
    responseId: string | undefined;
    /** Final generated text. */
    text: string;
    /** Reasoning text (if reasoning model). */
    reasoning: string | undefined;
    /** Tool calls made during the turn. */
    toolCalls: unknown[];
    /** Tool results returned during the turn. */
    toolResults: unknown[];
    /** Token usage for this turn. */
    usage: LanguageModelUsage;
    /** Number of agentic steps taken. */
    steps: number;
    /** Why the turn finished. */
    finishReason: FinishReason;
}
type StreamEvent = {
    type: 'text-delta';
    textDelta: string;
} | {
    type: 'reasoning';
    textDelta: string;
} | {
    type: 'tool-call-start';
    toolCallId: string;
    toolName: string;
} | {
    type: 'tool-call-delta';
    toolCallId: string;
    toolName: string;
    argsTextDelta: string;
} | {
    type: 'tool-call';
    toolCallId: string;
    toolName: string;
    args: unknown;
} | {
    type: 'tool-result';
    toolCallId: string;
    toolName: string;
    result: unknown;
} | {
    type: 'step-complete';
    usage: LanguageModelUsage;
    finishReason: FinishReason;
    isContinued: boolean;
} | {
    type: 'turn-complete';
    usage: LanguageModelUsage;
    finishReason: FinishReason;
    responseId: string | undefined;
} | {
    type: 'error';
    error: unknown;
};
interface ConversationState {
    /** Previous response ID for threading. */
    previousResponseId: string | null;
    /** Number of turns completed. */
    turnCount: number;
    /** Cumulative token usage across all turns. */
    cumulativeUsage: LanguageModelUsage;
}
interface CompactParams {
    /** The response ID to compact up to. */
    previousResponseId: string;
    /** Model to use for compaction (defaults to conversation model). */
    model?: string;
}
interface CompactResult {
    /** New response ID after compaction. */
    newResponseId: string;
    /** Summary text (if returned). */
    summary?: string;
}
/**
 * Approval callback for tools that modify state.
 * Returns 'approved' to proceed or 'denied' to skip execution.
 */
type ApproveFn = (description: string, detail?: string) => Promise<'approved' | 'denied'>;
/** Callback to request freeform or multiple-choice input from the user mid-turn. */
type RequestInputFn = (questions: UserInputQuestion[]) => Promise<Record<string, string>>;
interface UserInputQuestion {
    id: string;
    header: string;
    question: string;
    options?: Array<{
        label: string;
        description: string;
    }>;
}
interface PlanStep {
    step: string;
    status: 'pending' | 'in_progress' | 'completed';
}
interface GoalState {
    objective: string;
    status: 'active' | 'paused' | 'complete';
    tokenBudget?: number;
    tokensUsed?: number;
}
/** Common options for tool factory functions. */
interface ToolOptions {
    /** Working directory — all paths resolved relative to this. */
    cwd: string;
    /** Optional approval callback for user confirmation before execution. */
    approve?: ApproveFn;
    /** Called when the model updates its plan. */
    onPlanUpdate?: (plan: PlanStep[], explanation?: string) => void;
    /** Called when the model creates or updates a goal. */
    onGoalUpdate?: (goal: GoalState) => void;
    /** Returns the current goal state (for get_goal). */
    getGoal?: () => GoalState | null;
    /** Callback to request user input mid-turn. */
    requestInput?: RequestInputFn;
}

/**
 * Conversation manager — tracks previous_response_id chains for the
 * OpenAI Responses API's built-in conversation threading.
 *
 * Each Conversation instance is stateful: it tracks the previousResponseId
 * and cumulative usage across turns. State is purely in-memory.
 */

declare class Conversation {
    private _config;
    private _previousResponseId;
    private _turnCount;
    private _cumulativeUsage;
    constructor(config: ConversationConfig);
    get state(): ConversationState;
    get previousResponseId(): string | null;
    /** Execute a turn with streaming events. */
    streamTurn(params: TurnParams): AsyncGenerator<StreamEvent>;
    /** Execute a turn and return the complete result (non-streaming). */
    generateTurn(params: TurnParams): Promise<TurnResult>;
    /** Compact the conversation history via the Responses API. */
    compact(): Promise<CompactResult>;
    /** Reset conversation state (clear previousResponseId chain). */
    reset(): void;
}

/**
 * Define a tool for the model to call.
 *
 * Thin wrapper around the AI SDK's `tool()` for ergonomic definitions.
 */
declare function defineTool<T extends z.ZodType>(opts: {
    description: string;
    parameters: T;
    execute: (args: z.infer<T>) => Promise<string>;
}): ai.Tool<T, string> & {
    execute: (args: T extends ai.Schema<any> ? T["_type"] : T extends z.ZodTypeAny ? z.TypeOf<T> : never, options: ai.ToolExecutionOptions) => PromiseLike<string>;
};
/**
 * Pre-configured OpenAI web search tool.
 *
 * Uses the Responses API's built-in `web_search_preview` tool.
 */
declare function webSearchTool(opts?: {
    searchContextSize?: 'low' | 'medium' | 'high';
    userLocation?: {
        type: 'approximate';
        city?: string;
        state?: string;
        country?: string;
    };
}): {
    type: "provider-defined";
    id: "openai.web_search_preview";
    args: {};
    parameters: z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>;
};

declare function shellTool(opts: ToolOptions): ai.Tool<z.ZodObject<{
    command: z.ZodString;
    workdir: z.ZodOptional<z.ZodString>;
    timeout_ms: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    command: string;
    workdir?: string | undefined;
    timeout_ms?: number | undefined;
}, {
    command: string;
    workdir?: string | undefined;
    timeout_ms?: number | undefined;
}>, string> & {
    execute: (args: {
        command: string;
        workdir?: string | undefined;
        timeout_ms?: number | undefined;
    }, options: ai.ToolExecutionOptions) => PromiseLike<string>;
};
declare function readFileTool(opts: Pick<ToolOptions, 'cwd'>): ai.Tool<z.ZodObject<{
    path: z.ZodString;
    offset: z.ZodOptional<z.ZodNumber>;
    limit: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    path: string;
    offset?: number | undefined;
    limit?: number | undefined;
}, {
    path: string;
    offset?: number | undefined;
    limit?: number | undefined;
}>, string> & {
    execute: (args: {
        path: string;
        offset?: number | undefined;
        limit?: number | undefined;
    }, options: ai.ToolExecutionOptions) => PromiseLike<string>;
};
declare function writeFileTool(opts: ToolOptions): ai.Tool<z.ZodObject<{
    path: z.ZodString;
    content: z.ZodString;
}, "strip", z.ZodTypeAny, {
    content: string;
    path: string;
}, {
    content: string;
    path: string;
}>, string> & {
    execute: (args: {
        content: string;
        path: string;
    }, options: ai.ToolExecutionOptions) => PromiseLike<string>;
};
declare function grepTool(opts: Pick<ToolOptions, 'cwd'>): ai.Tool<z.ZodObject<{
    pattern: z.ZodString;
    path: z.ZodOptional<z.ZodString>;
    include: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    pattern: string;
    path?: string | undefined;
    include?: string | undefined;
}, {
    pattern: string;
    path?: string | undefined;
    include?: string | undefined;
}>, string> & {
    execute: (args: {
        pattern: string;
        path?: string | undefined;
        include?: string | undefined;
    }, options: ai.ToolExecutionOptions) => PromiseLike<string>;
};
declare function listDirTool(opts: Pick<ToolOptions, 'cwd'>): ai.Tool<z.ZodObject<{
    path: z.ZodString;
}, "strip", z.ZodTypeAny, {
    path: string;
}, {
    path: string;
}>, string> & {
    execute: (args: {
        path: string;
    }, options: ai.ToolExecutionOptions) => PromiseLike<string>;
};
declare function patchTool(opts: ToolOptions): ai.Tool<z.ZodObject<{
    path: z.ZodString;
    patch: z.ZodString;
}, "strip", z.ZodTypeAny, {
    path: string;
    patch: string;
}, {
    path: string;
    patch: string;
}>, string> & {
    execute: (args: {
        path: string;
        patch: string;
    }, options: ai.ToolExecutionOptions) => PromiseLike<string>;
};
declare function planTool(opts: Pick<ToolOptions, 'onPlanUpdate'>): ai.Tool<z.ZodObject<{
    plan: z.ZodArray<z.ZodObject<{
        step: z.ZodString;
        status: z.ZodEnum<["pending", "in_progress", "completed"]>;
    }, "strip", z.ZodTypeAny, {
        status: "pending" | "in_progress" | "completed";
        step: string;
    }, {
        status: "pending" | "in_progress" | "completed";
        step: string;
    }>, "many">;
    explanation: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    plan: {
        status: "pending" | "in_progress" | "completed";
        step: string;
    }[];
    explanation?: string | undefined;
}, {
    plan: {
        status: "pending" | "in_progress" | "completed";
        step: string;
    }[];
    explanation?: string | undefined;
}>, string> & {
    execute: (args: {
        plan: {
            status: "pending" | "in_progress" | "completed";
            step: string;
        }[];
        explanation?: string | undefined;
    }, options: ai.ToolExecutionOptions) => PromiseLike<string>;
};
declare function goalTool(opts: Pick<ToolOptions, 'onGoalUpdate' | 'getGoal'>): ai.Tool<z.ZodObject<{
    action: z.ZodEnum<["create", "get", "update"]>;
    objective: z.ZodOptional<z.ZodString>;
    token_budget: z.ZodOptional<z.ZodNumber>;
    status: z.ZodOptional<z.ZodEnum<["active", "paused", "complete"]>>;
}, "strip", z.ZodTypeAny, {
    action: "create" | "get" | "update";
    status?: "active" | "paused" | "complete" | undefined;
    objective?: string | undefined;
    token_budget?: number | undefined;
}, {
    action: "create" | "get" | "update";
    status?: "active" | "paused" | "complete" | undefined;
    objective?: string | undefined;
    token_budget?: number | undefined;
}>, string> & {
    execute: (args: {
        action: "create" | "get" | "update";
        status?: "active" | "paused" | "complete" | undefined;
        objective?: string | undefined;
        token_budget?: number | undefined;
    }, options: ai.ToolExecutionOptions) => PromiseLike<string>;
};
declare function userInputTool(opts: Pick<ToolOptions, 'requestInput'>): ai.Tool<z.ZodObject<{
    questions: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        header: z.ZodString;
        question: z.ZodString;
        options: z.ZodOptional<z.ZodArray<z.ZodObject<{
            label: z.ZodString;
            description: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            label: string;
            description: string;
        }, {
            label: string;
            description: string;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        header: string;
        question: string;
        options?: {
            label: string;
            description: string;
        }[] | undefined;
    }, {
        id: string;
        header: string;
        question: string;
        options?: {
            label: string;
            description: string;
        }[] | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    questions: {
        id: string;
        header: string;
        question: string;
        options?: {
            label: string;
            description: string;
        }[] | undefined;
    }[];
}, {
    questions: {
        id: string;
        header: string;
        question: string;
        options?: {
            label: string;
            description: string;
        }[] | undefined;
    }[];
}>, string> & {
    execute: (args: {
        questions: {
            id: string;
            header: string;
            question: string;
            options?: {
                label: string;
                description: string;
            }[] | undefined;
        }[];
    }, options: ai.ToolExecutionOptions) => PromiseLike<string>;
};
declare function viewImageTool(opts: Pick<ToolOptions, 'cwd'>): ai.Tool<z.ZodObject<{
    path: z.ZodString;
}, "strip", z.ZodTypeAny, {
    path: string;
}, {
    path: string;
}>, string> & {
    execute: (args: {
        path: string;
    }, options: ai.ToolExecutionOptions) => PromiseLike<string>;
};

/**
 * Approval gate for tool execution.
 *
 * Provides a factory that creates an `ApproveFn` wired to the chat UI's
 * approval block system. When a tool needs approval, it sends a block
 * message to the chat thread and awaits the user's decision.
 *
 * The service layer stays UI-agnostic — the `ApproveFn` is injected by
 * the action/flow layer that owns the chat thread.
 */

interface ChatService {
    sendBlockMessage(opts: {
        threadId: string;
        text: string;
        blocks: Array<{
            type: string;
            props: Record<string, unknown>;
        }>;
        forkable?: boolean;
    }): {
        messageId: string;
        response: Promise<unknown>;
    };
}
interface ChatApproverOptions {
    /** Chat service for sending approval blocks. */
    chat: ChatService;
    /** Thread ID to send approval blocks to. */
    threadId: string;
    /** Called when the tool is waiting for approval (e.g. to pause stream indicators). */
    onPause?: () => void;
    /** Called when approval is received (e.g. to resume stream indicators). */
    onResume?: () => void;
}
/**
 * Create an `ApproveFn` that sends approval blocks to the chat UI.
 *
 * Usage:
 * ```ts
 * const approve = createChatApprover({ chat: services.chat, threadId })
 * const tools = codingAgentTools({ cwd: '/project', approve })
 * ```
 */
declare function createChatApprover(opts: ChatApproverOptions): ApproveFn;

/**
 * Tool presets — pre-assembled tool sets for common agent patterns.
 */

/**
 * Standard tool set for coding agents.
 *
 * Includes file operations, shell execution, search, planning, goals,
 * image viewing, and web search. Mutating tools (shell, write, patch)
 * use the provided `approve` callback. User input tool is only included
 * if `requestInput` is provided.
 */
declare function codingAgentTools(opts: ToolOptions): ToolSet;

interface FileEntry {
    name: string;
    isDirectory: boolean;
}
interface FileStat {
    size: number;
    mtime: Date;
    isDirectory: boolean;
    isFile: boolean;
}
interface FilesystemServiceType {
    writeFile(filePath: string, content: string): Promise<void>;
    readFile(filePath: string): Promise<string>;
    exists(filePath: string): Promise<boolean>;
    mkdir(dirPath: string): Promise<void>;
    readDir(dirPath: string): Promise<FileEntry[]>;
    remove(targetPath: string): Promise<void>;
    rename(oldPath: string, newPath: string): Promise<void>;
    stat(filePath: string): Promise<FileStat>;
}

interface TextStreamOptions {
    chunkSize?: number;
    delayMs?: number;
}
declare class TextStreamService {
    streamText(text: string, options?: TextStreamOptions): AsyncGenerator<string, void, unknown>;
    streamTextByChars(text: string, options?: TextStreamOptions): AsyncGenerator<string, void, unknown>;
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Unified auth credential resolution for LLM providers.
 *
 * Supports two auth modes:
 * 1. ChatGPT OAuth — access token + ChatGPT-Account-ID header (Pro subscribers)
 * 2. API key — traditional API key auth
 *
 * Priority: ChatGPT OAuth tokens > explicit API key > settings/secrets > env vars.
 */
type ProviderName = 'anthropic' | 'google' | 'openai' | 'groq' | 'mistral' | 'cohere';

type Provider = ProviderName | 'openai.responses' | string;
type ModelConfig = {
    provider: Provider;
    model: string;
    apiKey?: string;
};
declare function streamText(params: {
    model: ModelConfig;
    prompt?: string;
    messages?: CoreMessage[];
    system?: string;
    temperature?: number;
    maxTokens?: number;
    [key: string]: any;
}): Promise<ai.StreamTextResult<ai.ToolSet, never>>;
declare function generateText(params: {
    model: ModelConfig;
    prompt?: string;
    messages?: CoreMessage[];
    system?: string;
    temperature?: number;
    maxTokens?: number;
    [key: string]: any;
}): Promise<ai.GenerateTextResult<ai.ToolSet, never>>;
declare function streamObject<T>(params: {
    model: ModelConfig;
    schema: any;
    prompt?: string;
    messages?: CoreMessage[];
    system?: string;
    temperature?: number;
    maxTokens?: number;
    [key: string]: any;
}): Promise<ai.StreamObjectResult<ai.DeepPartial<T>, T, never>>;
declare function generateObject<T>(params: {
    model: ModelConfig;
    schema: any;
    prompt?: string;
    messages?: CoreMessage[];
    system?: string;
    temperature?: number;
    maxTokens?: number;
    [key: string]: any;
}): Promise<ai.GenerateObjectResult<T>>;

declare const llm_CoreMessage: typeof CoreMessage;
type llm_ModelConfig = ModelConfig;
type llm_Provider = Provider;
type llm_ProviderName = ProviderName;
declare const llm_generateObject: typeof generateObject;
declare const llm_generateText: typeof generateText;
declare const llm_streamObject: typeof streamObject;
declare const llm_streamText: typeof streamText;
declare namespace llm {
  export { llm_CoreMessage as CoreMessage, llm_generateObject as generateObject, llm_generateText as generateText, llm_streamObject as streamObject, llm_streamText as streamText };
  export type { llm_ModelConfig as ModelConfig, llm_Provider as Provider, llm_ProviderName as ProviderName };
}

type SystemErrorSeverity = 'error' | 'fatal';
type SystemErrorEvent = {
    type: 'SYSTEM_ERROR';
    pluginId: 'application';
    errorId: string;
    message: string;
    title?: string;
    source?: string;
    operation?: string;
    entityId?: string;
    severity: SystemErrorSeverity;
    stack?: string;
    timestamp: number;
};
type ApplicationOutgoingEvents = {
    type: 'CLIENT_CONNECTED';
    hasOnboarded: boolean;
    pluginId: 'application';
} | SystemErrorEvent;

type AllDefs = (typeof allDefs)[number];
type IncomingSystemEvents = AllDefs['_incoming'];
type OutgoingSystemEvents = AllDefs['_outgoing'] | ApplicationOutgoingEvents;

declare namespace EARS {
    export enum Entity {
        Agent = "Agent",
        Brain = "Brain",
        Message = "Message",
        Thread = "Thread",
        Relation = "Relation",
        Artifact = "Artifact",
        Flow = "Flow",
        Node = "Node",
        TNode = "TNode",
        Prompt = "Prompt",
        Action = "Action",
        Document = "Document",
        Collection = "Collection",
        SearchIndex = "SearchIndex",
        IndexedDoc = "IndexedDoc",
        Terminal = "Terminal",
        Directory = "Directory",
        Settings = "Settings",
        FAQ = "FAQ",
        Secret = "Secret",
        Note = "Note",
        BrowserTab = "BrowserTab",
        BrowserBookmark = "BrowserBookmark",
        CalendarEvent = "CalendarEvent"
    }
    export type EntityId = `${Entity}-${string}`;
    const RelKindValues: {
        readonly PARENT_OF: "parent_of";
        readonly CONTAINS: "contains";
        readonly REPLIED_TO: "replied_to";
        readonly HAS: "has";
        readonly BLOCKS: "blocks";
        readonly DEPENDS_ON: "depends_on";
        readonly RELATES_TO: "relates_to";
        readonly DUPLICATES: "duplicates";
        readonly TRANSITIONS_TO: "transitions_to";
        readonly EMITS: "emits";
        readonly INSTANCE_OF: "instance_of";
        readonly SPAWNED: "spawned";
        readonly TRACKED: "tracked";
    };
    export const RelKind: {
        readonly Custom: <T extends string>(k: T) => T & RelKind;
        readonly PARENT_OF: "parent_of";
        readonly CONTAINS: "contains";
        readonly REPLIED_TO: "replied_to";
        readonly HAS: "has";
        readonly BLOCKS: "blocks";
        readonly DEPENDS_ON: "depends_on";
        readonly RELATES_TO: "relates_to";
        readonly DUPLICATES: "duplicates";
        readonly TRANSITIONS_TO: "transitions_to";
        readonly EMITS: "emits";
        readonly INSTANCE_OF: "instance_of";
        readonly SPAWNED: "spawned";
        readonly TRACKED: "tracked";
    };
    export type RelKind = typeof RelKindValues[keyof typeof RelKindValues] | (string & {});
    export interface RelationDetail {
        sourceEntity: EntityId;
        targetEntity: EntityId;
        relationType: RelKind;
        info?: AttributeValue;
    }
    const RoleKindValues: {};
    export const RoleKind: {
        readonly Custom: <T extends string>(k: T) => T & RoleKind;
    };
    export type RoleKind = typeof RoleKindValues[keyof typeof RoleKindValues] | (string & {});
    export const AttrKindValues: {
        readonly Role: "role";
        readonly RelationDetails: "relationDetails";
    };
    export const AttrKind: {
        readonly Custom: <T extends string>(k: T) => T & AttrKind;
        readonly Role: "role";
        readonly RelationDetails: "relationDetails";
    };
    export type AttrKind = typeof AttrKindValues[keyof typeof AttrKindValues] | (string & {});
    export interface AttributePayloads {
        [AttrKindValues.Role]: RoleKind;
        [AttrKindValues.RelationDetails]: RelationDetail;
        [key: string]: any;
    }
    export type AttributeValue<K extends AttrKind = AttrKind> = K extends keyof AttributePayloads ? AttributePayloads[K] : any;
    export type AttributeTypeMap = Record<EntityId, AttributeValue[]>;
    export type AttributeType = AttrKind;
    export type AttributeStore = Record<string, AttributeTypeMap>;
    export type Blueprint = {
        entity: EARS.Entity;
        attrs?: Record<string, unknown>;
        roles?: EARS.RoleKind[];
        uniqueRoles?: EARS.RoleKind[];
        rels?: {
            kind: EARS.RelKind;
            target: Blueprint | EARS.EntityId;
            info?: unknown;
        }[];
    };
    export {};
}

type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;
/**
 * Emit an event to a frontend plugin
 * @param pluginId - The target plugin ID (or 'application' for main plugin)
 * @param event - The event to emit (without pluginId)
 * @example
 * sendToPlugin('threads', {
 *   type: 'TOKEN_STREAM',
 *   token: 'Hello'
 * });
 */
declare function sendToPlugin<P extends OutgoingSystemEvents['pluginId']>(pluginId: P, event: DistributiveOmit<Extract<OutgoingSystemEvents, {
    pluginId: P;
}>, 'pluginId'>): void;
/**
 * Emit an event to a backend system
 * @param systemId - The target system ID
 * @param event - The system event to emit (without systemId)
 * @example
 * sendToSystem('threads', {
 *   type: 'CREATE_THREAD',
 *   title: 'New Thread'
 * });
 */
declare function sendToSystem<T extends IncomingSystemEvents>(systemId: string, event: Omit<T, 'systemId'>): void;
/**
 * Emit TRIGGER_BRAIN_EVENT to brain system (internal use only)
 * Used by node handlers to fire events during flow execution
 * @param event - The brain event to emit
 * @example
 * sendToBrainSystem({
 *   eventType: 'user.login',
 *   payload: { userId: '123' },
 *   targetFlowId: 'TNode-123'
 * });
 */
declare function sendToBrainSystem(event: {
    eventType: string;
    payload?: any;
    targetFlowId?: EARS.EntityId;
}): void;
/**
 * Subscribe to outgoing events (events going to frontend)
 * @param callback - Function to call when an outgoing event is emitted
 * @returns Unsubscribe function
 */
declare function onOutgoing(callback: (event: OutgoingSystemEvents) => void): () => void;
/**
 * Subscribe to incoming events (events from frontend or internal)
 * @param callback - Function to call when an incoming event is emitted
 * @returns Unsubscribe function
 */
declare function onIncoming(callback: (event: IncomingSystemEvents) => void): () => void;

declare const emitter_onIncoming: typeof onIncoming;
declare const emitter_onOutgoing: typeof onOutgoing;
declare const emitter_sendToBrainSystem: typeof sendToBrainSystem;
declare const emitter_sendToPlugin: typeof sendToPlugin;
declare const emitter_sendToSystem: typeof sendToSystem;
declare namespace emitter {
  export {
    emitter_onIncoming as onIncoming,
    emitter_onOutgoing as onOutgoing,
    emitter_sendToBrainSystem as sendToBrainSystem,
    emitter_sendToPlugin as sendToPlugin,
    emitter_sendToSystem as sendToSystem,
  };
}

interface MediaRef {
    entityId: string;
    filename: string;
    alt: string;
    originalUrl: string;
}
interface ResolvedMedia extends MediaRef {
    filePath: string;
    mimeType: string;
}
/** Extract all media:// references from a markdown string. */
declare function extractMediaRefs(markdown: string): MediaRef[];
/** Resolve a MediaRef to an absolute file path with mime type. Returns null if file doesn't exist. */
declare function resolveMedia(ref: MediaRef): ResolvedMedia | null;
/** Read a media file into a Buffer. Returns null if the file doesn't exist. */
declare function readMediaBuffer(ref: MediaRef): {
    data: Buffer;
    mimeType: string;
} | null;
/** Extract media refs from markdown and resolve to file paths, filtering out missing files. */
declare function extractAndResolveImages(markdown: string): ResolvedMedia[];
/** Remove ![](media://...) image syntax from markdown, returning clean text. */
declare function stripMediaRefs(markdown: string): string;

interface ImagePart {
    type: 'image';
    image: Buffer;
    mimeType: string;
}
/** Extract all media refs from markdown and read them into AI SDK image parts. */
declare function extractImageParts(markdown: string): ImagePart[];

type media_ImagePart = ImagePart;
declare const media_extractAndResolveImages: typeof extractAndResolveImages;
declare const media_extractImageParts: typeof extractImageParts;
declare const media_extractMediaRefs: typeof extractMediaRefs;
declare const media_readMediaBuffer: typeof readMediaBuffer;
declare const media_resolveMedia: typeof resolveMedia;
declare const media_stripMediaRefs: typeof stripMediaRefs;
declare namespace media {
  export { media_extractAndResolveImages as extractAndResolveImages, media_extractImageParts as extractImageParts, media_extractMediaRefs as extractMediaRefs, media_readMediaBuffer as readMediaBuffer, media_resolveMedia as resolveMedia, media_stripMediaRefs as stripMediaRefs };
  export type { media_ImagePart as ImagePart };
}

declare const services: {
    logger: {
        source?: string;
        log(level: LogLevel, message: string, meta?: Record<string, any>): void;
        debug(message: string, meta?: Record<string, any>): void;
        info(message: string, meta?: Record<string, any>): void;
        warn(message: string, meta?: Record<string, any>): void;
        error(message: string, meta?: Record<string, any>): void;
    };
    llm: typeof llm;
    emitter: typeof emitter;
    database: any;
    prompt: any;
    action: any;
    library: any;
    browser: any;
    repository: any;
    settings: any;
    textStream: TextStreamService;
    chat: any;
    artifact: any;
    brain: any;
    media: typeof media;
    cli: any;
    filesystem: FilesystemServiceType;
    threads: any;
    codex: any;
    modelClient: {
        createConversation(config: ConversationConfig): Conversation;
        streamTurn: (params: TurnParams & ModelClientConfig) => AsyncGenerator<StreamEvent>;
        generateTurn: (params: TurnParams & ModelClientConfig) => Promise<TurnResult>;
        defineTool: typeof defineTool;
        webSearchTool: typeof webSearchTool;
        compact(params: CompactParams, config: ModelClientConfig): Promise<CompactResult>;
        shellTool: typeof shellTool;
        readFileTool: typeof readFileTool;
        writeFileTool: typeof writeFileTool;
        grepTool: typeof grepTool;
        listDirTool: typeof listDirTool;
        patchTool: typeof patchTool;
        planTool: typeof planTool;
        goalTool: typeof goalTool;
        userInputTool: typeof userInputTool;
        viewImageTool: typeof viewImageTool;
        codingAgentTools: typeof codingAgentTools;
        createChatApprover: typeof createChatApprover;
    };
    openaiAuth: {
        login(): Promise<AuthState>;
        logout(): Promise<void>;
        getCredentials(): Promise<{
            accessToken: string;
            accountId: string;
        } | null>;
        status(): Promise<AuthState | null>;
        isAuthenticated(): Promise<boolean>;
        clearAuth(): Promise<void>;
    };
};

/**
 * Action DSL Export Module
 * This module exports all types and functions needed for the Action DSL
 * Used to generate type definitions for Monaco Editor
 */

interface ActionParams {
    [key: string]: any;
}
type Services = typeof services;

declare const services: Services;
declare const params: ActionParams;

export { params, services };
export type { ActionParams, Services };
