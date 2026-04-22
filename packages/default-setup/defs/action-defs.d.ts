import * as zod from 'zod';
import { z } from 'zod';
export { z } from 'zod';
import * as ai from 'ai';
import { CoreMessage } from 'ai';
import { BrowserType, ElementHandle, Page, Browser, BrowserContext, chromium, firefox, webkit } from 'playwright';

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
        Note = "Note"
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
interface BaseEntity {
    id: EARS.EntityId;
    entityType: EARS.Entity;
    createdAt: number;
    updatedAt?: number;
}

type TokenSource = 'GITHUB_TOKEN' | 'keyring' | 'unknown';
type TokenKind = 'fine-grained-pat' | 'classic-pat' | 'oauth' | 'unknown';
interface ActiveTokenInfo {
    source: TokenSource;
    kind: TokenKind;
    prefix: string;
}

interface FileChangeInfo {
    path: string;
    modifiedAt: Date;
    changeType: 'add' | 'change' | 'unlink';
}

interface SecretEntity {
    id: EARS.EntityId;
    entityType: EARS.Entity.Secret;
    provider: SecretProvider;
    encryptedValue: string;
    customName?: string;
    createdAt: number;
    updatedAt?: number;
}
type SecretProvider = 'google' | 'anthropic' | 'openai' | 'groq' | 'mistral' | 'cohere' | 'custom';
interface CreateSecretParams {
    provider: SecretProvider;
    value: string;
    customName?: string;
}
interface SecretData {
    id: EARS.EntityId;
    provider: SecretProvider;
    customName?: string;
    createdAt: number;
    updatedAt?: number;
}

/**
 * Database Seed — loads compiled default-setup artifacts into LMDB
 *
 * Skips seeding if the compiled data hash is unchanged since last seed,
 * unless `force` is passed. The CLI script always forces.
 */
interface SeedCounts {
    created: number;
    updated: number;
    skipped: number;
}
interface SeedResult {
    actions: SeedCounts;
    prompts: SeedCounts;
    flows: SeedCounts;
    library: SeedCounts;
    notes: SeedCounts;
    settings: SeedCounts;
}

type Simplify<T> = {
    [K in keyof T]: T[K];
} & {};

/** Extract a union of inferred objects from a readonly tuple of Zod schemas. */
type EventsFromSchemas<S extends readonly z.ZodTypeAny[]> = {
    [K in keyof S]: z.infer<S[K]>;
}[number];

interface NoteEntity extends BaseEntity {
    entityType: EARS.Entity.Note;
    title: string;
    content: string;
    icon: string | null;
    noteType: 'document' | 'tasklist' | 'task';
    completed: boolean;
    hideCompletedChildren: boolean;
    displayOrder: number;
    savedDisplayOrder?: number;
    createdAt: number;
    updatedAt: number;
    lastSeen: number;
    favorite?: boolean;
    deleted?: boolean;
    deletedAt?: number;
}
interface NoteDTO {
    id: string;
    title: string;
    content: string;
    icon: string | null;
    noteType: 'document' | 'tasklist' | 'task';
    completed: boolean;
    hideCompletedChildren: boolean;
    parentId: string | null;
    displayOrder: number;
    savedDisplayOrder: number | null;
    childCount: number;
    createdAt: number;
    updatedAt: number;
    lastSeen: number;
    favorite: boolean;
    deletedAt?: number;
}
interface NotesConnectedData {
    notes: NoteDTO[];
    settings?: NotesSettings;
}

/**
 * Prompt template types and definitions
 */

/**
 * Defines an input parameter that a prompt template expects
 */
interface TemplateInput {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any';
    description?: string;
    required?: boolean;
    defaultValue?: any;
    commonSources?: string[];
    example?: any;
}
/**
 * Defines a prompt entity stored in the system
 */
interface PromptEntity extends BaseEntity {
    entityType: EARS.Entity.Prompt;
    label: string;
    description?: string;
    category?: string;
    inputs: Record<string, TemplateInput>;
    templateFn: string;
    outputSchema?: any;
    /** SHA256 hash of DSL source at last seed. Absent on user-created prompts. */
    sourceHash?: string;
    createdAt: number;
    updatedAt: number;
}
/**
 * Data sent on prompts system connection
 */
interface PromptsConnectedData {
    prompts: PromptEntity[];
    page: number;
    totalPages: number;
    totalCount: number;
    categories?: Category[];
}

declare const LogLevel: z.ZodEnum<["debug", "info", "warn", "error"]>;
type LogLevel = z.infer<typeof LogLevel>;
declare const LogEntry: z.ZodObject<{
    id: z.ZodString;
    timestamp: z.ZodNumber;
    level: z.ZodEnum<["debug", "info", "warn", "error"]>;
    message: z.ZodString;
    source: z.ZodOptional<z.ZodString>;
    meta: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    stack: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    timestamp: number;
    message: string;
    level: "debug" | "info" | "warn" | "error";
    meta?: Record<string, any> | undefined;
    source?: string | undefined;
    stack?: string | undefined;
}, {
    id: string;
    timestamp: number;
    message: string;
    level: "debug" | "info" | "warn" | "error";
    meta?: Record<string, any> | undefined;
    source?: string | undefined;
    stack?: string | undefined;
}>;
type LogEntry = z.infer<typeof LogEntry>;

interface DatabaseSchemaInfo {
    entities: Array<{
        type: EARS.Entity;
    }>;
    attributes: Array<{
        kind: string;
    }>;
    relations: Array<{
        kind: EARS.RelKind;
    }>;
}
interface DatabaseStartupData {
    schema: DatabaseSchemaInfo;
}

interface ActionParameter {
    type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any';
    description?: string;
    required?: boolean;
    default?: any;
    placeholder?: string;
}
interface ActionEntity {
    id: EARS.EntityId;
    entityType: EARS.Entity.Action;
    label: string;
    description?: string;
    category?: string;
    input: Record<string, ActionParameter>;
    actionFn: string;
    output?: any;
    /** SHA256 hash of DSL source at last seed. Absent on user-created actions. */
    sourceHash?: string;
    createdAt: number;
    updatedAt: number;
}
interface ActionsStartupData {
    actions: ActionEntity[];
    page: number;
    totalPages: number;
    totalCount: number;
    categories?: Category[];
}

/**
 * Type definitions + Zod schemas for the Claude Code stream-json wire protocol.
 *
 * The CLI is fast-moving and routinely adds fields; every object schema uses
 * `.passthrough()` so unknown fields survive round-trips and we only validate
 * the bits we actually read. Inferred TS types are exported next to each schema.
 *
 * Source of truth for field shapes: the stream-json writer at
 * `src/cli/structuredIO.ts` and the SDK Zod schemas at
 * `src/entrypoints/sdk/coreSchemas.ts` in the leaked Claude Code source.
 */

/**
 * Permission modes accepted by `claude --permission-mode`. Names match the
 * CLI's Commander validator exactly (see the leaked source at
 * `src/types/permissions.ts` or the error message the CLI prints when you
 * pass an unknown value).
 *
 * Interoperation note: only `default`, `plan`, and `acceptEdits` emit
 * `can_use_tool` control_requests that our wrapper's `onPermissionRequest`
 * hook can intercept. `bypassPermissions` and `dontAsk` short-circuit the
 * permission resolver entirely; `auto` is feature-gated and uses an ML
 * classifier instead of prompting.
 */
declare const PermissionModeSchema: z.ZodEnum<["default", "acceptEdits", "plan", "bypassPermissions", "dontAsk", "auto"]>;
type PermissionMode = z.infer<typeof PermissionModeSchema>;
declare const ThinkingSchema: z.ZodEnum<["enabled", "adaptive", "disabled"]>;
type Thinking = z.infer<typeof ThinkingSchema>;
declare const EffortSchema: z.ZodEnum<["low", "medium", "high", "max"]>;
type Effort = z.infer<typeof EffortSchema>;
declare const SettingScopeSchema: z.ZodEnum<["user", "project", "local"]>;
type SettingScope = z.infer<typeof SettingScopeSchema>;
/** `{type:'user', message:{role:'user', content:...}}` — replayed user turn. */
declare const UserStreamLineSchema: z.ZodObject<{
    uuid: z.ZodOptional<z.ZodString>;
    session_id: z.ZodOptional<z.ZodString>;
} & {
    type: z.ZodLiteral<"user">;
    message: z.ZodObject<{
        role: z.ZodLiteral<"user">;
        content: z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodAny, "many">]>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        role: z.ZodLiteral<"user">;
        content: z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodAny, "many">]>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        role: z.ZodLiteral<"user">;
        content: z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodAny, "many">]>;
    }, z.ZodTypeAny, "passthrough">>;
    parent_tool_use_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    isReplay: z.ZodOptional<z.ZodBoolean>;
    isSynthetic: z.ZodOptional<z.ZodBoolean>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    uuid: z.ZodOptional<z.ZodString>;
    session_id: z.ZodOptional<z.ZodString>;
} & {
    type: z.ZodLiteral<"user">;
    message: z.ZodObject<{
        role: z.ZodLiteral<"user">;
        content: z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodAny, "many">]>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        role: z.ZodLiteral<"user">;
        content: z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodAny, "many">]>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        role: z.ZodLiteral<"user">;
        content: z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodAny, "many">]>;
    }, z.ZodTypeAny, "passthrough">>;
    parent_tool_use_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    isReplay: z.ZodOptional<z.ZodBoolean>;
    isSynthetic: z.ZodOptional<z.ZodBoolean>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    uuid: z.ZodOptional<z.ZodString>;
    session_id: z.ZodOptional<z.ZodString>;
} & {
    type: z.ZodLiteral<"user">;
    message: z.ZodObject<{
        role: z.ZodLiteral<"user">;
        content: z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodAny, "many">]>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        role: z.ZodLiteral<"user">;
        content: z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodAny, "many">]>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        role: z.ZodLiteral<"user">;
        content: z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodAny, "many">]>;
    }, z.ZodTypeAny, "passthrough">>;
    parent_tool_use_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    isReplay: z.ZodOptional<z.ZodBoolean>;
    isSynthetic: z.ZodOptional<z.ZodBoolean>;
}, z.ZodTypeAny, "passthrough">>;
type UserStreamLine = z.infer<typeof UserStreamLineSchema>;
/** `{type:'assistant', message:{role:'assistant', content:[...blocks]}}` */
declare const AssistantStreamLineSchema: z.ZodObject<{
    uuid: z.ZodOptional<z.ZodString>;
    session_id: z.ZodOptional<z.ZodString>;
} & {
    type: z.ZodLiteral<"assistant">;
    message: z.ZodObject<{
        role: z.ZodLiteral<"assistant">;
        content: z.ZodArray<z.ZodAny, "many">;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        role: z.ZodLiteral<"assistant">;
        content: z.ZodArray<z.ZodAny, "many">;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        role: z.ZodLiteral<"assistant">;
        content: z.ZodArray<z.ZodAny, "many">;
    }, z.ZodTypeAny, "passthrough">>;
    parent_tool_use_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    error: z.ZodOptional<z.ZodObject<{
        type: z.ZodString;
        message: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        type: z.ZodString;
        message: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        type: z.ZodString;
        message: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    uuid: z.ZodOptional<z.ZodString>;
    session_id: z.ZodOptional<z.ZodString>;
} & {
    type: z.ZodLiteral<"assistant">;
    message: z.ZodObject<{
        role: z.ZodLiteral<"assistant">;
        content: z.ZodArray<z.ZodAny, "many">;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        role: z.ZodLiteral<"assistant">;
        content: z.ZodArray<z.ZodAny, "many">;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        role: z.ZodLiteral<"assistant">;
        content: z.ZodArray<z.ZodAny, "many">;
    }, z.ZodTypeAny, "passthrough">>;
    parent_tool_use_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    error: z.ZodOptional<z.ZodObject<{
        type: z.ZodString;
        message: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        type: z.ZodString;
        message: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        type: z.ZodString;
        message: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    uuid: z.ZodOptional<z.ZodString>;
    session_id: z.ZodOptional<z.ZodString>;
} & {
    type: z.ZodLiteral<"assistant">;
    message: z.ZodObject<{
        role: z.ZodLiteral<"assistant">;
        content: z.ZodArray<z.ZodAny, "many">;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        role: z.ZodLiteral<"assistant">;
        content: z.ZodArray<z.ZodAny, "many">;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        role: z.ZodLiteral<"assistant">;
        content: z.ZodArray<z.ZodAny, "many">;
    }, z.ZodTypeAny, "passthrough">>;
    parent_tool_use_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    error: z.ZodOptional<z.ZodObject<{
        type: z.ZodString;
        message: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        type: z.ZodString;
        message: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        type: z.ZodString;
        message: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>>;
}, z.ZodTypeAny, "passthrough">>;
type AssistantStreamLine = z.infer<typeof AssistantStreamLineSchema>;
/** `{type:'stream_event', event:{...}}` — partial message chunks. */
declare const StreamEventLineSchema: z.ZodObject<{
    uuid: z.ZodOptional<z.ZodString>;
    session_id: z.ZodOptional<z.ZodString>;
} & {
    type: z.ZodLiteral<"stream_event">;
    event: z.ZodObject<{
        type: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        type: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        type: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>;
    parent_tool_use_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    uuid: z.ZodOptional<z.ZodString>;
    session_id: z.ZodOptional<z.ZodString>;
} & {
    type: z.ZodLiteral<"stream_event">;
    event: z.ZodObject<{
        type: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        type: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        type: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>;
    parent_tool_use_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    uuid: z.ZodOptional<z.ZodString>;
    session_id: z.ZodOptional<z.ZodString>;
} & {
    type: z.ZodLiteral<"stream_event">;
    event: z.ZodObject<{
        type: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        type: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        type: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>;
    parent_tool_use_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.ZodTypeAny, "passthrough">>;
type StreamEventLine = z.infer<typeof StreamEventLineSchema>;
/** Tool-use progress heartbeat. */
declare const ToolProgressLineSchema: z.ZodObject<{
    uuid: z.ZodOptional<z.ZodString>;
    session_id: z.ZodOptional<z.ZodString>;
} & {
    type: z.ZodLiteral<"tool_progress">;
    tool_use_id: z.ZodString;
    tool_name: z.ZodString;
    elapsed_time_seconds: z.ZodOptional<z.ZodNumber>;
    parent_tool_use_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    uuid: z.ZodOptional<z.ZodString>;
    session_id: z.ZodOptional<z.ZodString>;
} & {
    type: z.ZodLiteral<"tool_progress">;
    tool_use_id: z.ZodString;
    tool_name: z.ZodString;
    elapsed_time_seconds: z.ZodOptional<z.ZodNumber>;
    parent_tool_use_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    uuid: z.ZodOptional<z.ZodString>;
    session_id: z.ZodOptional<z.ZodString>;
} & {
    type: z.ZodLiteral<"tool_progress">;
    tool_use_id: z.ZodString;
    tool_name: z.ZodString;
    elapsed_time_seconds: z.ZodOptional<z.ZodNumber>;
    parent_tool_use_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.ZodTypeAny, "passthrough">>;
type ToolProgressLine = z.infer<typeof ToolProgressLineSchema>;
/** System lines — many subtypes, all passthrough. */
declare const SystemLineSchema: z.ZodObject<{
    uuid: z.ZodOptional<z.ZodString>;
    session_id: z.ZodOptional<z.ZodString>;
} & {
    type: z.ZodLiteral<"system">;
    subtype: z.ZodString;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    uuid: z.ZodOptional<z.ZodString>;
    session_id: z.ZodOptional<z.ZodString>;
} & {
    type: z.ZodLiteral<"system">;
    subtype: z.ZodString;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    uuid: z.ZodOptional<z.ZodString>;
    session_id: z.ZodOptional<z.ZodString>;
} & {
    type: z.ZodLiteral<"system">;
    subtype: z.ZodString;
}, z.ZodTypeAny, "passthrough">>;
type SystemLine = z.infer<typeof SystemLineSchema>;
/** Rate limit warnings. */
declare const RateLimitLineSchema: z.ZodObject<{
    uuid: z.ZodOptional<z.ZodString>;
    session_id: z.ZodOptional<z.ZodString>;
} & {
    type: z.ZodLiteral<"rate_limit_event">;
    rate_limit_info: z.ZodObject<{}, "passthrough", z.ZodTypeAny, z.objectOutputType<{}, z.ZodTypeAny, "passthrough">, z.objectInputType<{}, z.ZodTypeAny, "passthrough">>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    uuid: z.ZodOptional<z.ZodString>;
    session_id: z.ZodOptional<z.ZodString>;
} & {
    type: z.ZodLiteral<"rate_limit_event">;
    rate_limit_info: z.ZodObject<{}, "passthrough", z.ZodTypeAny, z.objectOutputType<{}, z.ZodTypeAny, "passthrough">, z.objectInputType<{}, z.ZodTypeAny, "passthrough">>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    uuid: z.ZodOptional<z.ZodString>;
    session_id: z.ZodOptional<z.ZodString>;
} & {
    type: z.ZodLiteral<"rate_limit_event">;
    rate_limit_info: z.ZodObject<{}, "passthrough", z.ZodTypeAny, z.objectOutputType<{}, z.ZodTypeAny, "passthrough">, z.objectInputType<{}, z.ZodTypeAny, "passthrough">>;
}, z.ZodTypeAny, "passthrough">>;
type RateLimitLine = z.infer<typeof RateLimitLineSchema>;
/** Tool-use summary ("Read 2 files, wrote 1 file"). */
declare const ToolUseSummaryLineSchema: z.ZodObject<{
    uuid: z.ZodOptional<z.ZodString>;
    session_id: z.ZodOptional<z.ZodString>;
} & {
    type: z.ZodLiteral<"tool_use_summary">;
    summary: z.ZodString;
    preceding_tool_use_ids: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    uuid: z.ZodOptional<z.ZodString>;
    session_id: z.ZodOptional<z.ZodString>;
} & {
    type: z.ZodLiteral<"tool_use_summary">;
    summary: z.ZodString;
    preceding_tool_use_ids: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    uuid: z.ZodOptional<z.ZodString>;
    session_id: z.ZodOptional<z.ZodString>;
} & {
    type: z.ZodLiteral<"tool_use_summary">;
    summary: z.ZodString;
    preceding_tool_use_ids: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, z.ZodTypeAny, "passthrough">>;
type ToolUseSummaryLine = z.infer<typeof ToolUseSummaryLineSchema>;
/** Final result line — marks turn completion. */
declare const ResultLineSchema: z.ZodObject<{
    uuid: z.ZodOptional<z.ZodString>;
    session_id: z.ZodOptional<z.ZodString>;
} & {
    type: z.ZodLiteral<"result">;
    subtype: z.ZodString;
    is_error: z.ZodOptional<z.ZodBoolean>;
    duration_ms: z.ZodOptional<z.ZodNumber>;
    duration_api_ms: z.ZodOptional<z.ZodNumber>;
    num_turns: z.ZodOptional<z.ZodNumber>;
    result: z.ZodOptional<z.ZodString>;
    stop_reason: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    total_cost_usd: z.ZodOptional<z.ZodNumber>;
    usage: z.ZodOptional<z.ZodObject<{}, "passthrough", z.ZodTypeAny, z.objectOutputType<{}, z.ZodTypeAny, "passthrough">, z.objectInputType<{}, z.ZodTypeAny, "passthrough">>>;
    modelUsage: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    permission_denials: z.ZodOptional<z.ZodArray<z.ZodObject<{}, "passthrough", z.ZodTypeAny, z.objectOutputType<{}, z.ZodTypeAny, "passthrough">, z.objectInputType<{}, z.ZodTypeAny, "passthrough">>, "many">>;
    structured_output: z.ZodOptional<z.ZodUnknown>;
    errors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    uuid: z.ZodOptional<z.ZodString>;
    session_id: z.ZodOptional<z.ZodString>;
} & {
    type: z.ZodLiteral<"result">;
    subtype: z.ZodString;
    is_error: z.ZodOptional<z.ZodBoolean>;
    duration_ms: z.ZodOptional<z.ZodNumber>;
    duration_api_ms: z.ZodOptional<z.ZodNumber>;
    num_turns: z.ZodOptional<z.ZodNumber>;
    result: z.ZodOptional<z.ZodString>;
    stop_reason: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    total_cost_usd: z.ZodOptional<z.ZodNumber>;
    usage: z.ZodOptional<z.ZodObject<{}, "passthrough", z.ZodTypeAny, z.objectOutputType<{}, z.ZodTypeAny, "passthrough">, z.objectInputType<{}, z.ZodTypeAny, "passthrough">>>;
    modelUsage: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    permission_denials: z.ZodOptional<z.ZodArray<z.ZodObject<{}, "passthrough", z.ZodTypeAny, z.objectOutputType<{}, z.ZodTypeAny, "passthrough">, z.objectInputType<{}, z.ZodTypeAny, "passthrough">>, "many">>;
    structured_output: z.ZodOptional<z.ZodUnknown>;
    errors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    uuid: z.ZodOptional<z.ZodString>;
    session_id: z.ZodOptional<z.ZodString>;
} & {
    type: z.ZodLiteral<"result">;
    subtype: z.ZodString;
    is_error: z.ZodOptional<z.ZodBoolean>;
    duration_ms: z.ZodOptional<z.ZodNumber>;
    duration_api_ms: z.ZodOptional<z.ZodNumber>;
    num_turns: z.ZodOptional<z.ZodNumber>;
    result: z.ZodOptional<z.ZodString>;
    stop_reason: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    total_cost_usd: z.ZodOptional<z.ZodNumber>;
    usage: z.ZodOptional<z.ZodObject<{}, "passthrough", z.ZodTypeAny, z.objectOutputType<{}, z.ZodTypeAny, "passthrough">, z.objectInputType<{}, z.ZodTypeAny, "passthrough">>>;
    modelUsage: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    permission_denials: z.ZodOptional<z.ZodArray<z.ZodObject<{}, "passthrough", z.ZodTypeAny, z.objectOutputType<{}, z.ZodTypeAny, "passthrough">, z.objectInputType<{}, z.ZodTypeAny, "passthrough">>, "many">>;
    structured_output: z.ZodOptional<z.ZodUnknown>;
    errors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, z.ZodTypeAny, "passthrough">>;
type ResultLine = z.infer<typeof ResultLineSchema>;
/** Control request from CLI → wrapper. Dispatched to the control router. */
declare const ControlRequestLineSchema: z.ZodObject<{
    type: z.ZodLiteral<"control_request">;
    request_id: z.ZodString;
    request: z.ZodObject<{
        subtype: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        subtype: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        subtype: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    type: z.ZodLiteral<"control_request">;
    request_id: z.ZodString;
    request: z.ZodObject<{
        subtype: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        subtype: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        subtype: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    type: z.ZodLiteral<"control_request">;
    request_id: z.ZodString;
    request: z.ZodObject<{
        subtype: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        subtype: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        subtype: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>;
}, z.ZodTypeAny, "passthrough">>;
type ControlRequestLine = z.infer<typeof ControlRequestLineSchema>;
/** Control response — normally wrapper → CLI, but can echo on stdout too. */
declare const ControlResponseLineSchema: z.ZodObject<{
    type: z.ZodLiteral<"control_response">;
    response: z.ZodObject<{
        subtype: z.ZodEnum<["success", "error"]>;
        request_id: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        subtype: z.ZodEnum<["success", "error"]>;
        request_id: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        subtype: z.ZodEnum<["success", "error"]>;
        request_id: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    type: z.ZodLiteral<"control_response">;
    response: z.ZodObject<{
        subtype: z.ZodEnum<["success", "error"]>;
        request_id: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        subtype: z.ZodEnum<["success", "error"]>;
        request_id: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        subtype: z.ZodEnum<["success", "error"]>;
        request_id: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    type: z.ZodLiteral<"control_response">;
    response: z.ZodObject<{
        subtype: z.ZodEnum<["success", "error"]>;
        request_id: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        subtype: z.ZodEnum<["success", "error"]>;
        request_id: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        subtype: z.ZodEnum<["success", "error"]>;
        request_id: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>;
}, z.ZodTypeAny, "passthrough">>;
type ControlResponseLine = z.infer<typeof ControlResponseLineSchema>;
/** `control_cancel_request` — CLI withdraws a pending control request. */
declare const ControlCancelLineSchema: z.ZodObject<{
    type: z.ZodLiteral<"control_cancel_request">;
    request_id: z.ZodString;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    type: z.ZodLiteral<"control_cancel_request">;
    request_id: z.ZodString;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    type: z.ZodLiteral<"control_cancel_request">;
    request_id: z.ZodString;
}, z.ZodTypeAny, "passthrough">>;
type ControlCancelLine = z.infer<typeof ControlCancelLineSchema>;
/** `keep_alive` — NDJSON heartbeat, silently ignored by readers. */
declare const KeepAliveLineSchema: z.ZodObject<{
    type: z.ZodLiteral<"keep_alive">;
}, "strip", z.ZodTypeAny, {
    type: "keep_alive";
}, {
    type: "keep_alive";
}>;
type KeepAliveLine = z.infer<typeof KeepAliveLineSchema>;
/** Fallthrough catch-all: the CLI adds new top-level types regularly. */
declare const UnknownLineSchema: z.ZodObject<{
    type: z.ZodString;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    type: z.ZodString;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    type: z.ZodString;
}, z.ZodTypeAny, "passthrough">>;
type UnknownLine = z.infer<typeof UnknownLineSchema>;
/**
 * Every line type we explicitly recognise. Each variant has a literal
 * `type` discriminator so a `switch(line.type)` narrows exhaustively
 * without casts. Used internally by `pump()` in `query.ts`.
 */
/** Emitted by the pump when a JSON line fails to parse. */
interface ParseErrorLine {
    type: '__parse_error';
    raw: string;
    error: string;
}
type KnownStreamLine = UserStreamLine | AssistantStreamLine | StreamEventLine | ToolProgressLine | SystemLine | RateLimitLine | ToolUseSummaryLine | ResultLine | ControlRequestLine | ControlResponseLine | ControlCancelLine | KeepAliveLine | ParseErrorLine;
/**
 * Public stream-line type. Callers iterate these out of `query().events`.
 * Includes `UnknownLine` as a catch-all so the CLI can add new top-level
 * types without breaking the wrapper.
 */
type StreamLine = KnownStreamLine | UnknownLine;
/** `control_request` subtype=`can_use_tool` — the permission prompt. */
interface CanUseToolRequest {
    subtype: 'can_use_tool';
    tool_name: string;
    input: Record<string, unknown>;
    tool_use_id: string;
    agent_id?: string;
    blocked_path?: string;
    decision_reason?: string;
    title?: string;
    description?: string;
}
/**
 * The response shape for `can_use_tool`, as required by the Claude Code
 * CLI at:
 *   packages/claude-code/src/utils/permissions/PermissionPromptToolResultSchema.ts
 *
 * - `allow` MUST include `updatedInput` (Record<string, unknown>). The CLI
 *   treats an empty object as "run with the original tool input", so
 *   callers that don't intend to modify the input should echo `req.input`
 *   back verbatim — this is the safer default.
 * - `deny` MUST include a `message` string. Callers that don't have a
 *   specific reason should send a generic "User denied".
 *
 * Malformed responses (missing required fields) are rejected by the CLI
 * with a `ZodError: invalid_union` that surfaces as "Tool permission
 * request failed: …" on the user's tool-activity row. Both required
 * fields are enforced statically here so that class of bug can't
 * silently reoccur at the call site.
 */
type PermissionDecision = {
    behavior: 'allow';
    updatedInput: Record<string, unknown>;
    updatedPermissions?: Array<Record<string, unknown>>;
    toolUseID?: string;
    decisionClassification?: 'user_temporary' | 'user_permanent' | 'user_reject';
} | {
    behavior: 'deny';
    message: string;
    interrupt?: boolean;
    toolUseID?: string;
    decisionClassification?: 'user_temporary' | 'user_permanent' | 'user_reject';
};
/** Caller hook: decide a tool permission request. */
type PermissionHandler = (request: CanUseToolRequest) => PermissionDecision | Promise<PermissionDecision>;
/** Caller hook: handle arbitrary control request subtypes we don't special-case. */
type ControlRequestHandler = (request: {
    subtype: string;
} & Record<string, unknown>) => unknown | Promise<unknown>;
/**
 * Every option supported by `claude --print`. Grouped by concern.
 *
 * These translate 1:1 to CLI flags via `argsFromOptions()` — if you add a
 * field here, add the mapping there and a unit test covering it.
 */
interface QueryOptions {
    prompt?: string | UserInputMessage;
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    signal?: AbortSignal;
    cliPath?: string;
    model?: string;
    fallbackModel?: string;
    effort?: Effort;
    thinking?: Thinking;
    maxThinkingTokens?: number;
    maxTurns?: number;
    maxBudgetUsd?: number;
    betas?: string[];
    agent?: string;
    agents?: Record<string, {
        description: string;
        prompt: string;
    }>;
    permissionMode?: PermissionMode;
    dangerouslySkipPermissions?: boolean;
    allowedTools?: string[];
    disallowedTools?: string[];
    tools?: string[] | 'default';
    systemPrompt?: string;
    appendSystemPrompt?: string;
    systemPromptFile?: string;
    appendSystemPromptFile?: string;
    mcpConfig?: string[];
    strictMcpConfig?: boolean;
    pluginDir?: string[];
    addDir?: string[];
    settings?: string;
    settingSources?: SettingScope[];
    jsonSchema?: unknown;
    sessionId?: string;
    continue?: boolean;
    resume?: string | true;
    forkSession?: boolean;
    /** Load only messages up to this CLI message UUID (SDK/print mode). */
    resumeSessionAt?: string;
    /** Restore files to state at this user message UUID and exit. Requires resume. */
    rewindFiles?: string;
    noSessionPersistence?: boolean;
    /** Run in a git worktree for isolated file mutations. Optional name. */
    worktree?: string | true;
    includePartialMessages?: boolean;
    includeHookEvents?: boolean;
    replayUserMessages?: boolean;
    /**
     * Keep stdin open after the initial `prompt` is written so the caller can
     * drive follow-up turns via `handle.send()`. Default `false` — the CLI's
     * stream-json mode blocks waiting for more stdin input after emitting the
     * `result` line, so leaving stdin open deadlocks callers that just drain
     * events in a `for await`. If you set this, you OWN `handle.close()`.
     */
    keepStdinOpen?: boolean;
    /**
     * Surface `control_request` events in the `handle.events` stream instead of
     * routing them through the `onPermissionRequest` / `onControlRequest` callbacks.
     * The consumer handles them inline in its event loop and sends responses via
     * `handle.respond(requestId, response)`. Default `false` for backwards compat.
     *
     * When `true`, the callbacks are ignored — the pump pushes control_request
     * lines into the event queue like any other event type, and the consumer is
     * responsible for sending the control_response.
     */
    surfaceControlRequests?: boolean;
    onPermissionRequest?: PermissionHandler;
    onControlRequest?: ControlRequestHandler;
}
/** User message written to stdin during a stream-json conversation. */
interface UserInputMessage {
    type: 'user';
    message: {
        role: 'user';
        content: string | Array<Record<string, unknown>>;
    };
    parent_tool_use_id?: string | null;
    session_id?: string;
}
/** Normalised result returned from `query().result`. */
interface QueryResult {
    sessionId: string;
    text: string;
    durationMs: number;
    numTurns: number;
    totalCostUsd: number;
    usage?: Record<string, unknown>;
    structuredOutput?: unknown;
    permissionDenials: Array<Record<string, unknown>>;
    raw: ResultLine;
}

type BlockType = 'prompt' | 'note' | 'markdown' | 'file-picker' | 'choice' | 'text' | 'approval' | 'actions' | 'link' | 'button-group' | 'tool-activity' | 'question' | 'project-select' | 'toggles' | 'tool-input' | 'context-usage' | 'session-list';
interface BlockConfig {
    type: BlockType;
    props: Record<string, any>;
}
interface LinkEvent {
    target: 'application' | 'external' | string;
    data: any;
}
type LinkIcon = 'external-link' | 'file-text' | 'message-square' | 'settings' | 'link';
interface LinkConfig {
    label: string;
    event: LinkEvent;
    icon?: LinkIcon;
}
interface ButtonConfig {
    id: string;
    label: string;
    state: string;
    states?: Record<string, {
        label: string;
        variant?: 'primary' | 'secondary' | 'success' | 'danger';
        disabled?: boolean;
    }>;
    toggleStates?: {
        on: {
            label: string;
            variant?: 'primary' | 'secondary' | 'success' | 'danger';
            disabled?: boolean;
        };
        off: {
            label: string;
            variant?: 'primary' | 'secondary' | 'success' | 'danger';
            disabled?: boolean;
        };
    };
}
interface FileReference {
    name: string;
    path: string;
    typeLabel: string;
    isImage: boolean;
    previewUrl?: string;
}
interface ImageReference {
    url: string;
    name: string;
}
type ContextReferenceType = 'thread' | 'document' | 'note' | 'task' | 'tasklist' | 'folder';
interface ContextReference {
    refType: ContextReferenceType;
    refId: string;
    shortCode: string;
    label: string;
}
interface MessageReferences {
    images?: ImageReference[];
    files?: FileReference[];
    context?: ContextReference[];
}
/**
 * Shapes a block can emit back to the backend when the user interacts
 * with it. Non-discriminated on purpose — text and choice blocks emit
 * raw primitives on submit (TextInput.vue:207, ChoiceInput.vue:225),
 * while approval and cancel blocks emit tagged objects
 * (InteractionContainer.vue:156-167). Wrapping the primitives into
 * `{ type: 'text', value: string }` etc. would be a wire-shape break,
 * so we encode the reality instead: a union of every observed shape
 * with no synthetic discriminator.
 *
 * Consumers MUST narrow before using the value. The canonical parse
 * helpers are the authoritative places to do that:
 *
 *   - `parseApprovalDecision` at
 *       packages/default-setup/src/actions/claude-code/_helpers/approval-response.ts
 *     — narrows to `{ allow, reason? }` for approval blocks
 *
 *   - `parseStepResponse` at
 *       packages/default-setup/src/actions/onboarding/_helpers/parse-step-response.ts
 *     — narrows per onboarding step with a `cancelled` flag
 *
 * When adding a new block type, extend this union first, then add a
 * matching parser in `_helpers/` and a unit test that pins the new
 * shape (see claude-code-approval-response.spec.ts and
 * onboarding-step-response.spec.ts for the pattern).
 *
 * Legacy data: messages persisted before this type was introduced may
 * carry the stale `{ value: 'yes' }` shape, but no frontend has ever
 * emitted it — the `?? response` fallback in the old handler was dead
 * code. Still, `blockResponse?: unknown` at the storage boundary is
 * more defensive than assuming the union is exhaustive; however the
 * EVENT-level and FIELD-level types use the union because every
 * non-legacy emit matches one of its arms.
 */
type BlockResponse = 
/** Approval buttons: InteractionContainer `handleApprove`/`handleDeny`. */
{
    approved: boolean;
    reason?: string;
}
/** Cancel path: InteractionContainer `handleCancel`. */
 | {
    cancelled: true;
}
/** Text input (single or multiline) and single-select choice emit a raw string. */
 | string
/** Multi-select choice emits a raw string array (of choice ids). */
 | string[];
interface MessageEntity extends BaseEntity {
    entityType: EARS.Entity.Message;
    text: string;
    sender: 'user' | 'assistant' | 'system' | 'marker';
    timestamp: number;
    responseTimestamp?: number;
    blocks?: BlockConfig[];
    /**
     * Response data for block-based interactions. See the `BlockResponse`
     * union above for the full set of observed shapes. Always narrow
     * before use via a parse helper — the raw field is stored as the
     * exact value the frontend emitted, which may be a primitive
     * (string / string[]) or a tagged object.
     */
    blockResponse?: BlockResponse;
    forkable?: boolean;
    references?: MessageReferences;
    isCommand?: boolean;
    command?: string;
    /** Ephemeral UI state (e.g. 'queued' while waiting behind an active turn). */
    status?: 'queued' | 'cancelled' | null;
    /** Free-form per-message metadata. Feature-namespaced (e.g. `{ cliUuid: '...' }`). */
    context?: Record<string, unknown>;
    /** When true, collapse to a compact aside after the user responds. */
    autoHide?: boolean;
    /** When true, the collapsed aside aligns to the user (right) side. */
    asUser?: boolean;
    /** Backend-computed summary text shown when collapsed (e.g. "✓ Approved"). */
    asideText?: string;
    /** Caller-supplied context label for the collapsed aside (overrides auto-derived context). */
    asideContext?: string;
    /** When true, message is hidden because a marker message compacted it. */
    compacted?: boolean;
}
/**
 * Free-form per-thread scratchpad for features that need to persist small
 * amounts of state alongside a thread. Keys are namespaced by feature name
 * (e.g. `claudeCode`) so multiple features don't collide. Anything goes
 * under a feature key — this is intentionally untyped at the container
 * level so new contributors don't need to edit this file.
 */
interface ThreadContext {
    claudeCode?: {
        sessionId?: string;
        lastTurnAt?: number;
    };
    [featureKey: string]: unknown;
}
interface ThreadEntity extends BaseEntity {
    entityType: EARS.Entity.Thread;
    topic: string;
    instructions: string;
    sideTopics?: string[];
    timestamp: number;
    lastMessageTimestamp?: number;
    lastVisitedTimestamp?: number;
    shortCode?: string;
    status: string;
    tags?: string[];
    forcedMode?: 'birth';
    pinned?: boolean;
    archived?: boolean;
    chatState?: string;
    context?: ThreadContext;
}
interface ArtifactEntity extends BaseEntity {
    entityType: EARS.Entity.Artifact;
    title?: string;
    content: string | any;
    artifactType: ArtifactType;
}
declare const ThreadRelations: readonly ["parent_of", "blocks", "blocked_by", "duplicates"];
type ThreadLinkRelation = typeof ThreadRelations[number];
type ThreadLinkItem = Pick<ThreadEntity, 'id' | 'shortCode' | 'status' | 'timestamp' | 'topic'> & {
    relation: ThreadLinkRelation;
};
type ThreadEditFields = Simplify<Pick<ThreadEntity, 'topic' | 'instructions'> & {
    status?: ThreadEntity['status'];
} & {
    tags?: string[];
} & {
    context?: ThreadContext;
} & ThreadLinkedFields>;
type ThreadLinkedFields = {
    linkedThreads?: ThreadLinkItem[];
};
type ThreadCreateData = Simplify<ThreadEditFields & {
    role?: EARS.RoleKind;
    forcedMode?: 'birth';
    pinned?: boolean;
}>;
type ThreadExtended = Simplify<ThreadEntity & ThreadExtendedData & {
    parentId?: string;
}>;
type ThreadExtendedData = ThreadLinkedFields & {
    messages?: Partial<MessageEntity>[];
    tags?: string[];
};
type ThreadConnectedData = {
    threads: ThreadExtended[];
    availableTags: ThreadTagOption[];
    settings?: ThreadsSettings | null;
    chatStates?: Record<string, string>;
};
type AgentThreadData = {
    id?: ThreadEntity['id'];
    shortCode?: ThreadEntity['shortCode'];
    topic: ThreadEntity['topic'];
    instructions: ThreadEntity['instructions'];
    status: ThreadEntity['status'];
    timestamp: ThreadEntity['timestamp'];
    messages: ThreadExtendedData['messages'];
    artifacts: ArtifactEntity[];
    forcedMode?: ThreadEntity['forcedMode'];
    pinned?: boolean;
    chatState?: string;
};
type RecentThreadRefreshData = {
    recentThreads: Partial<ThreadEntity>[];
};
interface AgentPhase {
    id: string;
    name: string;
    description: string;
    color?: string;
}
interface AgentMode {
    id: string;
    name: string;
    description: string;
    phases?: AgentPhase[];
    hidden?: boolean;
    disabled?: boolean;
}
interface QuickPrompt {
    id: string;
    text: string;
}
interface CommandItem {
    name: string;
    placeholder: string;
}
interface AgentSettings {
    modes: AgentMode[];
    hotkeys: {
        textToSpeech?: KeyboardShortcut | null;
        switchMode?: KeyboardShortcut | null;
        [key: string]: KeyboardShortcut | null | undefined;
    };
    quickPrompts?: QuickPrompt[];
    quickPromptNumberKeyInserts?: boolean;
    skipRevertConfirm?: boolean;
    defaultMode?: string;
    defaultPhase?: string;
}
type AgentConnectedData = {
    currentThread: AgentThreadData | null;
    threads: Partial<ThreadEntity>[];
    recentThreads: Partial<ThreadEntity>[];
    tabs: Tab[];
    settings?: AgentSettings;
    hasRequiredApiKeys: boolean;
    commands?: CommandItem[];
};
interface Tab {
    id: string;
    label: string;
    artifacts: ArtifactItem[];
    selectedArtifactId?: string;
    pinned?: boolean;
}
type ArtifactType = 'text' | 'code' | 'review' | 'image' | 'slack' | 'todo' | 'project' | 'json' | 'graph' | 'table' | 'markdown' | 'claude-session' | 'diff' | 'plan';
interface ArtifactItem {
    id: string;
    type: ArtifactType;
    title: string;
    content: any;
    metadata?: {
        createdAt: number;
        updatedAt?: number;
        [key: string]: any;
    };
}

type DocumentShortCode = `DOC-${number}`;
interface FieldContent {
    type: 'field';
    fields: Array<{
        key: string;
        value: string;
    }>;
}
interface ListContent {
    type: 'list';
    items: string[];
}
interface MarkdownContent {
    type: 'markdown';
    text: string;
}
interface TextContent {
    type: 'text';
    text: string;
}
interface CodeContent {
    type: 'code';
    text: string;
    language: string;
}
type ContentSection = FieldContent | ListContent | MarkdownContent | TextContent | CodeContent;
interface DocumentDTO {
    id: EARS.EntityId;
    name: string;
    content: ContentSection[];
    shortCode: DocumentShortCode;
    tags: string[];
    collectionId?: EARS.EntityId;
    collectionPath?: string[];
    displayOrder: number;
    createdAt: string;
    updatedAt: string;
}
interface CollectionDTO {
    id: EARS.EntityId;
    name: string;
    description?: string;
    parentId?: EARS.EntityId;
    path: string[];
    documentCount: number;
    childCollections: CollectionDTO[];
    displayOrder: number;
    createdAt: string;
    updatedAt: string;
    symlinkPath?: string;
}
interface FolderItem {
    type: 'folder';
    id: EARS.EntityId;
    name: string;
    parentId: EARS.EntityId | null;
    childCount: number;
    size: string;
    kind: 'Folder';
    displayOrder: number;
    createdAt: string;
    updatedAt: string;
    isSymlink?: boolean;
    symlinkPath?: string;
    isSymlinked?: boolean;
    isBroken?: boolean;
}
interface DocumentItem {
    type: 'document';
    id: EARS.EntityId;
    name: string;
    shortCode: DocumentShortCode;
    parentId: EARS.EntityId | null;
    content: ContentSection[];
    tags: string[];
    size: string;
    kind: 'Document';
    displayOrder: number;
    createdAt: string;
    updatedAt: string;
    isSymlinked?: boolean;
    filePath?: string;
}
type LibraryItem = FolderItem | DocumentItem;
interface FolderContents {
    items: LibraryItem[];
    currentPath: string[];
    currentFolderId: EARS.EntityId | null;
    breadcrumbs: BreadcrumbItem[];
    searchIndices?: any[];
    isBroken?: boolean;
    lastKnownPath?: string;
}
interface BreadcrumbItem {
    id: EARS.EntityId | null;
    name: string;
    path: string[];
}

/** ── Shared aliases ─────────────────────────────────────────────────────── */
type TimestampMs = number;
type EntityStatus = 'active' | 'paused' | 'completed' | 'failed';
type TNodeKind = 'flow' | 'event' | 'step';
/** ── Core entities ──────────────────────────────────────────────────────── */
interface TNodeEntity extends BaseEntity {
    entityType: EARS.Entity.TNode;
    tNodeType: TNodeKind;
    label: string;
    status: EntityStatus;
    startedAt: TimestampMs;
    completedAt?: TimestampMs;
    eventType?: string;
    stepNodeType?: string;
    final?: boolean;
    nodeAttributes?: Record<string, unknown>;
    blueprint?: {
        nodeId: EARS.EntityId;
        flowId: EARS.EntityId;
    };
}
interface TrackEntity extends TNodeEntity {
    children: TrackEntity[];
}
interface EventListenerEntity {
    id: EARS.EntityId;
    nodeId: EARS.EntityId;
    eventType: string;
    label: string;
    scope: 'global' | 'local' | 'entry';
}
interface FlowTNodeData {
    flowTNodeId: EARS.EntityId;
    tNodeTree: TrackEntity[];
    possibleEvents: EventListenerEntity[];
    flowHierarchy: Array<{
        flowTNodeId: EARS.EntityId;
        label: string;
    }>;
}
interface TNodeUpdate {
    tNodeId: EARS.EntityId;
    status: TNodeEntity['status'];
    eventTNodeId?: EARS.EntityId;
}
/** ── Brain runner types ─────────────────────────────────────────────────── */
interface ExecutionEvent {
    type: string;
    data: Record<string, unknown>;
    timestamp?: TimestampMs;
    source?: string;
}
interface StepRun {
    id?: string;
    label: string;
    result: unknown;
    timestamp: TimestampMs;
}
interface ExecutionContext {
    flowTNodeId: EARS.EntityId;
    event: ExecutionEvent;
    steps: StepRun[];
    lastStep?: Omit<StepRun, 'timestamp'>;
}

declare const events: {
    readonly incoming: readonly [zod.ZodObject<{
        type: zod.ZodLiteral<"OPEN_TNODE">;
        systemId: zod.ZodLiteral<"brain">;
        tNodeId: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "OPEN_TNODE";
        tNodeId: string;
        systemId: "brain";
    }, {
        type: "OPEN_TNODE";
        tNodeId: string;
        systemId: "brain";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"GO_BACK_TNODE">;
        systemId: zod.ZodLiteral<"brain">;
        currentFlowTNodeId: zod.ZodOptional<zod.ZodString>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "GO_BACK_TNODE";
        systemId: "brain";
        currentFlowTNodeId?: string | undefined;
    }, {
        type: "GO_BACK_TNODE";
        systemId: "brain";
        currentFlowTNodeId?: string | undefined;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"REQUEST_PLUGIN_DATA">;
        systemId: zod.ZodLiteral<"brain">;
        flowTNodeId: zod.ZodOptional<zod.ZodString>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "REQUEST_PLUGIN_DATA";
        systemId: "brain";
        flowTNodeId?: string | undefined;
    }, {
        type: "REQUEST_PLUGIN_DATA";
        systemId: "brain";
        flowTNodeId?: string | undefined;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"GET_TNODE_DETAILS">;
        systemId: zod.ZodLiteral<"brain">;
        tNodeId: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "GET_TNODE_DETAILS";
        tNodeId: string;
        systemId: "brain";
    }, {
        type: "GET_TNODE_DETAILS";
        tNodeId: string;
        systemId: "brain";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"TOGGLE_INSPECT">;
        systemId: zod.ZodLiteral<"brain">;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "TOGGLE_INSPECT";
        systemId: "brain";
    }, {
        type: "TOGGLE_INSPECT";
        systemId: "brain";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"START_BRAIN">;
        systemId: zod.ZodLiteral<"brain">;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "START_BRAIN";
        systemId: "brain";
    }, {
        type: "START_BRAIN";
        systemId: "brain";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"KILL_BRAIN">;
        systemId: zod.ZodLiteral<"brain">;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "KILL_BRAIN";
        systemId: "brain";
    }, {
        type: "KILL_BRAIN";
        systemId: "brain";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"RESTART_BRAIN">;
        systemId: zod.ZodLiteral<"brain">;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "RESTART_BRAIN";
        systemId: "brain";
    }, {
        type: "RESTART_BRAIN";
        systemId: "brain";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"PAUSE_BRAIN">;
        systemId: zod.ZodLiteral<"brain">;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "PAUSE_BRAIN";
        systemId: "brain";
    }, {
        type: "PAUSE_BRAIN";
        systemId: "brain";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"RESUME_BRAIN">;
        systemId: zod.ZodLiteral<"brain">;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "RESUME_BRAIN";
        systemId: "brain";
    }, {
        type: "RESUME_BRAIN";
        systemId: "brain";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"HANDLE_BRAIN_EVENT">;
        systemId: zod.ZodLiteral<"brain">;
        eventType: zod.ZodString;
        payload: zod.ZodOptional<zod.ZodAny>;
        targetFlowId: zod.ZodOptional<zod.ZodString>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        eventType: string;
        type: "HANDLE_BRAIN_EVENT";
        systemId: "brain";
        payload?: any;
        targetFlowId?: string | undefined;
    }, {
        eventType: string;
        type: "HANDLE_BRAIN_EVENT";
        systemId: "brain";
        payload?: any;
        targetFlowId?: string | undefined;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"TRIGGER_BRAIN_EVENT">;
        systemId: zod.ZodLiteral<"brain">;
        eventType: zod.ZodString;
        payload: zod.ZodOptional<zod.ZodAny>;
        targetFlowId: zod.ZodOptional<zod.ZodString>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        eventType: string;
        type: "TRIGGER_BRAIN_EVENT";
        systemId: "brain";
        payload?: any;
        targetFlowId?: string | undefined;
    }, {
        eventType: string;
        type: "TRIGGER_BRAIN_EVENT";
        systemId: "brain";
        payload?: any;
        targetFlowId?: string | undefined;
    }>] | readonly [zod.ZodObject<{
        type: zod.ZodLiteral<"GET_SETTINGS">;
        systemId: zod.ZodLiteral<"settings">;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "GET_SETTINGS";
        systemId: "settings";
    }, {
        type: "GET_SETTINGS";
        systemId: "settings";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"UPDATE_SETTINGS">;
        systemId: zod.ZodLiteral<"settings">;
        entityType: zod.ZodEnum<["general", "plugin", "internal"]>;
        label: zod.ZodString;
        path: zod.ZodArray<zod.ZodString, "many">;
        value: zod.ZodAny;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        label: string;
        entityType: "general" | "plugin" | "internal";
        path: string[];
        type: "UPDATE_SETTINGS";
        systemId: "settings";
        value?: any;
    }, {
        label: string;
        entityType: "general" | "plugin" | "internal";
        path: string[];
        type: "UPDATE_SETTINGS";
        systemId: "settings";
        value?: any;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"RESET_SETTINGS">;
        systemId: zod.ZodLiteral<"settings">;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "RESET_SETTINGS";
        systemId: "settings";
    }, {
        type: "RESET_SETTINGS";
        systemId: "settings";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"COMPLETE_ONBOARDING">;
        systemId: zod.ZodLiteral<"settings">;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "COMPLETE_ONBOARDING";
        systemId: "settings";
    }, {
        type: "COMPLETE_ONBOARDING";
        systemId: "settings";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"SECRETS.CMD.CREATE_API_KEY">;
        systemId: zod.ZodLiteral<"settings">;
        provider: zod.ZodString;
        value: zod.ZodString;
        customName: zod.ZodOptional<zod.ZodString>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        value: string;
        type: "SECRETS.CMD.CREATE_API_KEY";
        systemId: "settings";
        provider: string;
        customName?: string | undefined;
    }, {
        value: string;
        type: "SECRETS.CMD.CREATE_API_KEY";
        systemId: "settings";
        provider: string;
        customName?: string | undefined;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"SECRETS.CMD.UPDATE_API_KEY">;
        systemId: zod.ZodLiteral<"settings">;
        id: zod.ZodString;
        value: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        id: string;
        value: string;
        type: "SECRETS.CMD.UPDATE_API_KEY";
        systemId: "settings";
    }, {
        id: string;
        value: string;
        type: "SECRETS.CMD.UPDATE_API_KEY";
        systemId: "settings";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"SECRETS.CMD.DELETE_API_KEY">;
        systemId: zod.ZodLiteral<"settings">;
        id: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        id: string;
        type: "SECRETS.CMD.DELETE_API_KEY";
        systemId: "settings";
    }, {
        id: string;
        type: "SECRETS.CMD.DELETE_API_KEY";
        systemId: "settings";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"SECRETS.CMD.GET_API_KEYS">;
        systemId: zod.ZodLiteral<"settings">;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "SECRETS.CMD.GET_API_KEYS";
        systemId: "settings";
    }, {
        type: "SECRETS.CMD.GET_API_KEYS";
        systemId: "settings";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"TEST_CLI_PROVIDER">;
        systemId: zod.ZodLiteral<"settings">;
        provider: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "TEST_CLI_PROVIDER";
        systemId: "settings";
        provider: string;
    }, {
        type: "TEST_CLI_PROVIDER";
        systemId: "settings";
        provider: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"PREVIEW_SETUP_PACK">;
        systemId: zod.ZodLiteral<"settings">;
        directory: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "PREVIEW_SETUP_PACK";
        systemId: "settings";
        directory: string;
    }, {
        type: "PREVIEW_SETUP_PACK";
        systemId: "settings";
        directory: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"IMPORT_SETUP_PACK">;
        systemId: zod.ZodLiteral<"settings">;
        directory: zod.ZodString;
        include: zod.ZodOptional<zod.ZodObject<{
            actions: zod.ZodNullable<zod.ZodArray<zod.ZodString, "many">>;
            prompts: zod.ZodNullable<zod.ZodArray<zod.ZodString, "many">>;
            flows: zod.ZodNullable<zod.ZodArray<zod.ZodString, "many">>;
            library: zod.ZodNullable<zod.ZodArray<zod.ZodString, "many">>;
            notes: zod.ZodNullable<zod.ZodArray<zod.ZodString, "many">>;
            settings: zod.ZodNullable<zod.ZodArray<zod.ZodString, "many">>;
        }, "strip", zod.ZodTypeAny, {
            settings: string[] | null;
            actions: string[] | null;
            prompts: string[] | null;
            flows: string[] | null;
            library: string[] | null;
            notes: string[] | null;
        }, {
            settings: string[] | null;
            actions: string[] | null;
            prompts: string[] | null;
            flows: string[] | null;
            library: string[] | null;
            notes: string[] | null;
        }>>;
        mode: zod.ZodOptional<zod.ZodEnum<["keep-existing", "replace-on-collision", "wipe-and-replace"]>>;
        restartBrain: zod.ZodOptional<zod.ZodBoolean>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "IMPORT_SETUP_PACK";
        systemId: "settings";
        directory: string;
        restartBrain?: boolean | undefined;
        include?: {
            settings: string[] | null;
            actions: string[] | null;
            prompts: string[] | null;
            flows: string[] | null;
            library: string[] | null;
            notes: string[] | null;
        } | undefined;
        mode?: "keep-existing" | "replace-on-collision" | "wipe-and-replace" | undefined;
    }, {
        type: "IMPORT_SETUP_PACK";
        systemId: "settings";
        directory: string;
        restartBrain?: boolean | undefined;
        include?: {
            settings: string[] | null;
            actions: string[] | null;
            prompts: string[] | null;
            flows: string[] | null;
            library: string[] | null;
            notes: string[] | null;
        } | undefined;
        mode?: "keep-existing" | "replace-on-collision" | "wipe-and-replace" | undefined;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"RESET_APP">;
        systemId: zod.ZodLiteral<"settings">;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "RESET_APP";
        systemId: "settings";
    }, {
        type: "RESET_APP";
        systemId: "settings";
    }>] | readonly [zod.ZodObject<{
        type: zod.ZodLiteral<"CREATE_THREAD">;
        systemId: zod.ZodLiteral<"threads">;
        linkedThreads: zod.ZodOptional<zod.ZodArray<zod.ZodObject<{
            id: zod.ZodString;
            relation: zod.ZodUnion<[zod.ZodLiteral<"parent_of">, zod.ZodLiteral<"blocks">, zod.ZodLiteral<"blocked_by">, zod.ZodLiteral<"duplicates">]>;
        }, "strip", zod.ZodTypeAny, {
            id: string;
            relation: "blocks" | "parent_of" | "duplicates" | "blocked_by";
        }, {
            id: string;
            relation: "blocks" | "parent_of" | "duplicates" | "blocked_by";
        }>, "many">>;
        parentThreadId: zod.ZodOptional<zod.ZodString>;
        topic: zod.ZodString;
        tags: zod.ZodOptional<zod.ZodArray<zod.ZodString, "many">>;
        instructions: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        topic: string;
        instructions: string;
        type: "CREATE_THREAD";
        systemId: "threads";
        tags?: string[] | undefined;
        linkedThreads?: {
            id: string;
            relation: "blocks" | "parent_of" | "duplicates" | "blocked_by";
        }[] | undefined;
        parentThreadId?: string | undefined;
    }, {
        topic: string;
        instructions: string;
        type: "CREATE_THREAD";
        systemId: "threads";
        tags?: string[] | undefined;
        linkedThreads?: {
            id: string;
            relation: "blocks" | "parent_of" | "duplicates" | "blocked_by";
        }[] | undefined;
        parentThreadId?: string | undefined;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"VIEW_THREAD">;
        systemId: zod.ZodLiteral<"threads">;
        threadId: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "VIEW_THREAD";
        systemId: "threads";
        threadId: string;
    }, {
        type: "VIEW_THREAD";
        systemId: "threads";
        threadId: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"UPDATE_THREAD_STATUS">;
        systemId: zod.ZodLiteral<"threads">;
        threadId: zod.ZodString;
        status: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        status: string;
        type: "UPDATE_THREAD_STATUS";
        systemId: "threads";
        threadId: string;
    }, {
        status: string;
        type: "UPDATE_THREAD_STATUS";
        systemId: "threads";
        threadId: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"UPDATE_THREAD_FIELD">;
        systemId: zod.ZodLiteral<"threads">;
        threadId: zod.ZodString;
        key: zod.ZodString;
        value: zod.ZodAny;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "UPDATE_THREAD_FIELD";
        systemId: "threads";
        threadId: string;
        key: string;
        value?: any;
    }, {
        type: "UPDATE_THREAD_FIELD";
        systemId: "threads";
        threadId: string;
        key: string;
        value?: any;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"DELETE_THREAD">;
        systemId: zod.ZodLiteral<"threads">;
        threadId: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "DELETE_THREAD";
        systemId: "threads";
        threadId: string;
    }, {
        type: "DELETE_THREAD";
        systemId: "threads";
        threadId: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"SET_THREAD_PARENT">;
        systemId: zod.ZodLiteral<"threads">;
        childIds: zod.ZodArray<zod.ZodString, "many">;
        parentId: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "SET_THREAD_PARENT";
        systemId: "threads";
        parentId: string;
        childIds: string[];
    }, {
        type: "SET_THREAD_PARENT";
        systemId: "threads";
        parentId: string;
        childIds: string[];
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"EXPORT_THREADS">;
        systemId: zod.ZodLiteral<"threads">;
        directory: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "EXPORT_THREADS";
        systemId: "threads";
        directory: string;
    }, {
        type: "EXPORT_THREADS";
        systemId: "threads";
        directory: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"IMPORT_THREADS">;
        systemId: zod.ZodLiteral<"threads">;
        directory: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "IMPORT_THREADS";
        systemId: "threads";
        directory: string;
    }, {
        type: "IMPORT_THREADS";
        systemId: "threads";
        directory: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"USER_MSG">;
        systemId: zod.ZodLiteral<"threads">;
        text: zod.ZodString;
        mode: zod.ZodOptional<zod.ZodString>;
        phase: zod.ZodOptional<zod.ZodString>;
        threadId: zod.ZodOptional<zod.ZodString>;
        references: zod.ZodOptional<zod.ZodObject<{
            images: zod.ZodOptional<zod.ZodArray<zod.ZodObject<{
                url: zod.ZodString;
                name: zod.ZodString;
            }, "strip", zod.ZodTypeAny, {
                url: string;
                name: string;
            }, {
                url: string;
                name: string;
            }>, "many">>;
            files: zod.ZodOptional<zod.ZodArray<zod.ZodObject<{
                name: zod.ZodString;
                path: zod.ZodString;
                typeLabel: zod.ZodString;
                isImage: zod.ZodBoolean;
            }, "strip", zod.ZodTypeAny, {
                path: string;
                name: string;
                typeLabel: string;
                isImage: boolean;
            }, {
                path: string;
                name: string;
                typeLabel: string;
                isImage: boolean;
            }>, "many">>;
            context: zod.ZodOptional<zod.ZodArray<zod.ZodObject<{
                refType: zod.ZodEnum<["thread", "document", "note", "task", "tasklist", "folder"]>;
                refId: zod.ZodString;
                shortCode: zod.ZodString;
                label: zod.ZodString;
            }, "strip", zod.ZodTypeAny, {
                label: string;
                shortCode: string;
                refType: "document" | "folder" | "tasklist" | "task" | "thread" | "note";
                refId: string;
            }, {
                label: string;
                shortCode: string;
                refType: "document" | "folder" | "tasklist" | "task" | "thread" | "note";
                refId: string;
            }>, "many">>;
        }, "strip", zod.ZodTypeAny, {
            context?: {
                label: string;
                shortCode: string;
                refType: "document" | "folder" | "tasklist" | "task" | "thread" | "note";
                refId: string;
            }[] | undefined;
            images?: {
                url: string;
                name: string;
            }[] | undefined;
            files?: {
                path: string;
                name: string;
                typeLabel: string;
                isImage: boolean;
            }[] | undefined;
        }, {
            context?: {
                label: string;
                shortCode: string;
                refType: "document" | "folder" | "tasklist" | "task" | "thread" | "note";
                refId: string;
            }[] | undefined;
            images?: {
                url: string;
                name: string;
            }[] | undefined;
            files?: {
                path: string;
                name: string;
                typeLabel: string;
                isImage: boolean;
            }[] | undefined;
        }>>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        text: string;
        type: "USER_MSG";
        systemId: "threads";
        references?: {
            context?: {
                label: string;
                shortCode: string;
                refType: "document" | "folder" | "tasklist" | "task" | "thread" | "note";
                refId: string;
            }[] | undefined;
            images?: {
                url: string;
                name: string;
            }[] | undefined;
            files?: {
                path: string;
                name: string;
                typeLabel: string;
                isImage: boolean;
            }[] | undefined;
        } | undefined;
        mode?: string | undefined;
        threadId?: string | undefined;
        phase?: string | undefined;
    }, {
        text: string;
        type: "USER_MSG";
        systemId: "threads";
        references?: {
            context?: {
                label: string;
                shortCode: string;
                refType: "document" | "folder" | "tasklist" | "task" | "thread" | "note";
                refId: string;
            }[] | undefined;
            images?: {
                url: string;
                name: string;
            }[] | undefined;
            files?: {
                path: string;
                name: string;
                typeLabel: string;
                isImage: boolean;
            }[] | undefined;
        } | undefined;
        mode?: string | undefined;
        threadId?: string | undefined;
        phase?: string | undefined;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"OPEN_THREAD_CHAT">;
        systemId: zod.ZodLiteral<"threads">;
        threadId: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "OPEN_THREAD_CHAT";
        systemId: "threads";
        threadId: string;
    }, {
        type: "OPEN_THREAD_CHAT";
        systemId: "threads";
        threadId: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"OPEN_THREAD_TAB">;
        systemId: zod.ZodLiteral<"threads">;
        threadId: zod.ZodString;
        label: zod.ZodString;
        pinned: zod.ZodOptional<zod.ZodBoolean>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        label: string;
        type: "OPEN_THREAD_TAB";
        systemId: "threads";
        threadId: string;
        pinned?: boolean | undefined;
    }, {
        label: string;
        type: "OPEN_THREAD_TAB";
        systemId: "threads";
        threadId: string;
        pinned?: boolean | undefined;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"PAUSE_TURN">;
        systemId: zod.ZodLiteral<"threads">;
        threadId: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "PAUSE_TURN";
        systemId: "threads";
        threadId: string;
    }, {
        type: "PAUSE_TURN";
        systemId: "threads";
        threadId: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"APPROVE_TODO_LIST">;
        systemId: zod.ZodLiteral<"threads">;
        artifactId: zod.ZodString;
        tasks: zod.ZodArray<zod.ZodAny, "many">;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "APPROVE_TODO_LIST";
        systemId: "threads";
        artifactId: string;
        tasks: any[];
    }, {
        type: "APPROVE_TODO_LIST";
        systemId: "threads";
        artifactId: string;
        tasks: any[];
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"REJECT_TODO_LIST">;
        systemId: zod.ZodLiteral<"threads">;
        artifactId: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "REJECT_TODO_LIST";
        systemId: "threads";
        artifactId: string;
    }, {
        type: "REJECT_TODO_LIST";
        systemId: "threads";
        artifactId: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"INTERACTIVE_MSG_RESPONSE">;
        systemId: zod.ZodLiteral<"threads">;
        messageId: zod.ZodString;
        threadId: zod.ZodString;
        response: zod.ZodAny;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "INTERACTIVE_MSG_RESPONSE";
        systemId: "threads";
        threadId: string;
        messageId: string;
        response?: any;
    }, {
        type: "INTERACTIVE_MSG_RESPONSE";
        systemId: "threads";
        threadId: string;
        messageId: string;
        response?: any;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"FORK_THREAD">;
        systemId: zod.ZodLiteral<"threads">;
        messageId: zod.ZodString;
        threadId: zod.ZodOptional<zod.ZodString>;
        threadTopic: zod.ZodOptional<zod.ZodString>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "FORK_THREAD";
        systemId: "threads";
        messageId: string;
        threadId?: string | undefined;
        threadTopic?: string | undefined;
    }, {
        type: "FORK_THREAD";
        systemId: "threads";
        messageId: string;
        threadId?: string | undefined;
        threadTopic?: string | undefined;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"REVERT_THREAD">;
        systemId: zod.ZodLiteral<"threads">;
        messageId: zod.ZodString;
        threadId: zod.ZodString;
        restoreFiles: zod.ZodOptional<zod.ZodBoolean>;
        userCliUuid: zod.ZodOptional<zod.ZodString>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "REVERT_THREAD";
        systemId: "threads";
        threadId: string;
        messageId: string;
        restoreFiles?: boolean | undefined;
        userCliUuid?: string | undefined;
    }, {
        type: "REVERT_THREAD";
        systemId: "threads";
        threadId: string;
        messageId: string;
        restoreFiles?: boolean | undefined;
        userCliUuid?: string | undefined;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"SUMMARIZE_THREAD">;
        systemId: zod.ZodLiteral<"threads">;
        messageId: zod.ZodString;
        threadId: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "SUMMARIZE_THREAD";
        systemId: "threads";
        threadId: string;
        messageId: string;
    }, {
        type: "SUMMARIZE_THREAD";
        systemId: "threads";
        threadId: string;
        messageId: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"USER_COMMAND">;
        systemId: zod.ZodLiteral<"threads">;
        command: zod.ZodString;
        text: zod.ZodString;
        mode: zod.ZodOptional<zod.ZodString>;
        phase: zod.ZodOptional<zod.ZodString>;
        threadId: zod.ZodOptional<zod.ZodString>;
        references: zod.ZodOptional<zod.ZodObject<{
            images: zod.ZodOptional<zod.ZodArray<zod.ZodObject<{
                url: zod.ZodString;
                name: zod.ZodString;
            }, "strip", zod.ZodTypeAny, {
                url: string;
                name: string;
            }, {
                url: string;
                name: string;
            }>, "many">>;
            files: zod.ZodOptional<zod.ZodArray<zod.ZodObject<{
                name: zod.ZodString;
                path: zod.ZodString;
                typeLabel: zod.ZodString;
                isImage: zod.ZodBoolean;
            }, "strip", zod.ZodTypeAny, {
                path: string;
                name: string;
                typeLabel: string;
                isImage: boolean;
            }, {
                path: string;
                name: string;
                typeLabel: string;
                isImage: boolean;
            }>, "many">>;
            context: zod.ZodOptional<zod.ZodArray<zod.ZodObject<{
                refType: zod.ZodEnum<["thread", "document", "note", "task", "tasklist", "folder"]>;
                refId: zod.ZodString;
                shortCode: zod.ZodString;
                label: zod.ZodString;
            }, "strip", zod.ZodTypeAny, {
                label: string;
                shortCode: string;
                refType: "document" | "folder" | "tasklist" | "task" | "thread" | "note";
                refId: string;
            }, {
                label: string;
                shortCode: string;
                refType: "document" | "folder" | "tasklist" | "task" | "thread" | "note";
                refId: string;
            }>, "many">>;
        }, "strip", zod.ZodTypeAny, {
            context?: {
                label: string;
                shortCode: string;
                refType: "document" | "folder" | "tasklist" | "task" | "thread" | "note";
                refId: string;
            }[] | undefined;
            images?: {
                url: string;
                name: string;
            }[] | undefined;
            files?: {
                path: string;
                name: string;
                typeLabel: string;
                isImage: boolean;
            }[] | undefined;
        }, {
            context?: {
                label: string;
                shortCode: string;
                refType: "document" | "folder" | "tasklist" | "task" | "thread" | "note";
                refId: string;
            }[] | undefined;
            images?: {
                url: string;
                name: string;
            }[] | undefined;
            files?: {
                path: string;
                name: string;
                typeLabel: string;
                isImage: boolean;
            }[] | undefined;
        }>>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        text: string;
        command: string;
        type: "USER_COMMAND";
        systemId: "threads";
        references?: {
            context?: {
                label: string;
                shortCode: string;
                refType: "document" | "folder" | "tasklist" | "task" | "thread" | "note";
                refId: string;
            }[] | undefined;
            images?: {
                url: string;
                name: string;
            }[] | undefined;
            files?: {
                path: string;
                name: string;
                typeLabel: string;
                isImage: boolean;
            }[] | undefined;
        } | undefined;
        mode?: string | undefined;
        threadId?: string | undefined;
        phase?: string | undefined;
    }, {
        text: string;
        command: string;
        type: "USER_COMMAND";
        systemId: "threads";
        references?: {
            context?: {
                label: string;
                shortCode: string;
                refType: "document" | "folder" | "tasklist" | "task" | "thread" | "note";
                refId: string;
            }[] | undefined;
            images?: {
                url: string;
                name: string;
            }[] | undefined;
            files?: {
                path: string;
                name: string;
                typeLabel: string;
                isImage: boolean;
            }[] | undefined;
        } | undefined;
        mode?: string | undefined;
        threadId?: string | undefined;
        phase?: string | undefined;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"UPDATE_CLAUDE_PERMISSION_MODE">;
        systemId: zod.ZodLiteral<"threads">;
        threadId: zod.ZodString;
        mode: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "UPDATE_CLAUDE_PERMISSION_MODE";
        systemId: "threads";
        mode: string;
        threadId: string;
    }, {
        type: "UPDATE_CLAUDE_PERMISSION_MODE";
        systemId: "threads";
        mode: string;
        threadId: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"UPDATE_CLAUDE_WORKTREE">;
        systemId: zod.ZodLiteral<"threads">;
        threadId: zod.ZodString;
        useWorktree: zod.ZodBoolean;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "UPDATE_CLAUDE_WORKTREE";
        systemId: "threads";
        threadId: string;
        useWorktree: boolean;
    }, {
        type: "UPDATE_CLAUDE_WORKTREE";
        systemId: "threads";
        threadId: string;
        useWorktree: boolean;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"TOGGLE_COMPACTED">;
        systemId: zod.ZodLiteral<"threads">;
        markerId: zod.ZodString;
        compacted: zod.ZodBoolean;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        compacted: boolean;
        type: "TOGGLE_COMPACTED";
        systemId: "threads";
        markerId: string;
    }, {
        compacted: boolean;
        type: "TOGGLE_COMPACTED";
        systemId: "threads";
        markerId: string;
    }>] | readonly [zod.ZodObject<{
        type: zod.ZodLiteral<"FLOW_SELECT">;
        systemId: zod.ZodLiteral<"flows">;
        flowId: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "FLOW_SELECT";
        systemId: "flows";
        flowId: string;
    }, {
        type: "FLOW_SELECT";
        systemId: "flows";
        flowId: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"CREATE_FLOW">;
        systemId: zod.ZodLiteral<"flows">;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "CREATE_FLOW";
        systemId: "flows";
    }, {
        type: "CREATE_FLOW";
        systemId: "flows";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"DELETE_FLOW">;
        systemId: zod.ZodLiteral<"flows">;
        flowId: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "DELETE_FLOW";
        systemId: "flows";
        flowId: string;
    }, {
        type: "DELETE_FLOW";
        systemId: "flows";
        flowId: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"UPDATE_FLOW_LABEL">;
        systemId: zod.ZodLiteral<"flows">;
        flowId: zod.ZodString;
        label: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        label: string;
        type: "UPDATE_FLOW_LABEL";
        systemId: "flows";
        flowId: string;
    }, {
        label: string;
        type: "UPDATE_FLOW_LABEL";
        systemId: "flows";
        flowId: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"CREATE_NODE">;
        systemId: zod.ZodLiteral<"flows">;
        flowId: zod.ZodString;
        tempId: zod.ZodString;
        nodeData: zod.ZodAny;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "CREATE_NODE";
        systemId: "flows";
        flowId: string;
        tempId: string;
        nodeData?: any;
    }, {
        type: "CREATE_NODE";
        systemId: "flows";
        flowId: string;
        tempId: string;
        nodeData?: any;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"UPDATE_NODE">;
        systemId: zod.ZodLiteral<"flows">;
        flowId: zod.ZodString;
        nodeId: zod.ZodString;
        nodeData: zod.ZodAny;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "UPDATE_NODE";
        systemId: "flows";
        flowId: string;
        nodeId: string;
        nodeData?: any;
    }, {
        type: "UPDATE_NODE";
        systemId: "flows";
        flowId: string;
        nodeId: string;
        nodeData?: any;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"DELETE_NODE">;
        systemId: zod.ZodLiteral<"flows">;
        flowId: zod.ZodString;
        nodeId: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "DELETE_NODE";
        systemId: "flows";
        flowId: string;
        nodeId: string;
    }, {
        type: "DELETE_NODE";
        systemId: "flows";
        flowId: string;
        nodeId: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"CREATE_EDGE">;
        systemId: zod.ZodLiteral<"flows">;
        flowId: zod.ZodString;
        sourceId: zod.ZodString;
        targetId: zod.ZodString;
        sourceHandle: zod.ZodOptional<zod.ZodString>;
        targetHandle: zod.ZodOptional<zod.ZodString>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "CREATE_EDGE";
        systemId: "flows";
        flowId: string;
        sourceId: string;
        targetId: string;
        sourceHandle?: string | undefined;
        targetHandle?: string | undefined;
    }, {
        type: "CREATE_EDGE";
        systemId: "flows";
        flowId: string;
        sourceId: string;
        targetId: string;
        sourceHandle?: string | undefined;
        targetHandle?: string | undefined;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"DELETE_EDGE">;
        systemId: zod.ZodLiteral<"flows">;
        flowId: zod.ZodString;
        edgeId: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "DELETE_EDGE";
        systemId: "flows";
        flowId: string;
        edgeId: string;
    }, {
        type: "DELETE_EDGE";
        systemId: "flows";
        flowId: string;
        edgeId: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"UPDATE_EDGE">;
        systemId: zod.ZodLiteral<"flows">;
        flowId: zod.ZodString;
        edgeId: zod.ZodString;
        oldSource: zod.ZodString;
        oldTarget: zod.ZodString;
        newSource: zod.ZodString;
        newTarget: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "UPDATE_EDGE";
        systemId: "flows";
        flowId: string;
        edgeId: string;
        oldSource: string;
        oldTarget: string;
        newSource: string;
        newTarget: string;
    }, {
        type: "UPDATE_EDGE";
        systemId: "flows";
        flowId: string;
        edgeId: string;
        oldSource: string;
        oldTarget: string;
        newSource: string;
        newTarget: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"IMPORT_DSL">;
        systemId: zod.ZodLiteral<"flows">;
        dsl: zod.ZodAny;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "IMPORT_DSL";
        systemId: "flows";
        dsl?: any;
    }, {
        type: "IMPORT_DSL";
        systemId: "flows";
        dsl?: any;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"EXPORT_DSL">;
        systemId: zod.ZodLiteral<"flows">;
        directory: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "EXPORT_DSL";
        systemId: "flows";
        directory: string;
    }, {
        type: "EXPORT_DSL";
        systemId: "flows";
        directory: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"REINDEX_HANDLES">;
        systemId: zod.ZodLiteral<"flows">;
        flowId: zod.ZodString;
        nodeId: zod.ZodString;
        prefix: zod.ZodString;
        index: zod.ZodNumber;
        direction: zod.ZodUnion<[zod.ZodLiteral<1>, zod.ZodLiteral<-1>]>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "REINDEX_HANDLES";
        systemId: "flows";
        flowId: string;
        nodeId: string;
        prefix: string;
        index: number;
        direction: 1 | -1;
    }, {
        type: "REINDEX_HANDLES";
        systemId: "flows";
        flowId: string;
        nodeId: string;
        prefix: string;
        index: number;
        direction: 1 | -1;
    }>] | readonly [zod.ZodObject<{
        type: zod.ZodLiteral<"EXECUTE_QUERY">;
        systemId: zod.ZodLiteral<"database">;
        code: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        code: string;
        type: "EXECUTE_QUERY";
        systemId: "database";
    }, {
        code: string;
        type: "EXECUTE_QUERY";
        systemId: "database";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"EXECUTE_TRANSACTION">;
        systemId: zod.ZodLiteral<"database">;
        code: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        code: string;
        type: "EXECUTE_TRANSACTION";
        systemId: "database";
    }, {
        code: string;
        type: "EXECUTE_TRANSACTION";
        systemId: "database";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"GENERATE_AI_QUERY">;
        systemId: zod.ZodLiteral<"database">;
        prompt: zod.ZodString;
        mode: zod.ZodOptional<zod.ZodEnum<["query", "transaction"]>>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        prompt: string;
        type: "GENERATE_AI_QUERY";
        systemId: "database";
        mode?: "query" | "transaction" | undefined;
    }, {
        prompt: string;
        type: "GENERATE_AI_QUERY";
        systemId: "database";
        mode?: "query" | "transaction" | undefined;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"REFRESH_SCHEMA">;
        systemId: zod.ZodLiteral<"database">;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "REFRESH_SCHEMA";
        systemId: "database";
    }, {
        type: "REFRESH_SCHEMA";
        systemId: "database";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"GET_TRACE_FLOWS">;
        systemId: zod.ZodLiteral<"database">;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "GET_TRACE_FLOWS";
        systemId: "database";
    }, {
        type: "GET_TRACE_FLOWS";
        systemId: "database";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"GET_FLOW_EVENTS">;
        systemId: zod.ZodLiteral<"database">;
        flowId: zod.ZodString;
        offset: zod.ZodOptional<zod.ZodNumber>;
        limit: zod.ZodOptional<zod.ZodNumber>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "GET_FLOW_EVENTS";
        systemId: "database";
        flowId: string;
        offset?: number | undefined;
        limit?: number | undefined;
    }, {
        type: "GET_FLOW_EVENTS";
        systemId: "database";
        flowId: string;
        offset?: number | undefined;
        limit?: number | undefined;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"GET_NODE_DETAILS">;
        systemId: zod.ZodLiteral<"database">;
        nodeId: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "GET_NODE_DETAILS";
        systemId: "database";
        nodeId: string;
    }, {
        type: "GET_NODE_DETAILS";
        systemId: "database";
        nodeId: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"EXPORT_DATABASE">;
        systemId: zod.ZodLiteral<"database">;
        path: zod.ZodString;
        name: zod.ZodOptional<zod.ZodString>;
        databases: zod.ZodArray<zod.ZodEnum<["lmdb", "volatileLmdb", "secretsLmdb"]>, "many">;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        path: string;
        type: "EXPORT_DATABASE";
        systemId: "database";
        databases: ("lmdb" | "volatileLmdb" | "secretsLmdb")[];
        name?: string | undefined;
    }, {
        path: string;
        type: "EXPORT_DATABASE";
        systemId: "database";
        databases: ("lmdb" | "volatileLmdb" | "secretsLmdb")[];
        name?: string | undefined;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"IMPORT_DATABASE">;
        systemId: zod.ZodLiteral<"database">;
        path: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        path: string;
        type: "IMPORT_DATABASE";
        systemId: "database";
    }, {
        path: string;
        type: "IMPORT_DATABASE";
        systemId: "database";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"GET_BACKUP_INFO">;
        systemId: zod.ZodLiteral<"database">;
        path: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        path: string;
        type: "GET_BACKUP_INFO";
        systemId: "database";
    }, {
        path: string;
        type: "GET_BACKUP_INFO";
        systemId: "database";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"RESET_DATABASE">;
        systemId: zod.ZodLiteral<"database">;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "RESET_DATABASE";
        systemId: "database";
    }, {
        type: "RESET_DATABASE";
        systemId: "database";
    }>] | readonly [zod.ZodObject<{
        type: zod.ZodLiteral<"EMPTY">;
        systemId: zod.ZodLiteral<"logs">;
        empty: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "EMPTY";
        systemId: "logs";
        empty: string;
    }, {
        type: "EMPTY";
        systemId: "logs";
        empty: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"CLEAR_LOGS">;
        systemId: zod.ZodLiteral<"logs">;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "CLEAR_LOGS";
        systemId: "logs";
    }, {
        type: "CLEAR_LOGS";
        systemId: "logs";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"REQUEST_LOGS_UPDATE">;
        systemId: zod.ZodLiteral<"logs">;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "REQUEST_LOGS_UPDATE";
        systemId: "logs";
    }, {
        type: "REQUEST_LOGS_UPDATE";
        systemId: "logs";
    }>] | readonly [zod.ZodObject<{
        type: zod.ZodLiteral<"PROMPT_SELECT">;
        systemId: zod.ZodLiteral<"prompts">;
        promptId: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "PROMPT_SELECT";
        systemId: "prompts";
        promptId: string;
    }, {
        type: "PROMPT_SELECT";
        systemId: "prompts";
        promptId: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"CREATE_PROMPT">;
        systemId: zod.ZodLiteral<"prompts">;
        label: zod.ZodString;
        inputs: zod.ZodRecord<zod.ZodString, zod.ZodAny>;
        templateFn: zod.ZodString;
        outputSchema: zod.ZodOptional<zod.ZodAny>;
        description: zod.ZodOptional<zod.ZodString>;
        category: zod.ZodOptional<zod.ZodString>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        label: string;
        type: "CREATE_PROMPT";
        systemId: "prompts";
        inputs: Record<string, any>;
        templateFn: string;
        category?: string | undefined;
        description?: string | undefined;
        outputSchema?: any;
    }, {
        label: string;
        type: "CREATE_PROMPT";
        systemId: "prompts";
        inputs: Record<string, any>;
        templateFn: string;
        category?: string | undefined;
        description?: string | undefined;
        outputSchema?: any;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"UPDATE_PROMPT">;
        systemId: zod.ZodLiteral<"prompts">;
        promptId: zod.ZodString;
        label: zod.ZodOptional<zod.ZodString>;
        inputs: zod.ZodOptional<zod.ZodRecord<zod.ZodString, zod.ZodAny>>;
        templateFn: zod.ZodOptional<zod.ZodString>;
        outputSchema: zod.ZodOptional<zod.ZodAny>;
        description: zod.ZodOptional<zod.ZodString>;
        category: zod.ZodOptional<zod.ZodString>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "UPDATE_PROMPT";
        systemId: "prompts";
        promptId: string;
        category?: string | undefined;
        label?: string | undefined;
        description?: string | undefined;
        inputs?: Record<string, any> | undefined;
        templateFn?: string | undefined;
        outputSchema?: any;
    }, {
        type: "UPDATE_PROMPT";
        systemId: "prompts";
        promptId: string;
        category?: string | undefined;
        label?: string | undefined;
        description?: string | undefined;
        inputs?: Record<string, any> | undefined;
        templateFn?: string | undefined;
        outputSchema?: any;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"DELETE_PROMPT">;
        systemId: zod.ZodLiteral<"prompts">;
        promptId: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "DELETE_PROMPT";
        systemId: "prompts";
        promptId: string;
    }, {
        type: "DELETE_PROMPT";
        systemId: "prompts";
        promptId: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"FETCH_PROMPTS_PAGE">;
        systemId: zod.ZodLiteral<"prompts">;
        page: zod.ZodOptional<zod.ZodNumber>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "FETCH_PROMPTS_PAGE";
        systemId: "prompts";
        page?: number | undefined;
    }, {
        type: "FETCH_PROMPTS_PAGE";
        systemId: "prompts";
        page?: number | undefined;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"IMPORT_PROMPTS">;
        systemId: zod.ZodLiteral<"prompts">;
        prompts: zod.ZodAny;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "IMPORT_PROMPTS";
        systemId: "prompts";
        prompts?: any;
    }, {
        type: "IMPORT_PROMPTS";
        systemId: "prompts";
        prompts?: any;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"EXPORT_PROMPTS">;
        systemId: zod.ZodLiteral<"prompts">;
        directory: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "EXPORT_PROMPTS";
        systemId: "prompts";
        directory: string;
    }, {
        type: "EXPORT_PROMPTS";
        systemId: "prompts";
        directory: string;
    }>] | readonly [zod.ZodObject<{
        type: zod.ZodLiteral<"ACTION_SELECT">;
        systemId: zod.ZodLiteral<"actions">;
        actionId: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "ACTION_SELECT";
        systemId: "actions";
        actionId: string;
    }, {
        type: "ACTION_SELECT";
        systemId: "actions";
        actionId: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"CREATE_ACTION">;
        systemId: zod.ZodLiteral<"actions">;
        label: zod.ZodString;
        input: zod.ZodRecord<zod.ZodString, zod.ZodAny>;
        actionFn: zod.ZodString;
        output: zod.ZodOptional<zod.ZodAny>;
        description: zod.ZodOptional<zod.ZodString>;
        category: zod.ZodOptional<zod.ZodString>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        label: string;
        type: "CREATE_ACTION";
        systemId: "actions";
        input: Record<string, any>;
        actionFn: string;
        category?: string | undefined;
        description?: string | undefined;
        output?: any;
    }, {
        label: string;
        type: "CREATE_ACTION";
        systemId: "actions";
        input: Record<string, any>;
        actionFn: string;
        category?: string | undefined;
        description?: string | undefined;
        output?: any;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"UPDATE_ACTION">;
        systemId: zod.ZodLiteral<"actions">;
        actionId: zod.ZodString;
        label: zod.ZodOptional<zod.ZodString>;
        input: zod.ZodOptional<zod.ZodRecord<zod.ZodString, zod.ZodAny>>;
        actionFn: zod.ZodOptional<zod.ZodString>;
        output: zod.ZodOptional<zod.ZodAny>;
        description: zod.ZodOptional<zod.ZodString>;
        category: zod.ZodOptional<zod.ZodString>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "UPDATE_ACTION";
        systemId: "actions";
        actionId: string;
        category?: string | undefined;
        label?: string | undefined;
        description?: string | undefined;
        output?: any;
        input?: Record<string, any> | undefined;
        actionFn?: string | undefined;
    }, {
        type: "UPDATE_ACTION";
        systemId: "actions";
        actionId: string;
        category?: string | undefined;
        label?: string | undefined;
        description?: string | undefined;
        output?: any;
        input?: Record<string, any> | undefined;
        actionFn?: string | undefined;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"DELETE_ACTION">;
        systemId: zod.ZodLiteral<"actions">;
        actionId: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "DELETE_ACTION";
        systemId: "actions";
        actionId: string;
    }, {
        type: "DELETE_ACTION";
        systemId: "actions";
        actionId: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"IMPORT_ACTIONS">;
        systemId: zod.ZodLiteral<"actions">;
        actions: zod.ZodAny;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "IMPORT_ACTIONS";
        systemId: "actions";
        actions?: any;
    }, {
        type: "IMPORT_ACTIONS";
        systemId: "actions";
        actions?: any;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"EXPORT_ACTIONS">;
        systemId: zod.ZodLiteral<"actions">;
        directory: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "EXPORT_ACTIONS";
        systemId: "actions";
        directory: string;
    }, {
        type: "EXPORT_ACTIONS";
        systemId: "actions";
        directory: string;
    }>] | readonly [zod.ZodObject<{
        type: zod.ZodLiteral<"LIST_DOCUMENTS">;
        systemId: zod.ZodLiteral<"library">;
        collectionId: zod.ZodOptional<zod.ZodString>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "LIST_DOCUMENTS";
        systemId: "library";
        collectionId?: string | undefined;
    }, {
        type: "LIST_DOCUMENTS";
        systemId: "library";
        collectionId?: string | undefined;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"CREATE_DOCUMENT">;
        systemId: zod.ZodLiteral<"library">;
        name: zod.ZodString;
        content: zod.ZodArray<zod.ZodUnion<[zod.ZodObject<{
            type: zod.ZodLiteral<"field">;
            fields: zod.ZodArray<zod.ZodObject<{
                key: zod.ZodString;
                value: zod.ZodString;
            }, "strip", zod.ZodTypeAny, {
                value: string;
                key: string;
            }, {
                value: string;
                key: string;
            }>, "many">;
        }, "strip", zod.ZodTypeAny, {
            type: "field";
            fields: {
                value: string;
                key: string;
            }[];
        }, {
            type: "field";
            fields: {
                value: string;
                key: string;
            }[];
        }>, zod.ZodObject<{
            type: zod.ZodLiteral<"list">;
            items: zod.ZodArray<zod.ZodString, "many">;
        }, "strip", zod.ZodTypeAny, {
            type: "list";
            items: string[];
        }, {
            type: "list";
            items: string[];
        }>, zod.ZodObject<{
            type: zod.ZodLiteral<"markdown">;
            text: zod.ZodString;
        }, "strip", zod.ZodTypeAny, {
            text: string;
            type: "markdown";
        }, {
            text: string;
            type: "markdown";
        }>, zod.ZodObject<{
            type: zod.ZodLiteral<"text">;
            text: zod.ZodString;
        }, "strip", zod.ZodTypeAny, {
            text: string;
            type: "text";
        }, {
            text: string;
            type: "text";
        }>, zod.ZodObject<{
            type: zod.ZodLiteral<"code">;
            text: zod.ZodString;
            language: zod.ZodString;
        }, "strip", zod.ZodTypeAny, {
            text: string;
            type: "code";
            language: string;
        }, {
            text: string;
            type: "code";
            language: string;
        }>]>, "many">;
        tags: zod.ZodArray<zod.ZodString, "many">;
        collectionId: zod.ZodOptional<zod.ZodString>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        tags: string[];
        content: ({
            type: "field";
            fields: {
                value: string;
                key: string;
            }[];
        } | {
            type: "list";
            items: string[];
        } | {
            text: string;
            type: "markdown";
        } | {
            text: string;
            type: "text";
        } | {
            text: string;
            type: "code";
            language: string;
        })[];
        type: "CREATE_DOCUMENT";
        systemId: "library";
        name: string;
        collectionId?: string | undefined;
    }, {
        tags: string[];
        content: ({
            type: "field";
            fields: {
                value: string;
                key: string;
            }[];
        } | {
            type: "list";
            items: string[];
        } | {
            text: string;
            type: "markdown";
        } | {
            text: string;
            type: "text";
        } | {
            text: string;
            type: "code";
            language: string;
        })[];
        type: "CREATE_DOCUMENT";
        systemId: "library";
        name: string;
        collectionId?: string | undefined;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"UPDATE_DOCUMENT">;
        systemId: zod.ZodLiteral<"library">;
        id: zod.ZodString;
        name: zod.ZodString;
        content: zod.ZodArray<zod.ZodUnion<[zod.ZodObject<{
            type: zod.ZodLiteral<"field">;
            fields: zod.ZodArray<zod.ZodObject<{
                key: zod.ZodString;
                value: zod.ZodString;
            }, "strip", zod.ZodTypeAny, {
                value: string;
                key: string;
            }, {
                value: string;
                key: string;
            }>, "many">;
        }, "strip", zod.ZodTypeAny, {
            type: "field";
            fields: {
                value: string;
                key: string;
            }[];
        }, {
            type: "field";
            fields: {
                value: string;
                key: string;
            }[];
        }>, zod.ZodObject<{
            type: zod.ZodLiteral<"list">;
            items: zod.ZodArray<zod.ZodString, "many">;
        }, "strip", zod.ZodTypeAny, {
            type: "list";
            items: string[];
        }, {
            type: "list";
            items: string[];
        }>, zod.ZodObject<{
            type: zod.ZodLiteral<"markdown">;
            text: zod.ZodString;
        }, "strip", zod.ZodTypeAny, {
            text: string;
            type: "markdown";
        }, {
            text: string;
            type: "markdown";
        }>, zod.ZodObject<{
            type: zod.ZodLiteral<"text">;
            text: zod.ZodString;
        }, "strip", zod.ZodTypeAny, {
            text: string;
            type: "text";
        }, {
            text: string;
            type: "text";
        }>, zod.ZodObject<{
            type: zod.ZodLiteral<"code">;
            text: zod.ZodString;
            language: zod.ZodString;
        }, "strip", zod.ZodTypeAny, {
            text: string;
            type: "code";
            language: string;
        }, {
            text: string;
            type: "code";
            language: string;
        }>]>, "many">;
        tags: zod.ZodArray<zod.ZodString, "many">;
        collectionId: zod.ZodOptional<zod.ZodString>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        tags: string[];
        id: string;
        content: ({
            type: "field";
            fields: {
                value: string;
                key: string;
            }[];
        } | {
            type: "list";
            items: string[];
        } | {
            text: string;
            type: "markdown";
        } | {
            text: string;
            type: "text";
        } | {
            text: string;
            type: "code";
            language: string;
        })[];
        type: "UPDATE_DOCUMENT";
        systemId: "library";
        name: string;
        collectionId?: string | undefined;
    }, {
        tags: string[];
        id: string;
        content: ({
            type: "field";
            fields: {
                value: string;
                key: string;
            }[];
        } | {
            type: "list";
            items: string[];
        } | {
            text: string;
            type: "markdown";
        } | {
            text: string;
            type: "text";
        } | {
            text: string;
            type: "code";
            language: string;
        })[];
        type: "UPDATE_DOCUMENT";
        systemId: "library";
        name: string;
        collectionId?: string | undefined;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"DELETE_DOCUMENT">;
        systemId: zod.ZodLiteral<"library">;
        id: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        id: string;
        type: "DELETE_DOCUMENT";
        systemId: "library";
    }, {
        id: string;
        type: "DELETE_DOCUMENT";
        systemId: "library";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"GET_DOCUMENT">;
        systemId: zod.ZodLiteral<"library">;
        id: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        id: string;
        type: "GET_DOCUMENT";
        systemId: "library";
    }, {
        id: string;
        type: "GET_DOCUMENT";
        systemId: "library";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"LIST_COLLECTIONS">;
        systemId: zod.ZodLiteral<"library">;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "LIST_COLLECTIONS";
        systemId: "library";
    }, {
        type: "LIST_COLLECTIONS";
        systemId: "library";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"CREATE_COLLECTION">;
        systemId: zod.ZodLiteral<"library">;
        name: zod.ZodString;
        description: zod.ZodOptional<zod.ZodString>;
        parentId: zod.ZodOptional<zod.ZodString>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "CREATE_COLLECTION";
        systemId: "library";
        name: string;
        description?: string | undefined;
        parentId?: string | undefined;
    }, {
        type: "CREATE_COLLECTION";
        systemId: "library";
        name: string;
        description?: string | undefined;
        parentId?: string | undefined;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"UPDATE_COLLECTION">;
        systemId: zod.ZodLiteral<"library">;
        id: zod.ZodString;
        name: zod.ZodString;
        description: zod.ZodOptional<zod.ZodString>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        id: string;
        type: "UPDATE_COLLECTION";
        systemId: "library";
        name: string;
        description?: string | undefined;
    }, {
        id: string;
        type: "UPDATE_COLLECTION";
        systemId: "library";
        name: string;
        description?: string | undefined;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"DELETE_COLLECTION">;
        systemId: zod.ZodLiteral<"library">;
        id: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        id: string;
        type: "DELETE_COLLECTION";
        systemId: "library";
    }, {
        id: string;
        type: "DELETE_COLLECTION";
        systemId: "library";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"MOVE_DOCUMENT">;
        systemId: zod.ZodLiteral<"library">;
        documentId: zod.ZodString;
        collectionId: zod.ZodOptional<zod.ZodString>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "MOVE_DOCUMENT";
        systemId: "library";
        documentId: string;
        collectionId?: string | undefined;
    }, {
        type: "MOVE_DOCUMENT";
        systemId: "library";
        documentId: string;
        collectionId?: string | undefined;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"GET_FOLDER_CONTENTS">;
        systemId: zod.ZodLiteral<"library">;
        folderId: zod.ZodNullable<zod.ZodString>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "GET_FOLDER_CONTENTS";
        systemId: "library";
        folderId: string | null;
    }, {
        type: "GET_FOLDER_CONTENTS";
        systemId: "library";
        folderId: string | null;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"NAVIGATE_TO_FOLDER">;
        systemId: zod.ZodLiteral<"library">;
        folderId: zod.ZodNullable<zod.ZodString>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "NAVIGATE_TO_FOLDER";
        systemId: "library";
        folderId: string | null;
    }, {
        type: "NAVIGATE_TO_FOLDER";
        systemId: "library";
        folderId: string | null;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"RENAME_ITEM">;
        systemId: zod.ZodLiteral<"library">;
        id: zod.ZodString;
        name: zod.ZodString;
        itemType: zod.ZodEnum<["document", "folder"]>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        id: string;
        type: "RENAME_ITEM";
        systemId: "library";
        name: string;
        itemType: "document" | "folder";
    }, {
        id: string;
        type: "RENAME_ITEM";
        systemId: "library";
        name: string;
        itemType: "document" | "folder";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"DELETE_ITEMS">;
        systemId: zod.ZodLiteral<"library">;
        ids: zod.ZodArray<zod.ZodString, "many">;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "DELETE_ITEMS";
        systemId: "library";
        ids: string[];
    }, {
        type: "DELETE_ITEMS";
        systemId: "library";
        ids: string[];
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"MOVE_ITEMS">;
        systemId: zod.ZodLiteral<"library">;
        ids: zod.ZodArray<zod.ZodString, "many">;
        targetFolderId: zod.ZodNullable<zod.ZodString>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "MOVE_ITEMS";
        systemId: "library";
        ids: string[];
        targetFolderId: string | null;
    }, {
        type: "MOVE_ITEMS";
        systemId: "library";
        ids: string[];
        targetFolderId: string | null;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"CREATE_SYMLINK_COLLECTION">;
        systemId: zod.ZodLiteral<"library">;
        name: zod.ZodString;
        symlinkPath: zod.ZodString;
        parentId: zod.ZodOptional<zod.ZodString>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "CREATE_SYMLINK_COLLECTION";
        systemId: "library";
        name: string;
        symlinkPath: string;
        parentId?: string | undefined;
    }, {
        type: "CREATE_SYMLINK_COLLECTION";
        systemId: "library";
        name: string;
        symlinkPath: string;
        parentId?: string | undefined;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"UPDATE_SYMLINK_PATH">;
        systemId: zod.ZodLiteral<"library">;
        collectionId: zod.ZodString;
        newPath: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "UPDATE_SYMLINK_PATH";
        systemId: "library";
        collectionId: string;
        newPath: string;
    }, {
        type: "UPDATE_SYMLINK_PATH";
        systemId: "library";
        collectionId: string;
        newPath: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"IMPORT_LIBRARY">;
        systemId: zod.ZodLiteral<"library">;
        directory: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "IMPORT_LIBRARY";
        systemId: "library";
        directory: string;
    }, {
        type: "IMPORT_LIBRARY";
        systemId: "library";
        directory: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"EXPORT_LIBRARY">;
        systemId: zod.ZodLiteral<"library">;
        directory: zod.ZodString;
        format: zod.ZodEnum<["markdown", "json"]>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "EXPORT_LIBRARY";
        systemId: "library";
        directory: string;
        format: "json" | "markdown";
    }, {
        type: "EXPORT_LIBRARY";
        systemId: "library";
        directory: string;
        format: "json" | "markdown";
    }>] | readonly [zod.ZodObject<{
        type: zod.ZodLiteral<"explorer.LIST_FILES">;
        systemId: zod.ZodLiteral<"code">;
        path: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        path: string;
        type: "explorer.LIST_FILES";
        systemId: "code";
    }, {
        path: string;
        type: "explorer.LIST_FILES";
        systemId: "code";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"explorer.READ_FILE">;
        systemId: zod.ZodLiteral<"code">;
        path: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        path: string;
        type: "explorer.READ_FILE";
        systemId: "code";
    }, {
        path: string;
        type: "explorer.READ_FILE";
        systemId: "code";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"explorer.WRITE_FILE">;
        systemId: zod.ZodLiteral<"code">;
        path: zod.ZodString;
        content: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        content: string;
        path: string;
        type: "explorer.WRITE_FILE";
        systemId: "code";
    }, {
        content: string;
        path: string;
        type: "explorer.WRITE_FILE";
        systemId: "code";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"explorer.CREATE_FILE">;
        systemId: zod.ZodLiteral<"code">;
        path: zod.ZodString;
        content: zod.ZodOptional<zod.ZodString>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        path: string;
        type: "explorer.CREATE_FILE";
        systemId: "code";
        content?: string | undefined;
    }, {
        path: string;
        type: "explorer.CREATE_FILE";
        systemId: "code";
        content?: string | undefined;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"explorer.DELETE_FILE">;
        systemId: zod.ZodLiteral<"code">;
        path: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        path: string;
        type: "explorer.DELETE_FILE";
        systemId: "code";
    }, {
        path: string;
        type: "explorer.DELETE_FILE";
        systemId: "code";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"explorer.RENAME_FILE">;
        systemId: zod.ZodLiteral<"code">;
        oldPath: zod.ZodString;
        newPath: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "explorer.RENAME_FILE";
        systemId: "code";
        newPath: string;
        oldPath: string;
    }, {
        type: "explorer.RENAME_FILE";
        systemId: "code";
        newPath: string;
        oldPath: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"explorer.CREATE_DIRECTORY">;
        systemId: zod.ZodLiteral<"code">;
        path: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        path: string;
        type: "explorer.CREATE_DIRECTORY";
        systemId: "code";
    }, {
        path: string;
        type: "explorer.CREATE_DIRECTORY";
        systemId: "code";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"explorer.GET_FILE_INFO">;
        systemId: zod.ZodLiteral<"code">;
        path: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        path: string;
        type: "explorer.GET_FILE_INFO";
        systemId: "code";
    }, {
        path: string;
        type: "explorer.GET_FILE_INFO";
        systemId: "code";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"explorer.CLOSE_FILE">;
        systemId: zod.ZodLiteral<"code">;
        path: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        path: string;
        type: "explorer.CLOSE_FILE";
        systemId: "code";
    }, {
        path: string;
        type: "explorer.CLOSE_FILE";
        systemId: "code";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"explorer.QUICK_OPEN_SEARCH">;
        systemId: zod.ZodLiteral<"code">;
        baseDirectory: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "explorer.QUICK_OPEN_SEARCH";
        systemId: "code";
        baseDirectory: string;
    }, {
        type: "explorer.QUICK_OPEN_SEARCH";
        systemId: "code";
        baseDirectory: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"explorer.MOVE_FILES">;
        systemId: zod.ZodLiteral<"code">;
        sourcePaths: zod.ZodArray<zod.ZodString, "many">;
        targetDir: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "explorer.MOVE_FILES";
        systemId: "code";
        sourcePaths: string[];
        targetDir: string;
    }, {
        type: "explorer.MOVE_FILES";
        systemId: "code";
        sourcePaths: string[];
        targetDir: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"search.SEARCH_FILES">;
        systemId: zod.ZodLiteral<"code">;
        query: zod.ZodString;
        path: zod.ZodString;
        includePattern: zod.ZodOptional<zod.ZodString>;
        excludePattern: zod.ZodOptional<zod.ZodString>;
        caseSensitive: zod.ZodOptional<zod.ZodBoolean>;
        wholeWord: zod.ZodOptional<zod.ZodBoolean>;
        useRegex: zod.ZodOptional<zod.ZodBoolean>;
        maxResults: zod.ZodOptional<zod.ZodNumber>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        path: string;
        type: "search.SEARCH_FILES";
        systemId: "code";
        query: string;
        includePattern?: string | undefined;
        excludePattern?: string | undefined;
        caseSensitive?: boolean | undefined;
        wholeWord?: boolean | undefined;
        useRegex?: boolean | undefined;
        maxResults?: number | undefined;
    }, {
        path: string;
        type: "search.SEARCH_FILES";
        systemId: "code";
        query: string;
        includePattern?: string | undefined;
        excludePattern?: string | undefined;
        caseSensitive?: boolean | undefined;
        wholeWord?: boolean | undefined;
        useRegex?: boolean | undefined;
        maxResults?: number | undefined;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"search.CANCEL_SEARCH">;
        systemId: zod.ZodLiteral<"code">;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "search.CANCEL_SEARCH";
        systemId: "code";
    }, {
        type: "search.CANCEL_SEARCH";
        systemId: "code";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"commit.GET_GIT_STATUS">;
        systemId: zod.ZodLiteral<"code">;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "commit.GET_GIT_STATUS";
        systemId: "code";
    }, {
        type: "commit.GET_GIT_STATUS";
        systemId: "code";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"commit.GET_GIT_DIFF">;
        systemId: zod.ZodLiteral<"code">;
        path: zod.ZodOptional<zod.ZodString>;
        staged: zod.ZodOptional<zod.ZodBoolean>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "commit.GET_GIT_DIFF";
        systemId: "code";
        path?: string | undefined;
        staged?: boolean | undefined;
    }, {
        type: "commit.GET_GIT_DIFF";
        systemId: "code";
        path?: string | undefined;
        staged?: boolean | undefined;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"commit.STAGE_FILES">;
        systemId: zod.ZodLiteral<"code">;
        paths: zod.ZodArray<zod.ZodString, "many">;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "commit.STAGE_FILES";
        systemId: "code";
        paths: string[];
    }, {
        type: "commit.STAGE_FILES";
        systemId: "code";
        paths: string[];
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"commit.UNSTAGE_FILES">;
        systemId: zod.ZodLiteral<"code">;
        paths: zod.ZodArray<zod.ZodString, "many">;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "commit.UNSTAGE_FILES";
        systemId: "code";
        paths: string[];
    }, {
        type: "commit.UNSTAGE_FILES";
        systemId: "code";
        paths: string[];
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"commit.COMMIT">;
        systemId: zod.ZodLiteral<"code">;
        message: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        message: string;
        type: "commit.COMMIT";
        systemId: "code";
    }, {
        message: string;
        type: "commit.COMMIT";
        systemId: "code";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"commit.GET_CURRENT_BRANCH">;
        systemId: zod.ZodLiteral<"code">;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "commit.GET_CURRENT_BRANCH";
        systemId: "code";
    }, {
        type: "commit.GET_CURRENT_BRANCH";
        systemId: "code";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"commit.REVERT_FILE">;
        systemId: zod.ZodLiteral<"code">;
        path: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        path: string;
        type: "commit.REVERT_FILE";
        systemId: "code";
    }, {
        path: string;
        type: "commit.REVERT_FILE";
        systemId: "code";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"commit.REVERT_FILES">;
        systemId: zod.ZodLiteral<"code">;
        paths: zod.ZodArray<zod.ZodString, "many">;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "commit.REVERT_FILES";
        systemId: "code";
        paths: string[];
    }, {
        type: "commit.REVERT_FILES";
        systemId: "code";
        paths: string[];
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"commit.GET_ALL_BRANCHES">;
        systemId: zod.ZodLiteral<"code">;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "commit.GET_ALL_BRANCHES";
        systemId: "code";
    }, {
        type: "commit.GET_ALL_BRANCHES";
        systemId: "code";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"commit.CHECKOUT_BRANCH">;
        systemId: zod.ZodLiteral<"code">;
        branchName: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "commit.CHECKOUT_BRANCH";
        systemId: "code";
        branchName: string;
    }, {
        type: "commit.CHECKOUT_BRANCH";
        systemId: "code";
        branchName: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"commit.PUBLISH_BRANCH">;
        systemId: zod.ZodLiteral<"code">;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "commit.PUBLISH_BRANCH";
        systemId: "code";
    }, {
        type: "commit.PUBLISH_BRANCH";
        systemId: "code";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"commit.PULL_BRANCH">;
        systemId: zod.ZodLiteral<"code">;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "commit.PULL_BRANCH";
        systemId: "code";
    }, {
        type: "commit.PULL_BRANCH";
        systemId: "code";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"commit.GENERATE_MESSAGE">;
        systemId: zod.ZodLiteral<"code">;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "commit.GENERATE_MESSAGE";
        systemId: "code";
    }, {
        type: "commit.GENERATE_MESSAGE";
        systemId: "code";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"commit.STASH_PUSH">;
        systemId: zod.ZodLiteral<"code">;
        message: zod.ZodOptional<zod.ZodString>;
        stagedOnly: zod.ZodOptional<zod.ZodBoolean>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "commit.STASH_PUSH";
        systemId: "code";
        message?: string | undefined;
        stagedOnly?: boolean | undefined;
    }, {
        type: "commit.STASH_PUSH";
        systemId: "code";
        message?: string | undefined;
        stagedOnly?: boolean | undefined;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"commit.STASH_LIST">;
        systemId: zod.ZodLiteral<"code">;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "commit.STASH_LIST";
        systemId: "code";
    }, {
        type: "commit.STASH_LIST";
        systemId: "code";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"commit.STASH_APPLY">;
        systemId: zod.ZodLiteral<"code">;
        index: zod.ZodNumber;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "commit.STASH_APPLY";
        systemId: "code";
        index: number;
    }, {
        type: "commit.STASH_APPLY";
        systemId: "code";
        index: number;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"commit.STASH_POP">;
        systemId: zod.ZodLiteral<"code">;
        index: zod.ZodNumber;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "commit.STASH_POP";
        systemId: "code";
        index: number;
    }, {
        type: "commit.STASH_POP";
        systemId: "code";
        index: number;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"commit.STASH_DROP">;
        systemId: zod.ZodLiteral<"code">;
        index: zod.ZodNumber;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "commit.STASH_DROP";
        systemId: "code";
        index: number;
    }, {
        type: "commit.STASH_DROP";
        systemId: "code";
        index: number;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"commit.STASH_CLEAR">;
        systemId: zod.ZodLiteral<"code">;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "commit.STASH_CLEAR";
        systemId: "code";
    }, {
        type: "commit.STASH_CLEAR";
        systemId: "code";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"pr.GET_BASE_BRANCH">;
        systemId: zod.ZodLiteral<"code">;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "pr.GET_BASE_BRANCH";
        systemId: "code";
    }, {
        type: "pr.GET_BASE_BRANCH";
        systemId: "code";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"pr.GET_BRANCH_DIFF">;
        systemId: zod.ZodLiteral<"code">;
        baseBranch: zod.ZodOptional<zod.ZodString>;
        headBranch: zod.ZodOptional<zod.ZodString>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "pr.GET_BRANCH_DIFF";
        systemId: "code";
        baseBranch?: string | undefined;
        headBranch?: string | undefined;
    }, {
        type: "pr.GET_BRANCH_DIFF";
        systemId: "code";
        baseBranch?: string | undefined;
        headBranch?: string | undefined;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"pr.GET_BRANCH_FILE_DIFF">;
        systemId: zod.ZodLiteral<"code">;
        path: zod.ZodString;
        baseBranch: zod.ZodString;
        headBranch: zod.ZodOptional<zod.ZodString>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        path: string;
        type: "pr.GET_BRANCH_FILE_DIFF";
        systemId: "code";
        baseBranch: string;
        headBranch?: string | undefined;
    }, {
        path: string;
        type: "pr.GET_BRANCH_FILE_DIFF";
        systemId: "code";
        baseBranch: string;
        headBranch?: string | undefined;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"pr.LIST_OPEN_PRS">;
        systemId: zod.ZodLiteral<"code">;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "pr.LIST_OPEN_PRS";
        systemId: "code";
    }, {
        type: "pr.LIST_OPEN_PRS";
        systemId: "code";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"pr.SELECT_PR">;
        systemId: zod.ZodLiteral<"code">;
        number: zod.ZodNumber;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        number: number;
        type: "pr.SELECT_PR";
        systemId: "code";
    }, {
        number: number;
        type: "pr.SELECT_PR";
        systemId: "code";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"pr.CREATE_PR">;
        systemId: zod.ZodLiteral<"code">;
        title: zod.ZodString;
        body: zod.ZodString;
        base: zod.ZodOptional<zod.ZodString>;
        draft: zod.ZodOptional<zod.ZodBoolean>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "pr.CREATE_PR";
        systemId: "code";
        title: string;
        body: string;
        base?: string | undefined;
        draft?: boolean | undefined;
    }, {
        type: "pr.CREATE_PR";
        systemId: "code";
        title: string;
        body: string;
        base?: string | undefined;
        draft?: boolean | undefined;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"pr.MERGE_PR">;
        systemId: zod.ZodLiteral<"code">;
        number: zod.ZodNumber;
        method: zod.ZodOptional<zod.ZodEnum<["merge", "squash", "rebase"]>>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        number: number;
        type: "pr.MERGE_PR";
        systemId: "code";
        method?: "merge" | "squash" | "rebase" | undefined;
    }, {
        number: number;
        type: "pr.MERGE_PR";
        systemId: "code";
        method?: "merge" | "squash" | "rebase" | undefined;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"pr.CLOSE_PR">;
        systemId: zod.ZodLiteral<"code">;
        number: zod.ZodNumber;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        number: number;
        type: "pr.CLOSE_PR";
        systemId: "code";
    }, {
        number: number;
        type: "pr.CLOSE_PR";
        systemId: "code";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"pr.TOGGLE_DRAFT">;
        systemId: zod.ZodLiteral<"code">;
        number: zod.ZodNumber;
        isDraft: zod.ZodBoolean;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        number: number;
        type: "pr.TOGGLE_DRAFT";
        systemId: "code";
        isDraft: boolean;
    }, {
        number: number;
        type: "pr.TOGGLE_DRAFT";
        systemId: "code";
        isDraft: boolean;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"pr.CHECK_BRANCH_PR">;
        systemId: zod.ZodLiteral<"code">;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "pr.CHECK_BRANCH_PR";
        systemId: "code";
    }, {
        type: "pr.CHECK_BRANCH_PR";
        systemId: "code";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"pr.CHECK_GH_AUTH">;
        systemId: zod.ZodLiteral<"code">;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "pr.CHECK_GH_AUTH";
        systemId: "code";
    }, {
        type: "pr.CHECK_GH_AUTH";
        systemId: "code";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"pr.GET_PR_AUTOFILL">;
        systemId: zod.ZodLiteral<"code">;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "pr.GET_PR_AUTOFILL";
        systemId: "code";
    }, {
        type: "pr.GET_PR_AUTOFILL";
        systemId: "code";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"pr.GET_SMART_BASE_BRANCH">;
        systemId: zod.ZodLiteral<"code">;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "pr.GET_SMART_BASE_BRANCH";
        systemId: "code";
    }, {
        type: "pr.GET_SMART_BASE_BRANCH";
        systemId: "code";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"pr.DELETE_BRANCH">;
        systemId: zod.ZodLiteral<"code">;
        branch: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "pr.DELETE_BRANCH";
        systemId: "code";
        branch: string;
    }, {
        type: "pr.DELETE_BRANCH";
        systemId: "code";
        branch: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"pr.UPDATE_PR">;
        systemId: zod.ZodLiteral<"code">;
        number: zod.ZodNumber;
        title: zod.ZodOptional<zod.ZodString>;
        body: zod.ZodOptional<zod.ZodString>;
        base: zod.ZodOptional<zod.ZodString>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        number: number;
        type: "pr.UPDATE_PR";
        systemId: "code";
        title?: string | undefined;
        body?: string | undefined;
        base?: string | undefined;
    }, {
        number: number;
        type: "pr.UPDATE_PR";
        systemId: "code";
        title?: string | undefined;
        body?: string | undefined;
        base?: string | undefined;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"pr.CREATE_COMMENT">;
        systemId: zod.ZodLiteral<"code">;
        number: zod.ZodNumber;
        body: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        number: number;
        type: "pr.CREATE_COMMENT";
        systemId: "code";
        body: string;
    }, {
        number: number;
        type: "pr.CREATE_COMMENT";
        systemId: "code";
        body: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"pr.EDIT_COMMENT">;
        systemId: zod.ZodLiteral<"code">;
        commentId: zod.ZodNumber;
        body: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "pr.EDIT_COMMENT";
        systemId: "code";
        body: string;
        commentId: number;
    }, {
        type: "pr.EDIT_COMMENT";
        systemId: "code";
        body: string;
        commentId: number;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"pr.DELETE_COMMENT">;
        systemId: zod.ZodLiteral<"code">;
        commentId: zod.ZodNumber;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "pr.DELETE_COMMENT";
        systemId: "code";
        commentId: number;
    }, {
        type: "pr.DELETE_COMMENT";
        systemId: "code";
        commentId: number;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"pr.GET_COMMENTS">;
        systemId: zod.ZodLiteral<"code">;
        number: zod.ZodNumber;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        number: number;
        type: "pr.GET_COMMENTS";
        systemId: "code";
    }, {
        number: number;
        type: "pr.GET_COMMENTS";
        systemId: "code";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"pr.GET_REVIEW_THREADS">;
        systemId: zod.ZodLiteral<"code">;
        number: zod.ZodNumber;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        number: number;
        type: "pr.GET_REVIEW_THREADS";
        systemId: "code";
    }, {
        number: number;
        type: "pr.GET_REVIEW_THREADS";
        systemId: "code";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"pr.REPLY_TO_THREAD">;
        systemId: zod.ZodLiteral<"code">;
        prNumber: zod.ZodNumber;
        commentId: zod.ZodNumber;
        body: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "pr.REPLY_TO_THREAD";
        systemId: "code";
        body: string;
        commentId: number;
        prNumber: number;
    }, {
        type: "pr.REPLY_TO_THREAD";
        systemId: "code";
        body: string;
        commentId: number;
        prNumber: number;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"pr.RESOLVE_THREAD">;
        systemId: zod.ZodLiteral<"code">;
        threadId: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "pr.RESOLVE_THREAD";
        systemId: "code";
        threadId: string;
    }, {
        type: "pr.RESOLVE_THREAD";
        systemId: "code";
        threadId: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"pr.UNRESOLVE_THREAD">;
        systemId: zod.ZodLiteral<"code">;
        threadId: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "pr.UNRESOLVE_THREAD";
        systemId: "code";
        threadId: string;
    }, {
        type: "pr.UNRESOLVE_THREAD";
        systemId: "code";
        threadId: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"pr.EDIT_REVIEW_COMMENT">;
        systemId: zod.ZodLiteral<"code">;
        commentId: zod.ZodNumber;
        body: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "pr.EDIT_REVIEW_COMMENT";
        systemId: "code";
        body: string;
        commentId: number;
    }, {
        type: "pr.EDIT_REVIEW_COMMENT";
        systemId: "code";
        body: string;
        commentId: number;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"pr.DELETE_REVIEW_COMMENT">;
        systemId: zod.ZodLiteral<"code">;
        commentId: zod.ZodNumber;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "pr.DELETE_REVIEW_COMMENT";
        systemId: "code";
        commentId: number;
    }, {
        type: "pr.DELETE_REVIEW_COMMENT";
        systemId: "code";
        commentId: number;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"terminal.CREATE_TERMINAL">;
        systemId: zod.ZodLiteral<"code">;
        title: zod.ZodOptional<zod.ZodString>;
        cwd: zod.ZodOptional<zod.ZodString>;
        shell: zod.ZodOptional<zod.ZodString>;
        cols: zod.ZodOptional<zod.ZodNumber>;
        rows: zod.ZodOptional<zod.ZodNumber>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "terminal.CREATE_TERMINAL";
        systemId: "code";
        title?: string | undefined;
        cwd?: string | undefined;
        shell?: string | undefined;
        cols?: number | undefined;
        rows?: number | undefined;
    }, {
        type: "terminal.CREATE_TERMINAL";
        systemId: "code";
        title?: string | undefined;
        cwd?: string | undefined;
        shell?: string | undefined;
        cols?: number | undefined;
        rows?: number | undefined;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"terminal.CLOSE_TERMINAL">;
        systemId: zod.ZodLiteral<"code">;
        terminalId: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "terminal.CLOSE_TERMINAL";
        systemId: "code";
        terminalId: string;
    }, {
        type: "terminal.CLOSE_TERMINAL";
        systemId: "code";
        terminalId: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"terminal.TERMINAL_INPUT">;
        systemId: zod.ZodLiteral<"code">;
        terminalId: zod.ZodString;
        data: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        data: string;
        type: "terminal.TERMINAL_INPUT";
        systemId: "code";
        terminalId: string;
    }, {
        data: string;
        type: "terminal.TERMINAL_INPUT";
        systemId: "code";
        terminalId: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"terminal.RESIZE_TERMINAL">;
        systemId: zod.ZodLiteral<"code">;
        terminalId: zod.ZodString;
        cols: zod.ZodNumber;
        rows: zod.ZodNumber;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "terminal.RESIZE_TERMINAL";
        systemId: "code";
        cols: number;
        rows: number;
        terminalId: string;
    }, {
        type: "terminal.RESIZE_TERMINAL";
        systemId: "code";
        cols: number;
        rows: number;
        terminalId: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"terminal.RENAME_TERMINAL">;
        systemId: zod.ZodLiteral<"code">;
        terminalId: zod.ZodString;
        customTitle: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "terminal.RENAME_TERMINAL";
        systemId: "code";
        terminalId: string;
        customTitle: string;
    }, {
        type: "terminal.RENAME_TERMINAL";
        systemId: "code";
        terminalId: string;
        customTitle: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"terminal.REFRESH_LIST">;
        systemId: zod.ZodLiteral<"code">;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "terminal.REFRESH_LIST";
        systemId: "code";
    }, {
        type: "terminal.REFRESH_LIST";
        systemId: "code";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"terminal.OPEN_TERMINAL_TAB">;
        systemId: zod.ZodLiteral<"code">;
        terminalId: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "terminal.OPEN_TERMINAL_TAB";
        systemId: "code";
        terminalId: string;
    }, {
        type: "terminal.OPEN_TERMINAL_TAB";
        systemId: "code";
        terminalId: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"codeActions.OPEN_ACTION">;
        systemId: zod.ZodLiteral<"code">;
        actionId: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "codeActions.OPEN_ACTION";
        systemId: "code";
        actionId: string;
    }, {
        type: "codeActions.OPEN_ACTION";
        systemId: "code";
        actionId: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"codeActions.SAVE_ACTION">;
        systemId: zod.ZodLiteral<"code">;
        actionId: zod.ZodString;
        actionFn: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "codeActions.SAVE_ACTION";
        systemId: "code";
        actionId: string;
        actionFn: string;
    }, {
        type: "codeActions.SAVE_ACTION";
        systemId: "code";
        actionId: string;
        actionFn: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"codePrompts.OPEN_PROMPT">;
        systemId: zod.ZodLiteral<"code">;
        promptId: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "codePrompts.OPEN_PROMPT";
        systemId: "code";
        promptId: string;
    }, {
        type: "codePrompts.OPEN_PROMPT";
        systemId: "code";
        promptId: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"codePrompts.SAVE_PROMPT">;
        systemId: zod.ZodLiteral<"code">;
        promptId: zod.ZodString;
        templateFn: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "codePrompts.SAVE_PROMPT";
        systemId: "code";
        promptId: string;
        templateFn: string;
    }, {
        type: "codePrompts.SAVE_PROMPT";
        systemId: "code";
        promptId: string;
        templateFn: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"SET_BASE_DIRECTORY">;
        systemId: zod.ZodLiteral<"code">;
        path: zod.ZodString;
        fromUserNavigation: zod.ZodOptional<zod.ZodBoolean>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        path: string;
        type: "SET_BASE_DIRECTORY";
        systemId: "code";
        fromUserNavigation?: boolean | undefined;
    }, {
        path: string;
        type: "SET_BASE_DIRECTORY";
        systemId: "code";
        fromUserNavigation?: boolean | undefined;
    }>] | readonly [zod.ZodObject<{
        type: zod.ZodLiteral<"CREATE_NOTE">;
        systemId: zod.ZodLiteral<"notes">;
        title: zod.ZodString;
        content: zod.ZodOptional<zod.ZodString>;
        icon: zod.ZodOptional<zod.ZodNullable<zod.ZodString>>;
        parentId: zod.ZodOptional<zod.ZodString>;
        skipContentSync: zod.ZodOptional<zod.ZodBoolean>;
        noteType: zod.ZodOptional<zod.ZodEnum<["document", "tasklist", "task"]>>;
        completed: zod.ZodOptional<zod.ZodBoolean>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "CREATE_NOTE";
        systemId: "notes";
        title: string;
        completed?: boolean | undefined;
        content?: string | undefined;
        parentId?: string | undefined;
        icon?: string | null | undefined;
        skipContentSync?: boolean | undefined;
        noteType?: "document" | "tasklist" | "task" | undefined;
    }, {
        type: "CREATE_NOTE";
        systemId: "notes";
        title: string;
        completed?: boolean | undefined;
        content?: string | undefined;
        parentId?: string | undefined;
        icon?: string | null | undefined;
        skipContentSync?: boolean | undefined;
        noteType?: "document" | "tasklist" | "task" | undefined;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"UPDATE_NOTE">;
        systemId: zod.ZodLiteral<"notes">;
        id: zod.ZodString;
        title: zod.ZodOptional<zod.ZodString>;
        content: zod.ZodOptional<zod.ZodString>;
        icon: zod.ZodOptional<zod.ZodNullable<zod.ZodString>>;
        completed: zod.ZodOptional<zod.ZodBoolean>;
        hideCompletedChildren: zod.ZodOptional<zod.ZodBoolean>;
        favorite: zod.ZodOptional<zod.ZodBoolean>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        id: string;
        type: "UPDATE_NOTE";
        systemId: "notes";
        completed?: boolean | undefined;
        content?: string | undefined;
        title?: string | undefined;
        icon?: string | null | undefined;
        hideCompletedChildren?: boolean | undefined;
        favorite?: boolean | undefined;
    }, {
        id: string;
        type: "UPDATE_NOTE";
        systemId: "notes";
        completed?: boolean | undefined;
        content?: string | undefined;
        title?: string | undefined;
        icon?: string | null | undefined;
        hideCompletedChildren?: boolean | undefined;
        favorite?: boolean | undefined;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"DELETE_NOTE">;
        systemId: zod.ZodLiteral<"notes">;
        id: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        id: string;
        type: "DELETE_NOTE";
        systemId: "notes";
    }, {
        id: string;
        type: "DELETE_NOTE";
        systemId: "notes";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"SOFT_DELETE_NOTE">;
        systemId: zod.ZodLiteral<"notes">;
        id: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        id: string;
        type: "SOFT_DELETE_NOTE";
        systemId: "notes";
    }, {
        id: string;
        type: "SOFT_DELETE_NOTE";
        systemId: "notes";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"RESTORE_NOTE">;
        systemId: zod.ZodLiteral<"notes">;
        id: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        id: string;
        type: "RESTORE_NOTE";
        systemId: "notes";
    }, {
        id: string;
        type: "RESTORE_NOTE";
        systemId: "notes";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"MOVE_NOTE">;
        systemId: zod.ZodLiteral<"notes">;
        ids: zod.ZodArray<zod.ZodString, "many">;
        newParentId: zod.ZodNullable<zod.ZodString>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "MOVE_NOTE";
        systemId: "notes";
        ids: string[];
        newParentId: string | null;
    }, {
        type: "MOVE_NOTE";
        systemId: "notes";
        ids: string[];
        newParentId: string | null;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"REORDER_NOTE">;
        systemId: zod.ZodLiteral<"notes">;
        id: zod.ZodString;
        newParentId: zod.ZodNullable<zod.ZodString>;
        newIndex: zod.ZodNumber;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        id: string;
        type: "REORDER_NOTE";
        systemId: "notes";
        newParentId: string | null;
        newIndex: number;
    }, {
        id: string;
        type: "REORDER_NOTE";
        systemId: "notes";
        newParentId: string | null;
        newIndex: number;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"VIEW_NOTE">;
        systemId: zod.ZodLiteral<"notes">;
        id: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        id: string;
        type: "VIEW_NOTE";
        systemId: "notes";
    }, {
        id: string;
        type: "VIEW_NOTE";
        systemId: "notes";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"SEARCH_NOTES">;
        systemId: zod.ZodLiteral<"notes">;
        query: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "SEARCH_NOTES";
        systemId: "notes";
        query: string;
    }, {
        type: "SEARCH_NOTES";
        systemId: "notes";
        query: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"GET_TRASHED_NOTES">;
        systemId: zod.ZodLiteral<"notes">;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "GET_TRASHED_NOTES";
        systemId: "notes";
    }, {
        type: "GET_TRASHED_NOTES";
        systemId: "notes";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"PERMANENTLY_DELETE_NOTE">;
        systemId: zod.ZodLiteral<"notes">;
        id: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        id: string;
        type: "PERMANENTLY_DELETE_NOTE";
        systemId: "notes";
    }, {
        id: string;
        type: "PERMANENTLY_DELETE_NOTE";
        systemId: "notes";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"EMPTY_TRASH">;
        systemId: zod.ZodLiteral<"notes">;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "EMPTY_TRASH";
        systemId: "notes";
    }, {
        type: "EMPTY_TRASH";
        systemId: "notes";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"IMPORT_NOTES">;
        systemId: zod.ZodLiteral<"notes">;
        directory: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "IMPORT_NOTES";
        systemId: "notes";
        directory: string;
    }, {
        type: "IMPORT_NOTES";
        systemId: "notes";
        directory: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"EXPORT_NOTES">;
        systemId: zod.ZodLiteral<"notes">;
        directory: zod.ZodString;
        format: zod.ZodEnum<["markdown", "json"]>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "EXPORT_NOTES";
        systemId: "notes";
        directory: string;
        format: "json" | "markdown";
    }, {
        type: "EXPORT_NOTES";
        systemId: "notes";
        directory: string;
        format: "json" | "markdown";
    }>];
    readonly outgoing: {
        type: "RECEIVE_PLUGIN_DATA";
        data: FlowTNodeData;
        pluginId: "brain";
    } | {
        type: "TNODE_OPENED";
        tNodeId: EARS.EntityId;
        data: FlowTNodeData;
        pluginId: "brain";
    } | {
        type: "TNODE_SPAWNED";
        tNode: TNodeEntity;
        parentId?: EARS.EntityId | undefined;
        eventTNodeId?: EARS.EntityId | undefined;
        flowTNodeId: EARS.EntityId;
        pluginId: "brain";
    } | {
        type: "TNODE_UPDATED";
        data: TNodeUpdate;
        pluginId: "brain";
    } | {
        type: "EVENT_PULSE";
        eventType: string;
        pluginId: "brain";
    } | {
        type: "TNODE_DETAILS";
        tNodeId: EARS.EntityId;
        details: TNodeEntity | null;
        pluginId: "brain";
    } | {
        type: "INSPECT_TOGGLED";
        enabled: boolean;
        pluginId: "brain";
    } | {
        type: "BRAIN_KILLED";
        pluginId: "brain";
    } | {
        type: "BRAIN_STARTED";
        pluginId: "brain";
    } | {
        type: "BRAIN_PAUSED";
        pluginId: "brain";
    } | {
        type: "BRAIN_RESUMED";
        pluginId: "brain";
    } | {
        type: "SETTINGS_LOADED";
        data: SettingsData;
        faqs: FAQItem[];
        pluginId: "settings";
    } | {
        type: "SETTINGS_UPDATED";
        data: SettingsData;
        pluginId: "settings";
    } | {
        type: "SETTINGS_RESET";
        data: SettingsData;
        pluginId: "settings";
    } | {
        type: "APPLICATION_HOTKEYS";
        hotkeys: SettingsData["general"]["application"]["hotkeys"];
        pluginId: "settings";
    } | {
        type: "CLI_TEST_RESULT";
        provider: string;
        success: boolean;
        error?: string | undefined;
        resolvedPath?: string | undefined;
        pluginId: "settings";
    } | {
        type: "SETUP_PACK_IMPORTED";
        result: SeedResult;
        pluginId: "settings";
    } | {
        type: "SETUP_PACK_IMPORT_FAILED";
        error: string;
        pluginId: "settings";
    } | {
        type: "SETUP_PACK_PREVIEW";
        preview: SetupPackPreview;
        pluginId: "settings";
    } | {
        type: "SETUP_PACK_PREVIEW_FAILED";
        error: string;
        pluginId: "settings";
    } | {
        type: "APP_RESET_COMPLETE";
        pluginId: "settings";
    } | {
        type: "APP_RESET_FAILED";
        error: string;
        pluginId: "settings";
    } | {
        type: "SECRETS.EVENT.LOADED";
        data: SecretData[];
        pluginId: "settings";
    } | {
        type: "SECRETS.EVENT.CREATED";
        id: EARS.EntityId;
        provider: SecretProvider;
        customName?: string | undefined;
        pluginId: "settings";
    } | {
        type: "SECRETS.EVENT.UPDATED";
        id: EARS.EntityId;
        pluginId: "settings";
    } | {
        type: "SECRETS.EVENT.DELETED";
        id: EARS.EntityId;
        pluginId: "settings";
    } | {
        type: "SECRETS.EVENT.VALUE";
        id: EARS.EntityId;
        value: string;
        pluginId: "settings";
    } | {
        type: "SECRETS.EVENT.ERROR";
        message: string;
        pluginId: "settings";
    } | {
        type: "THREAD_CONNECTED";
        data: ThreadConnectedData;
        pluginId: "threads";
    } | {
        type: "SET_VIEW_DATA";
        id: EARS.EntityId;
        data: ThreadExtendedData;
        pluginId: "threads";
    } | {
        type: "THREAD_CREATED";
        id: EARS.EntityId;
        shortCode: string;
        entityType: EARS.Entity;
        timestamp: number;
        topic?: string | undefined;
        instructions?: string | undefined;
        status?: string | undefined;
        pluginId: "threads";
    } | {
        type: "THREAD_UPDATED";
        threadId: string;
        updates: Partial<Pick<ThreadEntity, "status" | "tags">>;
        pluginId: "threads";
    } | {
        type: "THREAD_DELETED";
        threadId: string;
        pluginId: "threads";
    } | {
        type: "THREADS_EXPORTED";
        filePath: string;
        threadCount: number;
        pluginId: "threads";
    } | {
        type: "THREADS_EXPORT_FAILED";
        errors: string[];
        pluginId: "threads";
    } | {
        type: "THREADS_IMPORTED";
        count: number;
        errors?: string[] | undefined;
        pluginId: "threads";
    } | {
        type: "THREADS_IMPORT_FAILED";
        errors: string[];
        pluginId: "threads";
    } | {
        type: "AGENT_CONNECTED";
        data: AgentConnectedData;
        pluginId: "threads";
    } | {
        type: "LOAD_CHAT_THREAD";
        data: AgentThreadData;
        pluginId: "threads";
    } | {
        type: "REFRESH_RECENT_THREADS";
        data: RecentThreadRefreshData;
        pluginId: "threads";
    } | {
        type: "ARTIFACT_ADDED";
        tabId: string;
        artifact: any;
        pluginId: "threads";
    } | {
        type: "ARTIFACT_UPDATED";
        tabId: string;
        artifact: any;
        pluginId: "threads";
    } | {
        type: "THREAD_TAB_REQUESTED";
        threadId: string;
        topic: string;
        artifacts: any[];
        pinned?: boolean | undefined;
        pluginId: "threads";
    } | {
        type: "AGENT_SETTINGS_UPDATED";
        settings: AgentSettings;
        pluginId: "threads";
    } | {
        type: "API_KEYS_STATUS";
        hasRequiredApiKeys: boolean;
        pluginId: "threads";
    } | {
        type: "UPDATE_MESSAGE_STATE";
        messageId: string;
        text?: string | undefined;
        blocks?: BlockConfig[] | undefined;
        responseTimestamp?: number | undefined;
        blockResponse?: BlockResponse | undefined;
        forkable?: boolean | undefined;
        status?: "queued" | "cancelled" | null | undefined;
        context?: Record<string, unknown> | undefined;
        asideText?: string | undefined;
        asideContext?: string | undefined;
        compacted?: boolean | undefined;
        pluginId: "threads";
    } | {
        type: "MESSAGE_ADDED";
        threadId: string;
        message: MessageEntity;
        pluginId: "threads";
    } | {
        type: "UPDATE_TODO_TASK";
        artifactId: string;
        taskId: string;
        completed: boolean;
        pluginId: "threads";
    } | {
        type: "SET_MODE";
        mode: string;
        pluginId: "threads";
    } | {
        type: "SET_PHASE";
        phase: string;
        pluginId: "threads";
    } | {
        type: "SET_CHAT_STATE";
        threadId: string;
        chatState: string;
        pluginId: "threads";
    } | {
        type: "FLASH_CHAT_STATE";
        threadId: string;
        stateId: string;
        durationMs?: number | undefined;
        pluginId: "threads";
    } | {
        type: "COMMANDS_UPDATED";
        commands: CommandItem[];
        pluginId: "threads";
    } | {
        type: "THREAD_CHAT_ERROR";
        threadId: string;
        error: string;
        pluginId: "threads";
    } | {
        type: "FLOWS_CONNECTED";
        data: FlowsConnectedData;
        pluginId: "flows";
    } | {
        type: "FLOW_SELECTED";
        flowId: EARS.EntityId;
        data: {
            nodes: any[];
            edges: any[];
        };
        pluginId: "flows";
    } | {
        type: "FLOW_CREATED";
        flow: FlowEntity;
        flowId: EARS.EntityId;
        data: {
            nodes: any[];
            edges: any[];
        };
        pluginId: "flows";
    } | {
        type: "FLOW_DELETED";
        flowId: EARS.EntityId;
        pluginId: "flows";
    } | {
        type: "NODE_CREATED";
        tempId: string;
        nodeId: EARS.EntityId;
        node: any;
        pluginId: "flows";
    } | {
        type: "NODE_UPDATED";
        nodeId: EARS.EntityId;
        node: any;
        pluginId: "flows";
    } | {
        type: "NODE_DELETED";
        nodeId: string;
        pluginId: "flows";
    } | {
        type: "EDGE_CREATED";
        sourceId: EARS.EntityId;
        targetId: EARS.EntityId;
        relId: EARS.EntityId;
        sourceHandle?: string | undefined;
        targetHandle?: string | undefined;
        pluginId: "flows";
    } | {
        type: "EDGE_CREATE_FAILED";
        sourceId: string;
        targetId: string;
        error: string;
        pluginId: "flows";
    } | {
        type: "EDGE_DELETED";
        edgeId: string;
        pluginId: "flows";
    } | {
        type: "EDGE_UPDATED";
        oldEdgeId: EARS.EntityId;
        newEdgeId: EARS.EntityId;
        newSource: EARS.EntityId;
        newTarget: EARS.EntityId;
        pluginId: "flows";
    } | {
        type: "ACTION_CREATED";
        action: ActionEntity;
        actionId: EARS.EntityId;
        pluginId: "flows";
    } | {
        type: "ACTION_UPDATED";
        action: ActionEntity;
        actionId: EARS.EntityId;
        pluginId: "flows";
    } | {
        type: "ACTION_DELETED";
        actionId: EARS.EntityId;
        pluginId: "flows";
    } | {
        type: "DSL_IMPORTED";
        flowIds: EARS.EntityId[];
        errors?: string[] | undefined;
        pluginId: "flows";
    } | {
        type: "DSL_IMPORT_FAILED";
        errors: string[];
        pluginId: "flows";
    } | {
        type: "DSL_EXPORTED";
        filePath: string;
        flowCount: number;
        pluginId: "flows";
    } | {
        type: "DSL_EXPORT_FAILED";
        errors: string[];
        pluginId: "flows";
    } | {
        type: "DATABASE_REFRESH";
        data: DatabaseStartupData;
        pluginId: "database";
    } | {
        type: "QUERY_RESULT";
        result: any;
        executionTime: number;
        pluginId: "database";
    } | {
        type: "QUERY_ERROR";
        error: string;
        pluginId: "database";
    } | {
        type: "TRANSACTION_RESULT";
        result: any;
        executionTime: number;
        pluginId: "database";
    } | {
        type: "TRANSACTION_ERROR";
        error: string;
        pluginId: "database";
    } | {
        type: "AI_QUERY_LOADING";
        pluginId: "database";
    } | {
        type: "AI_QUERY_GENERATED";
        query: string;
        pluginId: "database";
    } | {
        type: "TRACE_FLOWS_RESULT";
        flows: TNodeEntity[];
        pluginId: "database";
    } | {
        type: "FLOW_EVENTS_RESULT";
        flowId: string;
        events: TNodeEntity[];
        hasMore: boolean;
        pluginId: "database";
    } | {
        type: "NODE_DETAILS_RESULT";
        nodeId: string;
        details: TNodeEntity | null;
        pluginId: "database";
    } | {
        type: "EXPORT_DATABASE_SUCCESS";
        path: string;
        pluginId: "database";
    } | {
        type: "EXPORT_DATABASE_ERROR";
        error: string;
        pluginId: "database";
    } | {
        type: "IMPORT_DATABASE_SUCCESS";
        message?: string | undefined;
        pluginId: "database";
    } | {
        type: "IMPORT_DATABASE_ERROR";
        error: string;
        pluginId: "database";
    } | {
        type: "BACKUP_INFO_RESULT";
        info: {
            timestamp: number;
            databases: string[];
            size: number;
            hasMedia?: boolean;
        } | null;
        pluginId: "database";
    } | {
        type: "RESET_DATABASE_SUCCESS";
        message: string;
        pluginId: "database";
    } | {
        type: "RESET_DATABASE_ERROR";
        error: string;
        pluginId: "database";
    } | {
        type: "LOGS_CONNECTED";
        logs: LogEntry[];
        settings?: LogsSettings | undefined;
        pluginId: "logs";
    } | {
        type: "LOGS_UPDATE";
        logs: LogEntry[];
        pluginId: "logs";
    } | {
        type: "LOG_ADDED";
        log: LogEntry;
        pluginId: "logs";
    } | {
        type: "LOGS_CLEARED";
        pluginId: "logs";
    } | {
        type: "LOGS_SETTINGS_UPDATED";
        settings: LogsSettings;
        pluginId: "logs";
    } | {
        type: "PROMPTS_CONNECTED";
        data: PromptsConnectedData;
        pluginId: "prompts";
    } | {
        type: "PROMPT_SELECTED";
        promptId: EARS.EntityId;
        data: PromptEntity;
        pluginId: "prompts";
    } | {
        type: "PROMPT_CREATED";
        prompt: PromptEntity;
        promptId: EARS.EntityId;
        pluginId: "prompts";
    } | {
        type: "PROMPT_UPDATED";
        prompt: PromptEntity;
        promptId: EARS.EntityId;
        pluginId: "prompts";
    } | {
        type: "PROMPT_DELETED";
        promptId: EARS.EntityId;
        pluginId: "prompts";
    } | {
        type: "PROMPTS_PAGE_LOADED";
        data: {
            prompts: PromptEntity[];
            page: number;
            totalPages: number;
        };
        pluginId: "prompts";
    } | {
        type: "PROMPTS_IMPORTED";
        count: number;
        errors?: string[] | undefined;
        pluginId: "prompts";
    } | {
        type: "PROMPTS_IMPORT_FAILED";
        errors: string[];
        pluginId: "prompts";
    } | {
        type: "PROMPTS_EXPORTED";
        filePath: string;
        promptCount: number;
        pluginId: "prompts";
    } | {
        type: "PROMPTS_EXPORT_FAILED";
        errors: string[];
        pluginId: "prompts";
    } | {
        type: "ACTIONS_LISTED";
        data: ActionsStartupData;
        pluginId: "actions";
    } | {
        type: "ACTION_SELECTED";
        actionId: EARS.EntityId;
        data: ActionEntity;
        pluginId: "actions";
    } | {
        type: "ACTION_CREATED";
        action: ActionEntity;
        actionId: EARS.EntityId;
        pluginId: "actions";
    } | {
        type: "ACTION_UPDATED";
        action: ActionEntity;
        actionId: EARS.EntityId;
        pluginId: "actions";
    } | {
        type: "ACTION_DELETED";
        actionId: EARS.EntityId;
        pluginId: "actions";
    } | {
        type: "ACTIONS_IMPORTED";
        count: number;
        errors?: string[] | undefined;
        pluginId: "actions";
    } | {
        type: "ACTIONS_IMPORT_FAILED";
        errors: string[];
        pluginId: "actions";
    } | {
        type: "ACTIONS_EXPORTED";
        filePath: string;
        actionCount: number;
        pluginId: "actions";
    } | {
        type: "ACTIONS_EXPORT_FAILED";
        errors: string[];
        pluginId: "actions";
    } | {
        type: "LIBRARY_CONNECTED";
        data: {
            documents: DocumentDTO[];
            collections: CollectionDTO[];
            settings: any;
        };
        pluginId: "library";
    } | {
        type: "DOCUMENTS_LOADED";
        data: {
            documents: DocumentDTO[];
        };
        pluginId: "library";
    } | {
        type: "DOCUMENT_CREATED";
        data: {
            document: DocumentDTO;
        };
        pluginId: "library";
    } | {
        type: "DOCUMENT_UPDATED";
        data: {
            document: DocumentDTO;
        };
        pluginId: "library";
    } | {
        type: "DOCUMENT_DELETED";
        data: {
            documentId: string;
        };
        pluginId: "library";
    } | {
        type: "DOCUMENT_LOADED";
        data: {
            document: DocumentDTO;
        };
        pluginId: "library";
    } | {
        type: "COLLECTIONS_LOADED";
        data: {
            collections: CollectionDTO[];
        };
        pluginId: "library";
    } | {
        type: "COLLECTION_CREATED";
        data: {
            collection: CollectionDTO;
        };
        pluginId: "library";
    } | {
        type: "COLLECTION_UPDATED";
        data: {
            collection: CollectionDTO;
        };
        pluginId: "library";
    } | {
        type: "COLLECTION_DELETED";
        data: {
            collectionId: string;
        };
        pluginId: "library";
    } | {
        type: "LIBRARY_ERROR";
        data: {
            error: string;
        };
        pluginId: "library";
    } | {
        type: "SYMLINK_UPDATED";
        data: {
            collection: CollectionDTO;
        };
        pluginId: "library";
    } | {
        type: "FOLDER_CONTENTS_LOADED";
        data: FolderContents;
        pluginId: "library";
    } | {
        type: "NAVIGATION_CHANGED";
        data: {
            folderId: string | null;
            path: string[];
        };
        pluginId: "library";
    } | {
        type: "ITEM_RENAMED";
        data: {
            item: LibraryItem;
        };
        pluginId: "library";
    } | {
        type: "ITEMS_DELETED";
        data: {
            ids: string[];
        };
        pluginId: "library";
    } | {
        type: "ITEMS_MOVED";
        data: {
            ids: string[];
            targetFolderId: string | null;
        };
        pluginId: "library";
    } | {
        type: "LIBRARY_IMPORTED";
        count: number;
        errors?: string[] | undefined;
        pluginId: "library";
    } | {
        type: "LIBRARY_IMPORT_FAILED";
        errors: string[];
        pluginId: "library";
    } | {
        type: "LIBRARY_EXPORTED";
        filePath: string;
        itemCount: number;
        pluginId: "library";
    } | {
        type: "LIBRARY_EXPORT_FAILED";
        errors: string[];
        pluginId: "library";
    } | {
        type: "explorer.FILES_LISTED";
        data: DirectoryContent;
        pluginId: "code";
    } | {
        type: "explorer.FILE_CREATED";
        data: {
            path: string;
        };
        pluginId: "code";
    } | {
        type: "explorer.FILE_DELETED";
        data: {
            path: string;
        };
        pluginId: "code";
    } | {
        type: "explorer.FILE_RENAMED";
        data: {
            oldPath: string;
            newPath: string;
        };
        pluginId: "code";
    } | {
        type: "explorer.DIRECTORY_CREATED";
        data: {
            path: string;
        };
        pluginId: "code";
    } | {
        type: "explorer.FILE_INFO";
        data: FileInfo;
        pluginId: "code";
    } | {
        type: "explorer.FILE_CONTENT";
        data: FileContent;
        pluginId: "code";
    } | {
        type: "explorer.FILE_SAVED";
        data: {
            path: string;
        };
        pluginId: "code";
    } | {
        type: "explorer.CODE_ERROR";
        data: CodeSystemError;
        pluginId: "code";
    } | {
        type: "explorer.FILE_CHANGED_EXTERNALLY";
        data: FileChangeInfo;
        pluginId: "code";
    } | {
        type: "explorer.QUICK_OPEN_RESULTS";
        data: QuickOpenResult[];
        pluginId: "code";
    } | {
        type: "explorer.FILES_MOVED";
        data: {
            sourcePaths: string[];
            targetDir: string;
            movedPaths: string[];
        };
        pluginId: "code";
    } | {
        type: "search.RESULT";
        data: SearchResult;
        pluginId: "code";
    } | {
        type: "search.PROGRESS";
        data: SearchProgress;
        pluginId: "code";
    } | {
        type: "search.COMPLETE";
        data: {
            results: SearchResult[];
            totalMatches: number;
        };
        pluginId: "code";
    } | {
        type: "search.ERROR";
        data: {
            message: string;
        };
        pluginId: "code";
    } | {
        type: "commit.STATUS_RECEIVED";
        data: {
            files: GitStatusFile[];
            branch: string;
            hasUpstream: boolean;
            commitsAhead: number;
            commitsBehind: number;
        };
        pluginId: "code";
    } | {
        type: "commit.DIFF_RECEIVED";
        data: GitDiff;
        pluginId: "code";
    } | {
        type: "commit.FILES_STAGED";
        data: {
            paths: string[];
        };
        pluginId: "code";
    } | {
        type: "commit.FILES_UNSTAGED";
        data: {
            paths: string[];
        };
        pluginId: "code";
    } | {
        type: "commit.COMMIT_SUCCESS";
        data: {
            message: string;
        };
        pluginId: "code";
    } | {
        type: "commit.FILE_REVERTED";
        data: {
            path: string;
        };
        pluginId: "code";
    } | {
        type: "commit.FILES_REVERTED";
        data: {
            paths: string[];
        };
        pluginId: "code";
    } | {
        type: "commit.ERROR_RECEIVED";
        data: {
            message: string;
        };
        pluginId: "code";
    } | {
        type: "commit.BRANCH_RETRIEVED";
        data: {
            branch: string;
        };
        pluginId: "code";
    } | {
        type: "commit.BRANCHES_RECEIVED";
        data: {
            branches: string[];
        };
        pluginId: "code";
    } | {
        type: "commit.BRANCH_CHECKOUT_SUCCESS";
        data: {
            branchName: string;
        };
        pluginId: "code";
    } | {
        type: "commit.BRANCH_PUSHED";
        data: {
            branchName: string;
        };
        pluginId: "code";
    } | {
        type: "commit.BRANCH_PULLED";
        data: {
            branchName: string;
        };
        pluginId: "code";
    } | {
        type: "commit.GENERATING_MESSAGE";
        pluginId: "code";
    } | {
        type: "commit.MESSAGE_GENERATED";
        data: {
            message: string;
        };
        pluginId: "code";
    } | {
        type: "commit.STASH_LIST_RECEIVED";
        data: {
            stashes: StashEntry[];
        };
        pluginId: "code";
    } | {
        type: "commit.STASH_SUCCESS";
        data: {
            message: string;
        };
        pluginId: "code";
    } | {
        type: "pr.BASE_BRANCH_RECEIVED";
        data: {
            branch: string;
        };
        pluginId: "code";
    } | {
        type: "pr.BRANCH_DIFF_RECEIVED";
        data: {
            files: GitStatusFile[];
            baseBranch: string;
            headBranch?: string;
        };
        pluginId: "code";
    } | {
        type: "pr.FILE_DIFF_RECEIVED";
        data: GitDiff & {
            baseBranch: string;
            headBranch?: string;
        };
        pluginId: "code";
    } | {
        type: "pr.ERROR";
        message: string;
        pluginId: "code";
    } | {
        type: "pr.STATUS_CHANGED";
        data: {
            timestamp: Date;
        };
        pluginId: "code";
    } | {
        type: "pr.OPEN_PRS_RECEIVED";
        data: {
            prs: GhPullRequest[];
        };
        pluginId: "code";
    } | {
        type: "pr.PR_DETAILS_RECEIVED";
        data: {
            pr: GhPullRequest;
            comments: GhPRComment[];
            requestId: number;
        };
        pluginId: "code";
    } | {
        type: "pr.PR_CREATED";
        data: {
            pr: GhPullRequest;
        };
        pluginId: "code";
    } | {
        type: "pr.PR_MERGED";
        data: {
            number: number;
        };
        pluginId: "code";
    } | {
        type: "pr.PR_CLOSED";
        data: {
            number: number;
        };
        pluginId: "code";
    } | {
        type: "pr.PR_DRAFT_TOGGLED";
        data: {
            number: number;
            isDraft: boolean;
        };
        pluginId: "code";
    } | {
        type: "pr.BRANCH_PR_CHECKED";
        data: {
            pr: GhPullRequest | null;
        };
        pluginId: "code";
    } | {
        type: "pr.GH_AUTH_CHECKED";
        data: {
            available: boolean;
            prAccess: boolean;
            activeToken: ActiveTokenInfo | null;
        };
        pluginId: "code";
    } | {
        type: "pr.AUTOFILL_RECEIVED";
        data: {
            title: string;
            body: string;
        };
        pluginId: "code";
    } | {
        type: "pr.SMART_BASE_BRANCH_RECEIVED";
        data: {
            branch: string;
        };
        pluginId: "code";
    } | {
        type: "pr.BRANCH_DELETED";
        data: {
            branch: string;
        };
        pluginId: "code";
    } | {
        type: "pr.PR_UPDATED";
        data: {
            number: number;
            title?: string;
            body?: string;
            base?: string;
        };
        pluginId: "code";
    } | {
        type: "pr.COMMENT_CREATED";
        data: {
            number: number;
        };
        pluginId: "code";
    } | {
        type: "pr.COMMENT_EDITED";
        data: {
            commentId: number;
        };
        pluginId: "code";
    } | {
        type: "pr.COMMENT_DELETED";
        data: {
            commentId: number;
        };
        pluginId: "code";
    } | {
        type: "pr.COMMENTS_RECEIVED";
        data: {
            number: number;
            comments: GhPRComment[];
        };
        pluginId: "code";
    } | {
        type: "pr.REVIEW_THREADS_RECEIVED";
        data: {
            threads: GhReviewThread[];
        };
        pluginId: "code";
    } | {
        type: "pr.THREAD_REPLIED";
        data: {
            prNumber: number;
        };
        pluginId: "code";
    } | {
        type: "pr.THREAD_RESOLVED";
        data: {
            threadId: string;
        };
        pluginId: "code";
    } | {
        type: "pr.THREAD_UNRESOLVED";
        data: {
            threadId: string;
        };
        pluginId: "code";
    } | {
        type: "pr.REVIEW_COMMENT_EDITED";
        data: {
            commentId: number;
        };
        pluginId: "code";
    } | {
        type: "pr.REVIEW_COMMENT_DELETED";
        data: {
            commentId: number;
        };
        pluginId: "code";
    } | {
        type: "terminal.CREATED";
        data: TerminalInfo;
        pluginId: "code";
    } | {
        type: "terminal.OUTPUT";
        data: {
            terminalId: string;
            data: string;
        };
        pluginId: "code";
    } | {
        type: "terminal.INITIAL_OUTPUT";
        data: {
            terminalId: string;
            data: string;
        };
        pluginId: "code";
    } | {
        type: "terminal.CLOSED";
        data: {
            terminalId: string;
        };
        pluginId: "code";
    } | {
        type: "terminal.RENAMED";
        data: {
            terminalId: string;
            customTitle: string;
        };
        pluginId: "code";
    } | {
        type: "terminal.CWD_CHANGED";
        data: {
            terminalId: string;
            cwd: string;
            title?: string;
        };
        pluginId: "code";
    } | {
        type: "terminal.ERROR";
        data: {
            message: string;
            terminalId?: string;
        };
        pluginId: "code";
    } | {
        type: "terminal.TERMINALS_LISTED";
        data: TerminalInfo[];
        pluginId: "code";
    } | {
        type: "terminal.TERMINAL_TAB_OPENED";
        data: TerminalInfo;
        pluginId: "code";
    } | {
        type: "codeActions.ACTION_SELECTED";
        actionId: string;
        data: ActionEntity & {
            actionFnContent?: string;
        };
        pluginId: "code";
    } | {
        type: "codeActions.ACTION_UPDATED";
        action: ActionEntity;
        actionId: string;
        pluginId: "code";
    } | {
        type: "codeActions.CODE_ERROR";
        data: {
            message: string;
        };
        pluginId: "code";
    } | {
        type: "CODE_CONNECTED";
        data: CodeConnectedData;
        pluginId: "code";
    } | {
        type: "CODE_SETTINGS_UPDATED";
        settings: CodeSettings;
        pluginId: "code";
    } | {
        type: "NOTES_CONNECTED";
        data: NotesConnectedData;
        pluginId: "notes";
    } | {
        type: "NOTE_CREATED";
        note: NoteDTO;
        pluginId: "notes";
    } | {
        type: "NOTE_UPDATED";
        note: NoteDTO;
        pluginId: "notes";
    } | {
        type: "NOTE_DELETED";
        noteId: string;
        pluginId: "notes";
    } | {
        type: "NOTE_RESTORED";
        note: NoteDTO;
        pluginId: "notes";
    } | {
        type: "TRASHED_NOTES";
        notes: NoteDTO[];
        pluginId: "notes";
    } | {
        type: "NOTES_SEARCH_RESULTS";
        results: NoteDTO[];
        pluginId: "notes";
    } | {
        type: "NOTES_IMPORTED";
        count: number;
        errors?: string[] | undefined;
        pluginId: "notes";
    } | {
        type: "NOTES_IMPORT_FAILED";
        errors: string[];
        pluginId: "notes";
    } | {
        type: "NOTES_EXPORTED";
        filePath: string;
        itemCount: number;
        pluginId: "notes";
    } | {
        type: "NOTES_EXPORT_FAILED";
        errors: string[];
        pluginId: "notes";
    };
};

type OutgoingSystemEvents = typeof events.outgoing;
type IncomingSystemEvents = EventsFromSchemas<typeof events.incoming>;

interface FlowEntity extends BaseEntity {
    entityType: EARS.Entity.Flow;
    shortCode: string;
    label: string;
    description?: string;
    flowType: 'workflow' | 'integration';
    createdAt: number;
    /** SHA256 hash of the DSL source at last seed. Absent on user-created flows. */
    sourceHash?: string;
}
interface NodeBase extends BaseEntity {
    entityType: EARS.Entity.Node;
    /** discriminator */
    nodeType: NodeKind;
    label: string;
    description?: string;
    color?: string;
    /** When true, completing this node will trigger parent flow completion */
    final?: boolean;
}
interface QueryNode extends NodeBase {
    nodeType: 'query';
    prompt: string;
    resultKey?: string;
}
interface CreateNode extends NodeBase {
    nodeType: 'create';
    entityTypeTarget: EARS.Entity;
    entityId?: string;
    inferLabel?: boolean;
}
interface UpdateNode extends NodeBase {
    nodeType: 'update';
    entityId: string;
    onMissing?: 'fail' | 'ignore' | 'create';
}
declare enum BinaryOperator {
    EQUALS = "equals",
    NOT_EQUALS = "not_equals",
    GREATER_THAN = "greater_than",
    LESS_THAN = "less_than",
    GREATER_THAN_OR_EQUALS = "greater_than_or_equals",
    LESS_THAN_OR_EQUALS = "less_than_or_equals",
    CONTAINS = "contains",
    STARTS_WITH = "starts_with",
    ENDS_WITH = "ends_with",
    MATCHES = "matches",
    IS_EMPTY = "is_empty",
    IS_NULL = "is_null"
}
type Predicate = {
    key: string;
    operator: BinaryOperator;
    value?: any;
} | ((context: any) => boolean);
type Condition = {
    predicate?: Predicate;
    label?: string;
    mode?: 'expression' | 'code';
    code?: string;
};
interface SwitchNode extends NodeBase {
    nodeType: 'switch';
    conditions: Array<Condition>;
    elseLabel?: string;
}
interface FireNode extends NodeBase {
    nodeType: 'fire';
    eventType: string;
    payload?: unknown;
    scope?: 'local' | 'global';
}
interface ListenerNode extends NodeBase {
    nodeType: 'listener';
    scope: 'global' | 'local' | 'entry';
    eventType: string;
    debounceMs?: number;
}
interface TransformNode extends NodeBase {
    nodeType: 'transform';
    script: string;
    outputType?: 'json' | 'text' | 'custom';
}
interface FlowNode extends NodeBase {
    nodeType: 'flow';
    flowRef: string;
    propagateCtx?: boolean;
    fieldMappings?: Array<{
        target: string;
        source: string;
        default?: any;
    }>;
}
interface KeepAliveNode extends NodeBase {
    nodeType: 'keep_alive';
}
interface KillNode extends NodeBase {
    nodeType: 'kill';
}
interface LLMNode extends NodeBase {
    nodeType: 'llm';
    prompt?: string;
    promptTemplateId?: string;
    fieldMappings?: Array<{
        target: string;
        source: string;
        default?: any;
    }>;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
}
interface ActionNode extends NodeBase {
    nodeType: 'action';
    mode?: 'template' | 'code';
    actionId?: string;
    actionFn?: string;
    params?: Record<string, any>;
    fieldMappings?: Array<{
        target: string;
        source: string;
        default?: any;
    }>;
}
type NodeEntity = QueryNode | CreateNode | UpdateNode | ActionNode | SwitchNode | FireNode | ListenerNode | TransformNode | FlowNode | KeepAliveNode | KillNode | LLMNode;
/** Literal union of all nodeType strings (keeps Base clean) */
type NodeKind = NodeEntity['nodeType'];
type NodeCreateInput = Partial<NodeEntity> & {
    actionId?: string;
    promptTemplateId?: string;
};
type EdgeEntity = {
    id: EARS.EntityId;
    kind: EARS.RelKind;
    source: EARS.EntityId;
    target: EARS.EntityId;
    sourceHandle?: string;
    targetHandle?: string;
    info?: {
        [key: string]: any;
    };
};
interface FlowsConnectedData {
    selectedFlowId: EARS.EntityId;
    graph: {
        nodes: NodeEntity[];
        edges: EdgeEntity[];
    };
    flows: Partial<FlowEntity>[];
    rootFlow?: Partial<FlowEntity>;
    models: ModelCatalogEntry[];
    prompts: PromptEntity[];
    actions: ActionEntity[];
    settings?: any;
}
interface ModelCatalogEntry {
    id: string;
    name: string;
    provider: string;
    description?: string;
    contextWindow: number;
    maxOutput?: number;
    costPer1kInput?: number;
    costPer1kOutput?: number;
    capabilities?: string[];
}
interface FlowExtendedData {
    nodes: NodeEntity[];
    edges: EdgeEntity[];
}

/**
 * Setup Pack Preview — reads compiled artifacts from a directory and
 * reports the top-level items available for selective import.
 */
type SetupPackType = 'actions' | 'prompts' | 'flows' | 'library' | 'notes' | 'settings';
type SetupPackItemKind = 'collection' | 'document' | 'tasklist' | 'task';
interface SetupPackPreviewItem {
    key: string;
    description?: string;
    kind?: SetupPackItemKind;
    childCount?: number;
}
interface SetupPackPreview {
    directory: string;
    actions: SetupPackPreviewItem[];
    prompts: SetupPackPreviewItem[];
    flows: SetupPackPreviewItem[];
    library: SetupPackPreviewItem[];
    notes: SetupPackPreviewItem[];
    settings: SetupPackPreviewItem[];
    missing: SetupPackType[];
}

interface SafeLinkOptions {
    /** Additional info to store with the relation */
    info?: unknown;
    /** If true, creates bidirectional edges automatically */
    symmetric?: boolean;
    /** If specified, prevents cycles within this group of relation kinds */
    acyclicGroup?: readonly EARS.RelKind[];
}
declare function tx(typeOrId: EARS.Entity | EARS.EntityId, useProvidedId?: boolean): {
    readonly put: (k: EARS.AttrKind | string, v: unknown, allowMultiple?: boolean) => /*elided*/ any;
    readonly add: (k: EARS.AttrKind | string, v: unknown) => /*elided*/ any;
    readonly batchPut: (attrs: Record<string, unknown>) => /*elided*/ any;
    readonly merge: (k: EARS.AttrKind, v: unknown, i?: number) => /*elided*/ any;
    readonly drop: (k: EARS.AttrKind, i?: number) => /*elided*/ any;
    readonly dropIf: (k: EARS.AttrKind, c: unknown) => /*elided*/ any;
    readonly update: (k: EARS.AttrKind | string, v: unknown) => /*elided*/ any;
    readonly updateBatch: (attrs: Record<string, unknown>) => /*elided*/ any;
    readonly grant: (r: string) => /*elided*/ any;
    readonly revoke: (r: string) => /*elided*/ any;
    readonly ensure: (r: string, scope?: readonly EARS.EntityId[]) => /*elided*/ any;
    readonly link: (k: EARS.RelKind, t: EARS.EntityId, info?: unknown) => /*elided*/ any;
    readonly relPatch: (rel: EARS.EntityId, u: {
        sourceEntity?: EARS.EntityId;
        targetEntity?: EARS.EntityId;
        info?: unknown;
    }) => /*elided*/ any;
    readonly unlink: (rel: EARS.EntityId) => /*elided*/ any;
    readonly linkOne: (k: EARS.RelKind, t: EARS.EntityId, info?: unknown) => /*elided*/ any;
    readonly safeLink: (k: EARS.RelKind, t: EARS.EntityId, options?: SafeLinkOptions) => /*elided*/ any;
    readonly patchLink: (k: EARS.RelKind, t: EARS.EntityId, u: {
        newTarget: EARS.EntityId;
        newInfo?: unknown;
    }) => /*elided*/ any;
    readonly unlinkIf: (k: EARS.RelKind, t?: EARS.EntityId) => /*elided*/ any;
    readonly unlinkWhere: (c?: {
        kind?: EARS.RelKind;
        target?: EARS.EntityId;
    }) => /*elided*/ any;
    readonly define: (def: {
        attributes?: Record<string, unknown>;
        links?: [EARS.RelKind, EARS.EntityId] | Array<[EARS.RelKind, EARS.EntityId]>;
        roles?: string | string[];
    }) => /*elided*/ any;
    readonly destroy: (skipPersistence?: boolean) => never;
    readonly id: () => `Agent-${string}` | `Brain-${string}` | `Message-${string}` | `Thread-${string}` | `Relation-${string}` | `Artifact-${string}` | `Flow-${string}` | `Node-${string}` | `TNode-${string}` | `Prompt-${string}` | `Action-${string}` | `Document-${string}` | `Collection-${string}` | `SearchIndex-${string}` | `IndexedDoc-${string}` | `Terminal-${string}` | `Directory-${string}` | `Settings-${string}` | `FAQ-${string}` | `Secret-${string}` | `Note-${string}`;
};

type SETTINGS_SCOPE = 'general' | 'plugin' | 'internal';
interface SettingsData {
    general: GeneralSettings;
    plugins: PluginSettings;
    internal: InternalSettings;
    assistant: AssistantSettings;
}
interface GeneralSettings {
    personal: PersonalInfo;
    secrets: Secrets;
    application: AppSettings;
    projects: Project[];
}
interface Address {
    street: string;
    street2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
}
interface PersonalInfo {
    name?: string;
    phoneNumber?: string;
    address?: string | Address;
}
interface Secrets {
    google?: string | null;
    anthropic?: string | null;
    openai?: string | null;
    groq?: string | null;
    mistral?: string | null;
    cohere?: string | null;
    custom?: Record<string, string>;
    required: string[];
    cliPaths?: Record<string, string>;
}
interface KeyboardShortcut {
    key: string;
    modifiers: string[];
    global?: boolean;
}
interface CustomHotkey extends KeyboardShortcut {
    id: string;
    eventName: string;
}
interface ApplicationHotkeys {
    switchPluginUp?: KeyboardShortcut;
    switchPluginDown?: KeyboardShortcut;
    toggleInspectionPanel?: KeyboardShortcut;
    custom?: CustomHotkey[];
}
interface AppSettings {
    hotkeys: ApplicationHotkeys;
}
interface Project {
    name: string;
    directories: string[];
    color: string;
}
interface PluginVisibilitySettings {
    [pluginId: string]: boolean;
}
interface Category {
    name: string;
    color: string;
}
interface ThreadStatusOption {
    label: string;
    color: string;
}
interface ThreadTagOption {
    name: string;
    color?: string;
}
interface ChatStateConfig {
    id: string;
    label: string;
    color: string;
    busy: boolean;
}
interface ThreadsSettings {
    statuses: ThreadStatusOption[];
    tags: ThreadTagOption[];
    chatStates: ChatStateConfig[];
    showOnlyRootThreads: boolean;
    clickToChat: boolean;
    recentThreadsLimit: number;
    recentThreadsSortOrder: 'created' | 'visited' | 'message';
    recordingLimitMinutes: number;
    chat?: AgentSettings;
}
interface NotesSettings {
    tasklistPanelPosition: 'left' | 'right';
}
interface LogsSettings {
    maxLogs: number;
    excludedSources: string[];
    showAppEvents?: boolean;
}
interface PluginSettings {
    _meta?: {
        visibility?: PluginVisibilitySettings;
        lastActivePlugin?: string;
    };
    [pluginId: string]: any;
}
interface InternalSettings {
    tourComplete: boolean;
    hasOnboarded: boolean;
    lastInteractionTimestamp: number | null;
    version: string;
    seedHash: string | null;
}
interface AssistantSettings {
    name: string;
    birthdate: string | null;
}
interface FAQItem {
    id: string;
    question: string;
    answer: string;
    category?: string;
    order?: number;
}

interface FileInfo {
    name: string;
    path: string;
    type: 'file' | 'directory';
    size?: number;
    modifiedAt?: Date;
    extension?: string;
}
interface DirectoryContent {
    path: string;
    files: FileInfo[];
}
interface FileContent {
    path: string;
    content: string;
    encoding: string;
    size?: number;
    isBinary?: boolean;
}
interface CodeSystemError {
    code: 'NOT_FOUND' | 'PERMISSION_DENIED' | 'INVALID_PATH' | 'IO_ERROR' | 'FILE_TOO_LARGE' | 'SEARCH_ERROR';
    message: string;
    path?: string;
}
interface SearchMatch {
    line: number;
    column: number;
    lineText: string;
    matchStart: number;
    matchEnd: number;
}
interface SearchResult {
    path: string;
    matches: SearchMatch[];
    fileSize?: number;
}
interface SearchProgress {
    filesSearched: number;
    totalFiles: number;
    currentFile?: string;
}
interface GitStatusFile {
    path: string;
    status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'copied' | 'typechange' | 'unmerged';
    staged: boolean;
    originalPath?: string;
    score?: number;
}
interface GitDiff {
    path: string;
    diff: string;
    staged: boolean;
    originalContent?: string;
    modifiedContent?: string;
    isImage?: boolean;
}
interface StashEntry {
    index: number;
    ref: string;
    message: string;
    date: string;
}
interface GhPullRequest {
    number: number;
    title: string;
    body: string;
    headRefName: string;
    baseRefName: string;
    state: 'OPEN' | 'CLOSED' | 'MERGED';
    url: string;
    isDraft: boolean;
    author: {
        login: string;
    };
    createdAt: string;
    updatedAt: string;
    commits?: {
        oid: string;
        messageHeadline: string;
        committedDate: string;
    }[];
    mergeable?: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';
    mergeStateStatus?: 'BEHIND' | 'BLOCKED' | 'CLEAN' | 'DIRTY' | 'DRAFT' | 'HAS_HOOKS' | 'UNKNOWN' | 'UNSTABLE';
    reviewDecision?: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;
    statusCheckRollup?: Array<{
        name?: string;
        status?: string;
        conclusion?: string;
        state?: string;
    }>;
}
interface GhPRComment {
    id: string;
    body: string;
    author: {
        login: string;
    };
    createdAt: string;
    url: string;
    viewerDidAuthor: boolean;
}
interface GhReviewThread {
    id: string;
    isResolved: boolean;
    isOutdated: boolean;
    path: string;
    line: number | null;
    comments: GhReviewComment[];
}
interface GhReviewComment {
    id: string;
    databaseId: number;
    body: string;
    author: {
        login: string;
    };
    createdAt: string;
    viewerDidAuthor: boolean;
}
interface TerminalInfo {
    id: EARS.EntityId;
    title: string;
    customTitle?: string;
    pid: number;
    shell?: string;
    cwd: string;
    active: boolean;
    cols: number;
    rows: number;
}
interface QuickOpenResult {
    path: string;
    relativePath: string;
    name: string;
    type: 'file' | 'directory';
    extension?: string;
    score?: number;
}
interface TerminalScript {
    id: string;
    label: string;
    command: string;
}
interface CodeSettings {
    hotkeys: {
        openTerminal?: KeyboardShortcut | null;
        openTerminalTab?: KeyboardShortcut | null;
        navigatePrevPanel?: KeyboardShortcut | null;
        navigateNextPanel?: KeyboardShortcut | null;
        focusSearch?: KeyboardShortcut | null;
        [key: string]: KeyboardShortcut | null | undefined;
    };
    restoreTerminals?: boolean;
    defaultBaseDirectory?: string | null;
    lastDirectoryOpened?: string | null;
    enableShellIntegration?: boolean;
    confirmTerminalClose?: boolean;
    closeTerminalOnTabClose?: boolean;
    maxTerminals?: number;
    mdEditorDefault?: boolean;
    enablePreview?: boolean;
    autoFetchRemote?: boolean;
    autoFetchIntervalSeconds?: number;
    terminalScripts?: TerminalScript[];
}
type CodeConnectedData = {
    baseDirectory: string | null;
    settings?: CodeSettings;
};

/**
 * High-level streaming conversation API.
 *
 * `query()` spawns `claude -p` in stream-json mode, drives the control loop,
 * and exposes two things to the caller:
 *
 *   - an async iterable of parsed stream events (everything except the
 *     control-request traffic, which is handled internally)
 *   - a `result` promise that resolves with the final normalised result
 *
 * Two modes, picked by whether an initial `prompt` is provided:
 *
 *  1. **Single-turn (default)**: pass `{ prompt }`. The wrapper writes the
 *     turn, immediately EOFs stdin, and the CLI runs once + exits. Drain
 *     `handle.events` in a `for await` and then `await handle.result`.
 *     No cleanup needed — the child unwinds itself.
 *
 *  2. **Multi-turn (opt-in)**: pass `{ keepStdinOpen: true, prompt }` OR
 *     pass no prompt. The wrapper leaves stdin open; the caller drives
 *     follow-up turns via `handle.send(text)` and MUST call `handle.close()`
 *     when done. Forgetting to close hangs the child until process exit.
 *
 * The implementation uses a fan-out: the raw NDJSON stream from the child is
 * consumed once by an internal pump that (a) routes control requests to the
 * control router and (b) pushes everything else into an async queue the
 * public iterable reads from. This is the only way to share a single Readable
 * between "internal logic" and "caller" without races.
 */

interface QueryHandle {
    /** Resolves with the session id as soon as the CLI emits `system/init`. */
    readonly sessionId: Promise<string>;
    /** Every non-control stream line, in order, until the child exits. */
    readonly events: AsyncIterable<StreamLine>;
    /** Final normalised result. Rejects on error result or non-zero exit. */
    readonly result: Promise<QueryResult>;
    /** Send another user turn. No-op after close(). */
    send(text: string | UserInputMessage): void;
    /**
     * Send a control_response back to the CLI for a surfaced control_request.
     * Only meaningful when `surfaceControlRequests: true` — in callback mode
     * the router handles responses internally.
     */
    respond(requestId: string, response: {
        behavior: 'allow' | 'deny';
        message?: string;
        updatedInput?: unknown;
    }): void;
    /** Ask the CLI to cancel the current turn (interrupt control request). */
    interrupt(): void;
    /** Close stdin and wait for the child to exit. */
    close(): Promise<void>;
    /** Force-terminate the child process. */
    kill(): void;
}

/**
 * Low-level process primitives for the Claude Code wrapper.
 *
 * Two flavours, because the CLI has two very different execution modes:
 *
 * 1. `execOnce` — one-shot subcommands (`claude mcp list`, `claude auth status`,
 *    …). Resolves when the child exits. Uses a bounded timeout. Translates
 *    spawn/exit errors into typed `ClaudeCodeError` subclasses.
 *
 * 2. `spawnStream` — long-lived `claude -p --input-format stream-json
 *    --output-format stream-json` for interactive conversations. Returns a
 *    handle the caller uses to push user turns (stdin) and iterate events
 *    (stdout) until the child exits. Abort via `AbortSignal`.
 *
 * Neither primitive knows anything about the wire protocol — they just move
 * bytes. The stream-json schema lives in `types.ts` and parsing in `ndjson.ts`.
 */

interface ExecOnceOptions {
    cwd?: string;
    /**
     * Override the env passed to the child. Defaults to a copy of `process.env`
     * with `ANTHROPIC_API_KEY` removed so the CLI uses its own stored auth
     * (`claude auth login`) instead of an env-var key meant for the server's
     * LLM client. Pass an explicit object if you want no scrubbing — the
     * helper assumes you know what you're doing and does not post-process it.
     */
    env?: NodeJS.ProcessEnv;
    /** Bytes piped to stdin. Pass `undefined` to leave stdin closed. */
    input?: string;
    /** Milliseconds until the child is SIGKILL'd and a ClaudeTimeoutError thrown. */
    timeoutMs?: number;
    signal?: AbortSignal;
    /** Override the resolved CLI path (primarily for testing). */
    cliPath?: string;
}
interface ExecOnceResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}

interface SessionInfo {
    id: string;
    file: string;
    cwd?: string;
    title?: string;
    tags?: string[];
    modifiedAt: Date;
    size: number;
    firstMessageAt?: Date;
    lastMessageAt?: Date;
}
interface SessionTranscriptEntry {
    type?: string;
    [key: string]: unknown;
}
interface SessionListOptions {
    /** Working directory whose sessions to list. Defaults to `process.cwd()`. */
    cwd?: string;
    limit?: number;
    offset?: number;
}
interface SessionViewOptions {
    cwd?: string;
    limit?: number;
    offset?: number;
}

/**
 * `claude auth` — login, logout, status.
 *
 * `login` is interactive by nature (opens a browser for Claude.ai, prompts
 * for SSO, etc.); we expose it anyway for completeness but callers should
 * usually delegate to the CLI UI rather than call this programmatically.
 */

/** Shape of `claude auth status --json` — passthrough, CLI may add fields. */
interface AuthStatus {
    authenticated?: boolean;
    source?: 'user' | 'project' | 'org' | 'temporary' | 'oauth';
    account?: Record<string, unknown>;
    [key: string]: unknown;
}

interface CliServiceType {
    git: {
        commit(message: string): Promise<void>;
        getStatus(): Promise<GitStatusFile[]>;
        getCurrentBranch(): Promise<string>;
        getWorkingDir(): string;
        /**
         * Return the unified diff for the working copy vs HEAD. Pass a list of
         * paths to restrict to specific files; omit to get all changes. Used by
         * the Claude Code chat action to assemble a `diff` artifact after file-
         * mutating tool calls (Write/Edit/NotebookEdit).
         */
        getDiff(paths?: string[]): Promise<string>;
    };
    gh: {
        getPRForBranch(branch?: string): Promise<GhPullRequest | null>;
        getPRDetails(number: number, repo?: {
            owner: string;
            name: string;
        }): Promise<GhPullRequest & {
            comments: GhPRComment[];
        }>;
        getReviewThreads(number: number, repo?: {
            owner: string;
            name: string;
        }): Promise<GhReviewThread[]>;
    };
    /**
     * Claude Code wrapper. Highlights only — the full surface (sessions, mcp,
     * plugins, skills, …) is available via `import { claudeCode } from
     * '@/services/claude-code'`.
     */
    claudeCode: {
        query(opts: Omit<QueryOptions, 'cwd'> & {
            cwd?: string;
        }): Promise<QueryHandle>;
        version(): Promise<string>;
        authStatus(): Promise<AuthStatus>;
        listSessions(opts?: SessionListOptions): Promise<SessionInfo[]>;
        /** List sessions across ALL project directories (not just the configured cwd). */
        listAllSessions(opts?: {
            limit?: number;
        }): Promise<SessionInfo[]>;
        /**
         * Parse a session's JSONL transcript into an in-memory array of entries.
         * Used by `CC: Handle Rewind` to retroactively backfill `context.cliUuid`
         * on pre-existing user messages from Claude's own session file.
         * `cwd` defaults to the configured project directory.
         */
        viewSession(id: string, opts?: Omit<SessionViewOptions, 'cwd'> & {
            cwd?: string;
        }): Promise<SessionTranscriptEntry[]>;
        /** Parse a JSONL file directly by path (bypasses cwd→bucket lookup). */
        viewSessionByFile(filePath: string, opts?: {
            limit?: number;
            offset?: number;
        }): Promise<SessionTranscriptEntry[]>;
        getWorkingDir(): string;
        /** Store a live query handle so other actions can write control_responses. */
        storeHandle(key: string, handle: QueryHandle): void;
        /** Retrieve a stored query handle by key (typically threadId). */
        getHandle(key: string): QueryHandle | undefined;
        /** Clear a stored handle (call on query end to avoid leaking references). */
        clearHandle(key: string): void;
        /**
         * Low-level one-shot CLI invocation. Used by `CC: Handle Revert` to run
         * `claude --resume <sid> --rewind-files <uuid>` for file-rewind on revert.
         * `cwd` defaults to the configured project directory.
         */
        exec(args: readonly string[], opts?: Omit<ExecOnceOptions, 'cwd'> & {
            cwd?: string;
        }): Promise<ExecOnceResult>;
        /** Read the CLI's user-scope settings.json (~/.claude/settings.json). */
        readSettings(): Promise<Record<string, any>>;
        /** Write the CLI's user-scope settings.json (~/.claude/settings.json). */
        writeSettings(settings: Record<string, any>): Promise<void>;
        /** List skill files from user (~/.claude/skills/) and project (.claude/skills/) dirs. */
        listSkills(): Promise<Array<{
            name: string;
            scope: string;
            path: string;
        }>>;
        /** List memory/CLAUDE.md files from known locations. */
        listMemoryFiles(): Promise<Array<{
            name: string;
            scope: string;
            path: string;
        }>>;
    };
}

interface TextStreamOptions {
    chunkSize?: number;
    delayMs?: number;
}
declare class TextStreamService {
    streamText(text: string, options?: TextStreamOptions): AsyncGenerator<string, void, unknown>;
    streamTextByChars(text: string, options?: TextStreamOptions): AsyncGenerator<string, void, unknown>;
}

/**
 * Settings Service
 *
 * Provides convenient access to application settings with type-safe methods
 * for common operations on general, plugin, and internal settings.
 */

declare class SettingsService {
    /**
     * Get all settings including general, plugins, and internal
     */
    getAll(): SettingsData;
    /**
     * Get settings for a specific plugin
     * @param pluginId - The plugin identifier
     */
    getPluginSettings<T = any>(pluginId: string): T;
    /**
     * Get all general settings
     */
    getGeneralSettings(): SettingsData['general'];
    /**
     * Get internal system settings
     */
    getInternalSettings(): SettingsData['internal'];
    /**
     * Update a plugin setting
     * @param pluginId - The plugin identifier
     * @param path - Path to the setting property (e.g., ['hotkeys', 'openTerminal'])
     * @param value - The new value
     */
    updatePluginSetting(pluginId: string, path: string[], value: any): void;
    /**
     * Update a general setting
     * @param category - The general settings category (e.g., 'hotkeys', 'secrets')
     * @param path - Path to the setting property
     * @param value - The new value
     */
    updateGeneralSetting(category: string, path: string[], value: any): void;
    /**
     * Update an internal setting
     * @param path - Path to the setting property
     * @param value - The new value
     */
    updateInternalSetting(path: string[], value: any): void;
    /**
     * Reset all settings to their defaults
     */
    resetToDefaults(): void;
    /**
     * Check if a specific plugin has settings
     * @param pluginId - The plugin identifier
     */
    hasPluginSettings(pluginId: string): boolean;
    /**
     * Get a specific setting value by path
     * @param type - The setting type ('general', 'plugin', 'internal')
     * @param label - The setting label/category
     * @param path - Path to the specific value
     */
    getSettingValue(type: SETTINGS_SCOPE, label: string, path: string[]): any;
}

interface TerminalEntity {
    id: EARS.EntityId;
    entityType: EARS.Entity.Terminal;
    title: string;
    customTitle?: string;
    pid: number;
    shell: string;
    cwd: string;
    active: boolean;
    cols: number;
    rows: number;
    createdAt: number;
    updatedAt: number;
    closedAt?: number;
}
interface StartupData {
    terminals: TerminalInfo[];
}

/**
 * Flow DSL Compiler
 *
 * Transforms track-based DSL format into EARS database format.
 * Each track creates a listener node + sequential step nodes.
 */

type Relation = {
    source: string;
    kind: EARS.RelKind;
    target: string;
    info?: object;
};
interface CompiledRows {
    entity: object[];
    relation: Relation[];
    role: Array<{
        entityId: string;
        role: string;
    }>;
}

declare class LibraryService {
    get(id: EARS.EntityId): Promise<DocumentDTO | undefined>;
    getByCode(shortCode: string): Promise<DocumentDTO | undefined>;
    getByName(name: string): Promise<DocumentDTO | undefined>;
    getByPath(collectionPath: string[], name: string): Promise<DocumentDTO | undefined>;
    getText(id: EARS.EntityId): Promise<string | undefined>;
    list(folderId?: EARS.EntityId): Promise<LibraryItem[]>;
    create(params: {
        name: string;
        content: string | ContentSection[];
        tags?: string[];
        parentId?: string;
    }): Promise<DocumentDTO>;
    update(params: {
        id: string;
        name?: string;
        content?: string | ContentSection[];
        tags?: string[];
    }): Promise<DocumentDTO>;
    createFolder(params: {
        name: string;
        parentId?: string;
    }): Promise<CollectionDTO>;
    remove(ids: string[]): Promise<void>;
    move(ids: string[], targetFolderId: string | null): Promise<void>;
    rename(id: string, newName: string): Promise<void>;
}

declare class ActionService {
    getById(id: EARS.EntityId): ActionEntity | undefined;
    getByLabel(label: string): ActionEntity | undefined;
    getByCategory(category: string): ActionEntity[];
    executeAction(actionFn: string, params?: Record<string, any>): Promise<any>;
    getAndExecute(label: string, params?: Record<string, any>): Promise<any | undefined>;
}

declare class PromptService {
    getByLabel(label: string): PromptEntity | undefined;
    /**
     * Execute a template with prompt context for accessing other prompts
     * @param templateFn - The template function body
     * @param templateParams - Parameters to pass to the template
     */
    executeTemplate(templateFn: string, templateParams: Record<string, any>): string;
    /**
     * Get and execute a prompt by label
     * @param label - The prompt label
     * @param templateParams - Parameters to pass to the template
     */
    usePrompt(label: string, templateParams: Record<string, any>): string | undefined;
}

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

/**
 * Type-safe transaction helpers for common operations
 */
declare function prepareEntity<T extends {
    entityType: EARS.Entity;
}>(entityType: EARS.Entity, data: Partial<T>, defaults?: Partial<T>): Omit<T, 'id'>;
declare function createEntityWithDefaults<T extends {
    entityType: EARS.Entity;
    shortCode?: string;
    label?: string;
}>(entityType: EARS.Entity, data: Partial<T>, prefix?: string, providedId?: EARS.EntityId): T & {
    id: EARS.EntityId;
};
declare function updateEntity(id: EARS.EntityId, updates: Record<string, any>, skipTimestamp?: boolean): void;
declare function createRelation(sourceId: EARS.EntityId, relationType: EARS.RelKind, targetId: EARS.EntityId): void;
declare function removeRelation(sourceId: EARS.EntityId, relationType: EARS.RelKind, targetId?: EARS.EntityId): void;
declare function grantRole(entityId: EARS.EntityId, role: string): void;
declare function revokeRole(entityId: EARS.EntityId, role: string): void;

type MaybeArr<T> = T | readonly T[];

declare const qx: (seed?: EARS.EntityId | EARS.Entity | readonly EARS.Entity[] | readonly EARS.EntityId[]) => {
    readonly ofType: (t: EARS.Entity) => /*elided*/ any;
    readonly inIds: (sub: readonly EARS.EntityId[]) => /*elided*/ any;
    readonly where: (k: EARS.AttrKind | string, v?: unknown) => /*elided*/ any;
    readonly withRole: (r: string) => /*elided*/ any;
    readonly relatedTo: (target: EARS.EntityId) => /*elided*/ any;
    readonly related: (kind: string, other: EARS.EntityId, asSrc?: boolean) => /*elided*/ any;
    readonly linksTo: (relKinds: MaybeArr<string>, tgtType?: MaybeArr<EARS.Entity>, asSrc?: boolean) => /*elided*/ any;
    readonly links: <K extends string>(relKinds: K | readonly K[], tgtType?: MaybeArr<EARS.Entity>, asSrc?: boolean) => Array<{
        relation: K;
        id: EARS.EntityId;
    }>;
    readonly edgeIds: (kinds?: string | readonly string[], asSrc?: boolean) => EARS.EntityId[];
    readonly pick: <A extends readonly string[]>(fields: A) => ({
        id: EARS.EntityId;
    } & { [K in A[number]]: unknown; })[];
    readonly pickOne: (f: readonly string[]) => any;
    readonly pickAll: () => ({
        id: EARS.EntityId;
    } & {
        [x: string]: unknown;
    })[];
    readonly linksPick: <K extends string, A extends readonly string[]>(relKinds: K | readonly K[], fields: A, tgtType?: MaybeArr<EARS.Entity>) => any[];
    readonly orderBy: (field: string, dir?: "asc" | "desc") => /*elided*/ any;
    readonly reverse: () => /*elided*/ any;
    readonly limit: (n: number) => /*elided*/ any;
    readonly page: (size: number, cursor?: string | null) => {
        readonly items: (`Agent-${string}` | `Brain-${string}` | `Message-${string}` | `Thread-${string}` | `Relation-${string}` | `Artifact-${string}` | `Flow-${string}` | `Node-${string}` | `TNode-${string}` | `Prompt-${string}` | `Action-${string}` | `Document-${string}` | `Collection-${string}` | `SearchIndex-${string}` | `IndexedDoc-${string}` | `Terminal-${string}` | `Directory-${string}` | `Settings-${string}` | `FAQ-${string}` | `Secret-${string}` | `Note-${string}`)[];
        readonly nextCursor: string | null;
    };
    readonly distinct: (field?: string) => /*elided*/ any;
    readonly groupBy: (field: string) => Map<unknown, /*elided*/ any>;
    readonly ids: () => (`Agent-${string}` | `Brain-${string}` | `Message-${string}` | `Thread-${string}` | `Relation-${string}` | `Artifact-${string}` | `Flow-${string}` | `Node-${string}` | `TNode-${string}` | `Prompt-${string}` | `Action-${string}` | `Document-${string}` | `Collection-${string}` | `SearchIndex-${string}` | `IndexedDoc-${string}` | `Terminal-${string}` | `Directory-${string}` | `Settings-${string}` | `FAQ-${string}` | `Secret-${string}` | `Note-${string}`)[];
    readonly id: () => `Agent-${string}` | `Brain-${string}` | `Message-${string}` | `Thread-${string}` | `Relation-${string}` | `Artifact-${string}` | `Flow-${string}` | `Node-${string}` | `TNode-${string}` | `Prompt-${string}` | `Action-${string}` | `Document-${string}` | `Collection-${string}` | `SearchIndex-${string}` | `IndexedDoc-${string}` | `Terminal-${string}` | `Directory-${string}` | `Settings-${string}` | `FAQ-${string}` | `Secret-${string}` | `Note-${string}`;
    readonly count: () => number;
    readonly first: () => `Agent-${string}` | `Brain-${string}` | `Message-${string}` | `Thread-${string}` | `Relation-${string}` | `Artifact-${string}` | `Flow-${string}` | `Node-${string}` | `TNode-${string}` | `Prompt-${string}` | `Action-${string}` | `Document-${string}` | `Collection-${string}` | `SearchIndex-${string}` | `IndexedDoc-${string}` | `Terminal-${string}` | `Directory-${string}` | `Settings-${string}` | `FAQ-${string}` | `Secret-${string}` | `Note-${string}`;
    readonly last: () => `Agent-${string}` | `Brain-${string}` | `Message-${string}` | `Thread-${string}` | `Relation-${string}` | `Artifact-${string}` | `Flow-${string}` | `Node-${string}` | `TNode-${string}` | `Prompt-${string}` | `Action-${string}` | `Document-${string}` | `Collection-${string}` | `SearchIndex-${string}` | `IndexedDoc-${string}` | `Terminal-${string}` | `Directory-${string}` | `Settings-${string}` | `FAQ-${string}` | `Secret-${string}` | `Note-${string}` | null;
    readonly exists: () => boolean;
    readonly map: <T>(fn: (i: EARS.EntityId) => T) => T[];
    readonly forEach: (fn: (i: EARS.EntityId) => void) => {
        readonly ofType: (t: EARS.Entity) => /*elided*/ any;
        readonly inIds: (sub: readonly EARS.EntityId[]) => /*elided*/ any;
        readonly where: (k: EARS.AttrKind | string, v?: unknown) => /*elided*/ any;
        readonly withRole: (r: string) => /*elided*/ any;
        readonly relatedTo: (target: EARS.EntityId) => /*elided*/ any;
        readonly related: (kind: string, other: EARS.EntityId, asSrc?: boolean) => /*elided*/ any;
        readonly linksTo: (relKinds: MaybeArr<string>, tgtType?: MaybeArr<EARS.Entity>, asSrc?: boolean) => /*elided*/ any;
        readonly links: <K extends string>(relKinds: K | readonly K[], tgtType?: MaybeArr<EARS.Entity>, asSrc?: boolean) => Array<{
            relation: K;
            id: EARS.EntityId;
        }>;
        readonly edgeIds: (kinds?: string | readonly string[], asSrc?: boolean) => EARS.EntityId[];
        readonly pick: <A extends readonly string[]>(fields: A) => ({
            id: EARS.EntityId;
        } & { [K in A[number]]: unknown; })[];
        readonly pickOne: (f: readonly string[]) => any;
        readonly pickAll: () => ({
            id: EARS.EntityId;
        } & {
            [x: string]: unknown;
        })[];
        readonly linksPick: <K extends string, A extends readonly string[]>(relKinds: K | readonly K[], fields: A, tgtType?: MaybeArr<EARS.Entity>) => any[];
        readonly orderBy: (field: string, dir?: "asc" | "desc") => /*elided*/ any;
        readonly reverse: () => /*elided*/ any;
        readonly limit: (n: number) => /*elided*/ any;
        readonly page: (size: number, cursor?: string | null) => {
            readonly items: (`Agent-${string}` | `Brain-${string}` | `Message-${string}` | `Thread-${string}` | `Relation-${string}` | `Artifact-${string}` | `Flow-${string}` | `Node-${string}` | `TNode-${string}` | `Prompt-${string}` | `Action-${string}` | `Document-${string}` | `Collection-${string}` | `SearchIndex-${string}` | `IndexedDoc-${string}` | `Terminal-${string}` | `Directory-${string}` | `Settings-${string}` | `FAQ-${string}` | `Secret-${string}` | `Note-${string}`)[];
            readonly nextCursor: string | null;
        };
        readonly distinct: (field?: string) => /*elided*/ any;
        readonly groupBy: (field: string) => Map<unknown, /*elided*/ any>;
        readonly ids: () => (`Agent-${string}` | `Brain-${string}` | `Message-${string}` | `Thread-${string}` | `Relation-${string}` | `Artifact-${string}` | `Flow-${string}` | `Node-${string}` | `TNode-${string}` | `Prompt-${string}` | `Action-${string}` | `Document-${string}` | `Collection-${string}` | `SearchIndex-${string}` | `IndexedDoc-${string}` | `Terminal-${string}` | `Directory-${string}` | `Settings-${string}` | `FAQ-${string}` | `Secret-${string}` | `Note-${string}`)[];
        readonly id: () => `Agent-${string}` | `Brain-${string}` | `Message-${string}` | `Thread-${string}` | `Relation-${string}` | `Artifact-${string}` | `Flow-${string}` | `Node-${string}` | `TNode-${string}` | `Prompt-${string}` | `Action-${string}` | `Document-${string}` | `Collection-${string}` | `SearchIndex-${string}` | `IndexedDoc-${string}` | `Terminal-${string}` | `Directory-${string}` | `Settings-${string}` | `FAQ-${string}` | `Secret-${string}` | `Note-${string}`;
        readonly count: () => number;
        readonly first: () => `Agent-${string}` | `Brain-${string}` | `Message-${string}` | `Thread-${string}` | `Relation-${string}` | `Artifact-${string}` | `Flow-${string}` | `Node-${string}` | `TNode-${string}` | `Prompt-${string}` | `Action-${string}` | `Document-${string}` | `Collection-${string}` | `SearchIndex-${string}` | `IndexedDoc-${string}` | `Terminal-${string}` | `Directory-${string}` | `Settings-${string}` | `FAQ-${string}` | `Secret-${string}` | `Note-${string}`;
        readonly last: () => `Agent-${string}` | `Brain-${string}` | `Message-${string}` | `Thread-${string}` | `Relation-${string}` | `Artifact-${string}` | `Flow-${string}` | `Node-${string}` | `TNode-${string}` | `Prompt-${string}` | `Action-${string}` | `Document-${string}` | `Collection-${string}` | `SearchIndex-${string}` | `IndexedDoc-${string}` | `Terminal-${string}` | `Directory-${string}` | `Settings-${string}` | `FAQ-${string}` | `Secret-${string}` | `Note-${string}` | null;
        readonly exists: () => boolean;
        readonly map: <T>(fn: (i: EARS.EntityId) => T) => T[];
        readonly forEach: /*elided*/ any;
        readonly reduce: <T>(fn: (a: T, i: EARS.EntityId) => T, init: T) => T;
    };
    readonly reduce: <T>(fn: (a: T, i: EARS.EntityId) => T, init: T) => T;
};

declare function findById<T>(id: EARS.EntityId): T | undefined;
declare function findAll<T>(entityType: EARS.Entity): T[];
declare function findWhere<T>(entityType: EARS.Entity, field: string, value: any): T[];
declare function findFirst<T>(entityType: EARS.Entity, field: string, value: any): T | undefined;
declare function findWithFields<T>(entityType: EARS.Entity, fields: string[]): T[];
declare function findByIdWithFields<T>(id: EARS.EntityId, fields: string[]): T | undefined;
declare function countEntities(entityType: EARS.Entity): number;
declare function exists(id: EARS.EntityId): boolean;
declare function findWithRole<T>(entityType: EARS.Entity, role: string): T[];
declare function findFirstWithRole<T>(entityType: EARS.Entity, role: string): T | undefined;

/**
 * Database Service
 *
 * Centralized service that provides access to all database operations
 * including EARS transaction and query utilities.
 */

/**
 * Build a query context from live data for AI query generation.
 * Samples one entity per type to extract real attribute names + values,
 * and maps the relationship topology.
 */
declare function buildQueryContext(): {
    schema: string;
    topology: string;
};

import database_EARS = EARS;
type database_SafeLinkOptions = SafeLinkOptions;
declare const database_buildQueryContext: typeof buildQueryContext;
declare const database_countEntities: typeof countEntities;
declare const database_createEntityWithDefaults: typeof createEntityWithDefaults;
declare const database_createRelation: typeof createRelation;
declare const database_exists: typeof exists;
declare const database_findAll: typeof findAll;
declare const database_findById: typeof findById;
declare const database_findByIdWithFields: typeof findByIdWithFields;
declare const database_findFirst: typeof findFirst;
declare const database_findFirstWithRole: typeof findFirstWithRole;
declare const database_findWhere: typeof findWhere;
declare const database_findWithFields: typeof findWithFields;
declare const database_findWithRole: typeof findWithRole;
declare const database_grantRole: typeof grantRole;
declare const database_prepareEntity: typeof prepareEntity;
declare const database_qx: typeof qx;
declare const database_removeRelation: typeof removeRelation;
declare const database_revokeRole: typeof revokeRole;
declare const database_tx: typeof tx;
declare const database_updateEntity: typeof updateEntity;
declare namespace database {
  export { database_EARS as EARS, database_buildQueryContext as buildQueryContext, database_countEntities as countEntities, database_createEntityWithDefaults as createEntityWithDefaults, database_createRelation as createRelation, database_exists as exists, database_findAll as findAll, database_findById as findById, database_findByIdWithFields as findByIdWithFields, database_findFirst as findFirst, database_findFirstWithRole as findFirstWithRole, database_findWhere as findWhere, database_findWithFields as findWithFields, database_findWithRole as findWithRole, database_grantRole as grantRole, database_prepareEntity as prepareEntity, database_qx as qx, database_removeRelation as removeRelation, database_revokeRole as revokeRole, database_tx as tx, database_updateEntity as updateEntity };
  export type { database_SafeLinkOptions as SafeLinkOptions };
}

/**
 * Browser Automation Service
 *
 * Simple wrapper service for Playwright browser automation providing
 * a clean interface for common browser automation tasks.
 */

interface LaunchOptions {
    headless?: boolean;
    viewport?: {
        width: number;
        height: number;
    };
}
declare class BrowserService {
    private browser;
    private context;
    private page;
    private browserType;
    constructor(browserType?: BrowserType);
    launch(options?: LaunchOptions): Promise<void>;
    close(): Promise<void>;
    private getPage;
    goto(url: string): Promise<void>;
    reload(): Promise<void>;
    goBack(): Promise<void>;
    goForward(): Promise<void>;
    click(selector: string): Promise<void>;
    type(selector: string, text: string): Promise<void>;
    press(key: string): Promise<void>;
    selectOption(selector: string, value: string | string[]): Promise<void>;
    getText(selector: string): Promise<string | null>;
    getAttribute(selector: string, attribute: string): Promise<string | null>;
    isVisible(selector: string): Promise<boolean>;
    isEnabled(selector: string): Promise<boolean>;
    waitForSelector(selector: string, timeout?: number): Promise<ElementHandle | null>;
    waitForTimeout(timeout: number): Promise<void>;
    waitForLoadState(state?: 'load' | 'domcontentloaded' | 'networkidle'): Promise<void>;
    screenshot(path?: string): Promise<Buffer>;
    title(): Promise<string>;
    url(): Promise<string>;
    evaluate<T = any>(fn: () => T): Promise<T>;
    newPage(): Promise<Page>;
    switchToPage(targetPage: Page): Promise<void>;
    closePage(targetPage: Page): Promise<void>;
    setCookies(cookies: Array<{
        name: string;
        value: string;
        domain?: string;
        path?: string;
    }>): Promise<void>;
    getCookies(): Promise<Array<{
        name: string;
        value: string;
        domain: string;
        path: string;
    }>>;
    clearCookies(): Promise<void>;
    setViewport(width: number, height: number): Promise<void>;
    getBrowser(): Browser | null;
    getContext(): BrowserContext | null;
    getCurrentPage(): Page | null;
}
declare function createBrowser(browserType?: BrowserType): BrowserService;

declare const browser_Browser: typeof Browser;
declare const browser_BrowserContext: typeof BrowserContext;
type browser_BrowserService = BrowserService;
declare const browser_BrowserService: typeof BrowserService;
type browser_LaunchOptions = LaunchOptions;
declare const browser_Page: typeof Page;
declare const browser_chromium: typeof chromium;
declare const browser_createBrowser: typeof createBrowser;
declare const browser_firefox: typeof firefox;
declare const browser_webkit: typeof webkit;
declare namespace browser {
  export { browser_Browser as Browser, browser_BrowserContext as BrowserContext, browser_BrowserService as BrowserService, browser_Page as Page, browser_chromium as chromium, browser_createBrowser as createBrowser, browser_firefox as firefox, browser_webkit as webkit };
  export type { browser_LaunchOptions as LaunchOptions };
}

/**
 * Block-based interaction helpers for creating composable messages
 *
 * These helpers make it easy to create messages using reusable blocks that can be
 * mixed and matched to create complex interactions.
 */
interface BlockMessageBase {
    threadId: EARS.EntityId;
    text: string;
    blocks: BlockConfig[];
    forkable?: boolean;
}
type AutoHideOptions = {
    autoHide: true;
    asUser: boolean;
    asideContext?: string;
} | {
    autoHide?: false;
    asUser?: undefined;
    asideContext?: undefined;
};
type BlockMessageOptions = BlockMessageBase & AutoHideOptions;
/**
 * Create a message with custom blocks (pure function)
 * Returns message data without side effects
 */
declare function createBlockMessage(options: BlockMessageOptions): {
    messageId: EARS.EntityId;
    threadId: EARS.EntityId;
    message: MessageEntity;
};
/**
 * Send a message with custom blocks and emit MESSAGE_ADDED event
 * Use this for flow actions that need automatic frontend updates
 */
declare function sendBlockMessage(options: BlockMessageOptions): {
    messageId: EARS.EntityId;
};
/**
 * Create a file picker interaction using blocks
 */
declare function sendFilePickerBlock(options: {
    threadId: EARS.EntityId;
    text: string;
    prompt: string;
    fileType?: 'file' | 'directory' | 'both';
    allowMultiple?: boolean;
    displayText?: string;
    forkable?: boolean;
} & AutoHideOptions): {
    messageId: EARS.EntityId;
};
/**
 * Create a choice interaction using blocks
 */
declare function sendChoiceBlock(options: {
    threadId: EARS.EntityId;
    text: string;
    prompt: string;
    choices: Array<{
        id: string;
        label: string;
        description?: string;
    }>;
    multiSelect?: boolean;
    allowCustom?: boolean;
    displayText?: string;
    forkable?: boolean;
} & AutoHideOptions): {
    messageId: EARS.EntityId;
};
/**
 * Create a question interaction — single question or multi-question wizard.
 * Single question = array with one item. Multi = step wizard in the frontend.
 * Response shape: string (single) or Record<string, string> (multi).
 */
declare function sendQuestionBlock(options: {
    threadId: EARS.EntityId;
    text: string;
    prompt: string;
    questions: Array<{
        question: string;
        header?: string;
        options: Array<{
            id: string;
            label: string;
            description?: string;
        }>;
        multiSelect?: boolean;
        allowCustom?: boolean;
    }>;
    forkable?: boolean;
} & AutoHideOptions): {
    messageId: EARS.EntityId;
};
/**
 * Create an approval interaction using blocks
 */
declare function sendApprovalBlock(options: {
    threadId: EARS.EntityId;
    text: string;
    prompt: string;
    context?: string;
    requireReason?: boolean;
    allowReason?: boolean;
    forkable?: boolean;
} & AutoHideOptions): {
    messageId: EARS.EntityId;
};
/**
 * Create a text input interaction using blocks
 */
declare function sendTextInputBlock(options: {
    threadId: EARS.EntityId;
    text: string;
    prompt: string;
    placeholder?: string;
    multiline?: boolean;
    required?: boolean;
    displayText?: string;
    suggestions?: string[];
    forkable?: boolean;
} & AutoHideOptions): {
    messageId: EARS.EntityId;
};
/**
 * Create a link block with navigation actions
 */
declare function sendLinkBlock(options: {
    threadId: EARS.EntityId;
    text: string;
    prompt?: string;
    links: LinkConfig[];
    forkable?: boolean;
}): {
    messageId: EARS.EntityId;
};
/**
 * Create a button-group interaction using blocks
 *
 * Button groups support two modes (both backend-controlled):
 * 1. toggleStates - Auto-cycling on/off buttons (backend automatically flips state)
 * 2. states - Manual state transitions (flow/brain determines new state with custom logic)
 *
 * Both follow the same data flow: Frontend → Backend → Database → UPDATE_MESSAGE_STATE → Frontend
 *
 * @example
 * // Auto-toggling buttons (backend auto-cycles)
 * sendButtonGroupBlock({
 *   threadId,
 *   text: 'Quick toggles:',
 *   prompt: 'Configure settings',
 *   buttons: [{
 *     id: 'dark-mode',
 *     label: 'Dark Mode',
 *     state: 'off',
 *     toggleStates: {
 *       off: { label: 'Enable Dark Mode', variant: 'secondary' },
 *       on: { label: 'Disable Dark Mode', variant: 'success' }
 *     }
 *   }],
 *   keepInteractive: true
 * });
 * // Flow: User clicks → INTERACTIVE_MSG_RESPONSE → Backend auto-cycles on↔off
 * //       → Persists to DB → UPDATE_MESSAGE_STATE → Frontend updates
 *
 * @example
 * // Manual state buttons (flow/brain controlled)
 * const { messageId } = sendButtonGroupBlock({
 *   threadId,
 *   text: 'Advanced control:',
 *   buttons: [{
 *     id: 'build',
 *     label: 'Build',
 *     state: 'idle',
 *     states: {
 *       idle: { label: 'Start Build', variant: 'primary' },
 *       building: { label: 'Building...', variant: 'secondary', disabled: true },
 *       success: { label: 'Build Complete', variant: 'success' },
 *       error: { label: 'Build Failed', variant: 'danger' }
 *     }
 *   }]
 * });
 * // Flow: User clicks → INTERACTIVE_MSG_RESPONSE → Forwarded to brain/flow
 * //       → Flow determines new state → Calls updateMessageState with new blocks
 * //       → Backend sends UPDATE_MESSAGE_STATE → Frontend updates
 *
 * @example
 * // Mixed button group (both types)
 * sendButtonGroupBlock({
 *   threadId,
 *   text: 'Control panel:',
 *   buttons: [
 *     // Auto-toggle (backend handles)
 *     { id: 'debug', state: 'off', toggleStates: { ... } },
 *     // Manual control (flow handles)
 *     { id: 'deploy', state: 'idle', states: { idle: ..., deploying: ..., deployed: ... } }
 *   ],
 *   keepInteractive: true
 * });
 */
declare function sendButtonGroupBlock(options: {
    threadId: EARS.EntityId;
    text: string;
    prompt?: string;
    buttons: ButtonConfig[];
    keepInteractive?: boolean;
    displayText?: string;
    forkable?: boolean;
} & AutoHideOptions): {
    messageId: EARS.EntityId;
};
/**
 * Update a message with block interaction response data
 */
declare function updateMessageBlockResponse(messageId: EARS.EntityId, response: any): void;
/**
 * Update message state with any mutable fields
 * Main interface for ad hoc message state updates (text, blocks, blockResponse, responseTimestamp)
 * Automatically emits UPDATE_MESSAGE_STATE event to frontend
 *
 * @example
 * // Re-enable interactive blocks by clearing response
 * updateMessageState(messageId, {
 *   responseTimestamp: undefined,
 *   blockResponse: undefined
 * });
 *
 * @example
 * // Update message text
 * updateMessageState(messageId, {
 *   text: 'Updated message content'
 * });
 */
declare function updateMessageState(messageId: EARS.EntityId, updates: Partial<Pick<MessageEntity, 'text' | 'blocks' | 'blockResponse' | 'responseTimestamp' | 'status' | 'context' | 'forkable' | 'compacted'>>): void;
/**
 * Create a marker message that compacts eligible prior messages in a thread.
 * The repository determines which messages are eligible (excludes markers and already-compacted).
 */
declare function createMarkerMessage(params: {
    threadId: EARS.EntityId;
    text: string;
}): {
    messageId: EARS.EntityId;
    compactedMessageIds: EARS.EntityId[];
};
/**
 * Add multiple messages to a thread without emitting per-message frontend events.
 * Caller is responsible for refreshing the frontend afterwards (e.g. via LOAD_CHAT_THREAD).
 */
declare function addMessagesToThread(params: {
    threadId: EARS.EntityId;
    messages: Array<{
        text: string;
        sender: 'user' | 'assistant' | 'system' | 'marker';
        forkable?: boolean;
        context?: Record<string, unknown>;
    }>;
}): void;
/**
 * Create a new thread and notify the frontend
 * Use this in flow actions that need automatic frontend updates
 *
 * @param options - Thread creation options
 * @returns Object with thread id, shortCode, timestamp, and status
 *
 * @example
 * const { id: threadId, shortCode, timestamp, status } = createThreadAndNotify({
 *   topic: 'Assistant Birth',
 *   instructions: 'Welcome!',
 *   role: EARS.RoleKind.Custom('assistant_birth'),
 *   forcedMode: 'birth'
 * });
 */
declare function createThreadAndNotify(options: ThreadCreateData): {
    id: EARS.EntityId;
    shortCode: string;
    timestamp: number;
    status: string;
};
/**
 * Open thread chat and refresh recent threads list
 *
 * Bundles:
 * - Mark thread as visited
 * - Load thread data for chat
 * - Refresh recent threads list
 */
declare function openThreadChatAndRefreshRecent(threadId: EARS.EntityId): void;
/**
 * Open thread tab and refresh recent threads list
 *
 * Bundles:
 * - Mark thread as visited
 * - Load thread tab data with artifacts
 * - Refresh recent threads list
 */
declare function openThreadTabAndRefresh(threadId: EARS.EntityId): void;
/**
 * Send recent threads refresh to frontend
 *
 * Use this helper after any operation that affects thread ordering:
 * - Thread creation
 * - Message creation (updates lastMessageTimestamp)
 * - Thread visits (updates lastVisitedTimestamp)
 */
declare function sendRecentThreadsRefresh(): void;
/**
 * Resolve all message reference types (images, files, notes, threads,
 * library docs/folders) into prompt-ready content for the Claude Code CLI.
 *
 * Returns:
 * - `textPrefix`  — formatted text for non-image references, prepended to the user message
 * - `imageBlocks` — Anthropic image content blocks (base64-encoded), with text labels
 * - `addDirs`     — directories for `--add-dir` (attached file auto-reads)
 */
declare function resolveReferences(references: MessageReferences | undefined): Promise<{
    textPrefix: string;
    imageBlocks: any[];
    addDirs: string[];
}>;
/**
 * Generate a compact aside summary for a collapsed interactive message.
 * Pure function — no side effects.
 */
declare function generateAsideText(message: MessageEntity, response: BlockResponse): string;

type chat_AutoHideOptions = AutoHideOptions;
declare const chat_addMessagesToThread: typeof addMessagesToThread;
declare const chat_createBlockMessage: typeof createBlockMessage;
declare const chat_createMarkerMessage: typeof createMarkerMessage;
declare const chat_createThreadAndNotify: typeof createThreadAndNotify;
declare const chat_generateAsideText: typeof generateAsideText;
declare const chat_openThreadChatAndRefreshRecent: typeof openThreadChatAndRefreshRecent;
declare const chat_openThreadTabAndRefresh: typeof openThreadTabAndRefresh;
declare const chat_resolveReferences: typeof resolveReferences;
declare const chat_sendApprovalBlock: typeof sendApprovalBlock;
declare const chat_sendBlockMessage: typeof sendBlockMessage;
declare const chat_sendButtonGroupBlock: typeof sendButtonGroupBlock;
declare const chat_sendChoiceBlock: typeof sendChoiceBlock;
declare const chat_sendFilePickerBlock: typeof sendFilePickerBlock;
declare const chat_sendLinkBlock: typeof sendLinkBlock;
declare const chat_sendQuestionBlock: typeof sendQuestionBlock;
declare const chat_sendRecentThreadsRefresh: typeof sendRecentThreadsRefresh;
declare const chat_sendTextInputBlock: typeof sendTextInputBlock;
declare const chat_updateMessageBlockResponse: typeof updateMessageBlockResponse;
declare const chat_updateMessageState: typeof updateMessageState;
declare namespace chat {
  export { chat_addMessagesToThread as addMessagesToThread, chat_createBlockMessage as createBlockMessage, chat_createMarkerMessage as createMarkerMessage, chat_createThreadAndNotify as createThreadAndNotify, chat_generateAsideText as generateAsideText, chat_openThreadChatAndRefreshRecent as openThreadChatAndRefreshRecent, chat_openThreadTabAndRefresh as openThreadTabAndRefresh, chat_resolveReferences as resolveReferences, chat_sendApprovalBlock as sendApprovalBlock, chat_sendBlockMessage as sendBlockMessage, chat_sendButtonGroupBlock as sendButtonGroupBlock, chat_sendChoiceBlock as sendChoiceBlock, chat_sendFilePickerBlock as sendFilePickerBlock, chat_sendLinkBlock as sendLinkBlock, chat_sendQuestionBlock as sendQuestionBlock, chat_sendRecentThreadsRefresh as sendRecentThreadsRefresh, chat_sendTextInputBlock as sendTextInputBlock, chat_updateMessageBlockResponse as updateMessageBlockResponse, chat_updateMessageState as updateMessageState };
  export type { chat_AutoHideOptions as AutoHideOptions };
}

/**
 * Artifact Service
 *
 * Provides primitives for creating and managing artifacts across the application.
 * Follows a pure vs side-effect pattern similar to chat service.
 */

interface CreateArtifactOptions {
    artifactType: ArtifactType;
    title: string;
    content: any;
    threadId?: EARS.EntityId;
}
interface UpdateArtifactOptions {
    title?: string;
    content?: unknown;
    /** Thread to emit the ARTIFACT_UPDATED event for. If omitted, no event is sent. */
    threadId?: EARS.EntityId;
}
/**
 * Create a new artifact and notify the frontend (with side effects)
 *
 * This function creates an artifact and automatically sends ARTIFACT_ADDED event
 * to the frontend when a threadId is provided. Use this in flow actions where
 * you want immediate UI updates.
 *
 * @param options - Options for creating the artifact
 * @returns Object containing the created artifact ID
 *
 * @example
 * // Create artifact with automatic FE notification
 * const { artifactId } = createAndNotify({
 *   artifactType: 'todo',
 *   title: 'Tasks',
 *   content: { tasks: [...] },
 *   threadId: 'thread-123'
 * });
 * // Frontend automatically receives ARTIFACT_ADDED event
 */
declare function createAndNotify(options: CreateArtifactOptions): {
    artifactId: EARS.EntityId;
};
/**
 * Patch an existing artifact's title and/or content in place, and notify
 * the frontend so the panel re-renders with the new data.
 *
 * Used for artifacts that mutate across turns (e.g. the Claude Code session
 * card, which tracks live status/cost/turn count). The `ARTIFACT_UPDATED`
 * event mirrors `ARTIFACT_ADDED` but carries only the fields that changed.
 */
declare function updateAndNotify(artifactId: EARS.EntityId, options: UpdateArtifactOptions): void;
/**
 * Find-or-create an artifact by (thread, artifactType). Guarantees at most
 * one artifact of the given type per thread. Useful for singletons like the
 * Claude Code session card that should only ever exist once per thread.
 */
declare function findOrCreateByType(threadId: EARS.EntityId, artifactType: ArtifactType, initial: {
    title: string;
    content: any;
}): {
    artifactId: EARS.EntityId;
    created: boolean;
};

type artifact_CreateArtifactOptions = CreateArtifactOptions;
type artifact_UpdateArtifactOptions = UpdateArtifactOptions;
declare const artifact_createAndNotify: typeof createAndNotify;
declare const artifact_findOrCreateByType: typeof findOrCreateByType;
declare const artifact_updateAndNotify: typeof updateAndNotify;
declare namespace artifact {
  export { artifact_createAndNotify as createAndNotify, artifact_findOrCreateByType as findOrCreateByType, artifact_updateAndNotify as updateAndNotify };
  export type { artifact_CreateArtifactOptions as CreateArtifactOptions, artifact_UpdateArtifactOptions as UpdateArtifactOptions };
}

interface BrainEventPayload {
    type: string;
    payload?: any;
    targetFlowId?: string;
}
type BrainEventCallback = (event: BrainEventPayload) => void | Promise<void>;
interface ListenOptions {
    /** Named ID for cross-action cleanup via unlisten(). If omitted, an auto-incremented ID is used. */
    id?: string;
}
/**
 * Register an ad-hoc brain event listener.
 * Returns an unsubscribe function for cleanup.
 *
 * If a named `id` is provided and already exists, the old listener is replaced.
 */
declare function listen(eventType: string, callback: BrainEventCallback, options?: ListenOptions): () => void;
/**
 * Remove a named listener by its ID.
 * No-op if the ID doesn't exist.
 */
declare function unlisten(id: string): boolean;
/**
 * Notify all ad-hoc listeners matching the given eventType.
 * Called by triggerBrainEvent AFTER normal flow routing.
 *
 * - Async callbacks are fire-and-forget
 * - Errors in one listener do not affect others or the brain system
 */
declare function notify(eventType: string, payload?: any, targetFlowId?: string): void;
/**
 * Remove all ad-hoc listeners. Safety net called on brain kill/restart.
 */
declare function removeAllListeners(): void;

type brain_BrainEventCallback = BrainEventCallback;
type brain_BrainEventPayload = BrainEventPayload;
type brain_ListenOptions = ListenOptions;
declare const brain_listen: typeof listen;
declare const brain_notify: typeof notify;
declare const brain_removeAllListeners: typeof removeAllListeners;
declare const brain_unlisten: typeof unlisten;
declare namespace brain {
  export { brain_listen as listen, brain_notify as notify, brain_removeAllListeners as removeAllListeners, brain_unlisten as unlisten };
  export type { brain_BrainEventCallback as BrainEventCallback, brain_BrainEventPayload as BrainEventPayload, brain_ListenOptions as ListenOptions };
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

/**
 * Threads Service
 *
 * Provides primitives for updating thread-level state with automatic
 * frontend notification, following the same pattern as artifact service.
 */

/**
 * Update a thread's chatState and notify the frontend.
 *
 * This is the canonical service-level write for chatState. The DSL helper
 * `updateChatState()` in session-artifact.ts handles the artifact side,
 * then delegates here for the thread write + emit.
 */
declare function updateChatState(threadId: EARS.EntityId, chatState: string): void;

declare const threads_updateChatState: typeof updateChatState;
declare namespace threads {
  export {
    threads_updateChatState as updateChatState,
  };
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
    database: typeof database;
    prompt: PromptService;
    action: ActionService;
    library: LibraryService;
    browser: typeof browser;
    repository: {
        readonly actionQueries: {
            readonly byId: (id: EARS.EntityId) => ActionEntity | undefined;
            readonly all: () => ActionEntity[];
            readonly byCategory: (category: string) => ActionEntity[];
            readonly paginated: (page?: number, pageSize?: number) => {
                items: ActionEntity[];
                page: number;
                pageSize: number;
                totalCount: number;
                totalPages: number;
            };
            readonly connectedData: (page?: number) => {
                actions: ActionEntity[];
                page: number;
                totalPages: number;
                totalCount: number;
            };
        };
        readonly actionCommands: {
            readonly create: (data: {
                label: string;
                description?: string;
                category?: string;
                input?: Record<string, any>;
                actionFn: string;
                output?: any;
                sourceHash?: string;
            }) => ActionEntity;
            readonly update: (id: EARS.EntityId, updates: {
                label?: string;
                description?: string;
                category?: string;
                input?: Record<string, any>;
                actionFn?: string;
                output?: any;
                sourceHash?: string;
            }) => void;
            readonly delete: (id: EARS.EntityId) => void;
        };
        readonly chatQueries: {
            readonly hasRequiredApiKeys: () => boolean;
            readonly threadArtifacts: (threadId: EARS.EntityId) => ArtifactItem[];
            readonly threadData: (threadId: EARS.EntityId) => AgentThreadData;
            readonly refreshThreadsData: () => RecentThreadRefreshData;
            readonly connectedData: () => AgentConnectedData;
            readonly messageById: (messageId: EARS.EntityId) => MessageEntity | null;
        };
        readonly chatCommands: {
            readonly addMessage: (params: {
                threadId: EARS.EntityId;
                text: string;
                sender: "user" | "assistant" | "system" | "marker";
                blocks?: BlockConfig[];
                forkable?: boolean;
                references?: MessageReferences;
                isCommand?: boolean;
                command?: string;
                autoHide?: boolean;
                asUser?: boolean;
                asideContext?: string;
                blockResponse?: any;
                responseTimestamp?: number;
                asideText?: string;
                compacted?: boolean;
                context?: Record<string, unknown>;
            }) => {
                id: EARS.EntityId;
                threadId: EARS.EntityId;
                text: string;
                sender: string;
                timestamp: number;
            };
            readonly createThreadFromMessage: (text: string) => {
                threadId: EARS.EntityId;
                threadData: ReturnType<(input: ThreadCreateData & {
                    id?: string;
                }) => {
                    id: EARS.EntityId;
                    shortCode: string;
                    timestamp: number;
                    status: string;
                }>;
            };
            readonly updateMessageBlockResponse: (params: {
                messageId: EARS.EntityId;
                response: any;
            }) => {
                messageId: EARS.EntityId;
                responseTimestamp: number;
                updatedAt: number;
                blocks?: BlockConfig[];
            };
            readonly updateMessageState: (params: {
                messageId: EARS.EntityId;
                updates: Partial<Pick<MessageEntity, "text" | "blocks" | "blockResponse" | "responseTimestamp" | "forkable" | "status" | "context" | "compacted">>;
            }) => {
                messageId: EARS.EntityId;
                updatedAt: number;
                updates: typeof params.updates;
            };
            readonly createMarkerMessage: (params: {
                threadId: EARS.EntityId;
                text: string;
            }) => {
                id: EARS.EntityId;
                threadId: EARS.EntityId;
                text: string;
                sender: string;
                timestamp: number;
                compactedMessageIds: EARS.EntityId[];
            };
            readonly toggleMarkerCompacted: (markerId: EARS.EntityId, compacted: boolean) => EARS.EntityId[];
            readonly copyMessagesUpTo: (params: {
                sourceThreadId: EARS.EntityId;
                targetThreadId: EARS.EntityId;
                upToMessageId: string;
            }) => void;
            readonly softDeleteMessagesAfter: (params: {
                threadId: EARS.EntityId;
                messageId: EARS.EntityId;
            }) => {
                deletedCount: number;
                deletedIds: string[];
            };
            readonly createArtifact: (params: {
                artifactType: ArtifactType;
                title: string;
                content: any;
                threadId?: EARS.EntityId;
            }) => {
                artifactId: EARS.EntityId;
            };
            readonly updateArtifact: (artifactId: EARS.EntityId, patch: {
                title?: string;
                content?: unknown;
            }) => void;
            readonly findArtifactByType: (threadId: EARS.EntityId, artifactType: ArtifactType) => ArtifactEntity | undefined;
        };
        readonly brainQueries: {
            readonly rootFlowTNode: () => EARS.EntityId | undefined;
            readonly tNodeById: (id: EARS.EntityId) => TNodeEntity | null;
            readonly flowEventNodes: (flowId: EARS.EntityId) => ListenerNode[];
            readonly eventFirstStep: (eventNodeId: EARS.EntityId) => NodeEntity | undefined;
            readonly eventAllSteps: (eventNodeId: EARS.EntityId) => NodeEntity[];
            readonly nextNodeInFlowTrack: (nodeId: EARS.EntityId) => NodeEntity;
            readonly nextNodeForBranch: (nodeId: EARS.EntityId, sourceHandle?: string) => NodeEntity | undefined;
            readonly eventTracks: (flowTNodeId: EARS.EntityId) => TrackEntity[];
            readonly possibleEvents: (flowTNodeId: EARS.EntityId) => EventListenerEntity[];
            readonly buildFlowHierarchy: (flowTNodeId: EARS.EntityId) => Array<{
                flowTNodeId: EARS.EntityId;
                label: string;
            }>;
            readonly extendedTNodeData: (tNodeId: EARS.EntityId) => FlowTNodeData;
            readonly rootData: () => FlowTNodeData;
        };
        readonly brainCommands: {
            readonly createEventTNode: (eventNode: ListenerNode, flowTNodeId: EARS.EntityId) => TNodeEntity;
            readonly createFlowTNode: (flowStepId: EARS.EntityId, eventTrackId?: EARS.EntityId, executionContext?: ExecutionContext) => {
                flowTNode: TNodeEntity;
                eventNodes: ListenerNode[];
            };
            readonly createStepTNode: (stepId: EARS.EntityId, eventTrackId: EARS.EntityId, executionContext?: ExecutionContext) => {
                tNode: TNodeEntity;
                step: NodeEntity;
            };
            readonly createRootFlowTNode: () => {
                rootFlow: FlowEntity;
                rootFlowTNode: TNodeEntity;
                eventNodes: ListenerNode[];
                entryNode: ListenerNode;
            };
            readonly updateTNodeStatus: (tNodeId: EARS.EntityId, status: TNodeEntity["status"]) => void;
            readonly updateTNodeResult: (tNodeId: EARS.EntityId, result: any) => void;
            readonly updateTNodeAttributes: (tNodeId: EARS.EntityId, attributes: any) => void;
            readonly clearVolatileData: () => void;
        };
        readonly flowsQueries: {
            readonly rootFlow: () => EARS.EntityId | undefined;
            readonly getNodeActionId: (nodeId: EARS.EntityId) => EARS.EntityId | undefined;
            readonly node: (nodeId: EARS.EntityId) => NodeEntity | undefined;
            readonly flowNodes: (flowId: EARS.EntityId) => NodeEntity[];
            readonly flowEdges: (flowId: EARS.EntityId) => EdgeEntity[];
            readonly extendedData: (flowId: EARS.EntityId, include?: keyof FlowExtendedData | (keyof FlowExtendedData)[]) => FlowExtendedData;
            readonly connectedData: () => FlowsConnectedData;
        };
        readonly flowsCommands: {
            readonly createFlow: (flow?: Partial<FlowEntity>) => FlowEntity;
            readonly createFlowWithEntryNode: (flow?: Partial<FlowEntity>) => {
                flow: FlowEntity;
                entryNode: NodeEntity;
            };
            readonly createNode: (flowId: EARS.EntityId, nodeData: NodeCreateInput) => NodeEntity;
            readonly createEdge: (sourceId: EARS.EntityId, targetId: EARS.EntityId, options?: {
                sourceHandle?: string;
                targetHandle?: string;
            }) => {
                relId: EARS.EntityId;
            };
            readonly updateFlowLabel: (flowId: EARS.EntityId, label: string) => void;
            readonly updateNode: (nodeId: EARS.EntityId, updates: NodeCreateInput) => void;
            readonly deleteNode: (nodeId: EARS.EntityId) => void;
            readonly deleteEdge: (edgeId: EARS.EntityId) => void;
            readonly updateEdge: (edgeId: EARS.EntityId, oldSource: EARS.EntityId, oldTarget: EARS.EntityId, newSource: EARS.EntityId, newTarget: EARS.EntityId) => {
                newRelId: EARS.EntityId;
            };
            readonly grantRootFlowRole: (flowId: EARS.EntityId) => void;
            readonly revokeRootFlowRole: (flowId: EARS.EntityId) => void;
            readonly deleteFlow: (flowId: EARS.EntityId) => void;
            readonly reindexHandles: (nodeId: EARS.EntityId, prefix: string, pivotIndex: number, direction: 1 | -1) => void;
            readonly importFromDSL: (compiled: CompiledRows) => {
                flowIds: EARS.EntityId[];
            };
        };
        readonly libraryQueries: {
            readonly getDocuments: (collectionId?: string) => DocumentDTO[];
            readonly getDocument: (id: EARS.EntityId) => DocumentDTO | null;
            readonly getDocumentByShortCode: (shortCode: DocumentShortCode) => DocumentDTO | null;
            readonly getCollections: () => CollectionDTO[];
            readonly getFolderContents: (folderId: EARS.EntityId | null) => Promise<FolderContents>;
            readonly getFolderPath: (folderId: EARS.EntityId | null) => BreadcrumbItem[];
            readonly getParentFolderId: (folderId: EARS.EntityId) => EARS.EntityId | null;
            readonly getCollectionByName: (name: string) => CollectionDTO | null;
            readonly getDocumentsInCollection: (collectionId: EARS.EntityId) => DocumentDTO[];
            readonly getAllDocuments: () => DocumentDTO[];
        };
        readonly libraryCommands: {
            readonly createDocument: (name: string, content: ContentSection[], tags: string[], collectionId?: EARS.EntityId, id?: string, sourceHash?: string) => DocumentDTO;
            readonly updateDocument: (id: EARS.EntityId, name: string, content: ContentSection[], tags: string[], collectionId?: EARS.EntityId, sourceHash?: string) => DocumentDTO;
            readonly deleteDocument: (id: EARS.EntityId) => void;
            readonly createCollection: (name: string, description?: string, parentId?: EARS.EntityId, id?: string, sourceHash?: string) => CollectionDTO;
            readonly updateCollection: (id: EARS.EntityId, name: string, description?: string, sourceHash?: string) => CollectionDTO;
            readonly deleteCollection: (id: EARS.EntityId) => void;
            readonly moveDocument: (documentId: EARS.EntityId, newCollectionId?: EARS.EntityId) => DocumentDTO;
            readonly renameItem: (id: EARS.EntityId, name: string, type: "document" | "folder") => LibraryItem;
            readonly deleteItems: (ids: EARS.EntityId[]) => void;
            readonly moveItems: (ids: EARS.EntityId[], targetFolderId: EARS.EntityId | null) => void;
            readonly migrateDocumentShortCodes: () => void;
            readonly migrateDisplayOrders: () => void;
            readonly createSymlinkCollection: (name: string, symlinkPath: string, parentId?: EARS.EntityId, id?: string) => CollectionDTO;
            readonly updateSymlinkPath: (collectionId: EARS.EntityId, newPath: string) => CollectionDTO;
            readonly updateDocumentTags: (documentId: EARS.EntityId, tags: string[]) => void;
        };
        readonly promptQueries: {
            byId: (id: EARS.EntityId) => PromptEntity | undefined;
            all: () => PromptEntity[];
            byLabel: (label: string) => PromptEntity | undefined;
            connectedData: (page?: number, pageSize?: number) => {
                prompts: PromptEntity[];
                page: number;
                totalPages: number;
                totalCount: number;
            };
        };
        readonly promptCommands: {
            create: (input: {
                label: string;
                description?: string;
                templateFn: string;
                inputs?: Record<string, any>;
                category?: string;
                sourceHash?: string;
            }) => PromptEntity;
            update: (id: EARS.EntityId, updates: {
                label?: string;
                description?: string;
                templateFn?: string;
                inputs?: Record<string, any>;
                category?: string;
                sourceHash?: string;
            }) => void;
            delete: (id: EARS.EntityId) => void;
        };
        readonly settingsQueries: {
            getSettings: () => SettingsData;
            getGeneralSettings: (label?: string) => any;
            getInternalSettings: () => InternalSettings;
            getAssistantSettings: () => AssistantSettings;
            getPluginSettings: (pluginId: string) => any;
        };
        readonly settingsCommands: {
            updateSettings(type: string, label: string | null, path: string[], value: any): void;
            resetSettings: () => void;
        };
        readonly secretsQueries: {
            getAllSecrets: () => SecretEntity[];
            getSecret: (id: EARS.EntityId) => SecretEntity | null;
            getSecretByProvider: (provider: SecretProvider, customName?: string) => SecretEntity | null;
            getSecretsData: () => SecretData[];
        };
        readonly secretsCommands: {
            createSecret: (params: CreateSecretParams) => EARS.EntityId;
            updateSecret: (id: EARS.EntityId, value: string) => EARS.EntityId;
            deleteSecret: (id: EARS.EntityId) => boolean;
            deleteSecretByProvider: (provider: SecretProvider, customName?: string) => boolean;
        };
        readonly terminalQueries: {
            byId: (id: EARS.EntityId) => TerminalEntity | undefined;
            all: () => TerminalEntity[];
            active: () => TerminalEntity[];
            getStartupData: () => StartupData;
        };
        readonly terminalCommands: {
            create: (terminalInfo: Partial<TerminalInfo> & {
                id: EARS.EntityId;
            }) => EARS.EntityId;
            resize: (id: EARS.EntityId, cols: number, rows: number) => void;
            rename: (id: EARS.EntityId, customTitle: string) => void;
            updateCwd: (id: EARS.EntityId, cwd: string, title?: string) => void;
            updatePid: (id: EARS.EntityId, pid: number) => void;
            markClosed: (id: EARS.EntityId) => void;
            delete: (id: EARS.EntityId) => void;
        };
        readonly threadQueries: {
            readonly byId: (id: EARS.EntityId) => ThreadEntity | undefined;
            readonly all: () => ThreadEntity[];
            readonly allByRecency: () => ThreadEntity[];
            readonly messages: (threadId: EARS.EntityId) => Partial<MessageEntity>[];
            readonly linkedThreads: (threadId: EARS.EntityId) => any[];
            readonly extendedData: (threadId: EARS.EntityId, include?: keyof ThreadExtendedData | (keyof ThreadExtendedData)[]) => ThreadExtendedData;
            readonly kanbanItems: () => {
                content: {
                    workItems: {
                        id: any;
                        name: string;
                        time: string;
                        date: string;
                        priority: number;
                        tags: never[];
                        status: any;
                        type: "work-item";
                    }[];
                };
                metadata: {
                    createdAt: number;
                };
            };
            readonly connectedData: () => ThreadConnectedData;
        };
        readonly threadCommands: {
            readonly create: (input: ThreadCreateData & {
                id?: string;
            }) => {
                id: EARS.EntityId;
                shortCode: string;
                timestamp: number;
                status: string;
            };
            readonly update: (id: EARS.EntityId, updates: {
                topic?: string;
                instructions?: string;
                status?: string;
                tags?: string[];
                linkedThreads?: any[];
                lastMessageTimestamp?: number;
                lastVisitedTimestamp?: number;
                forcedMode?: ThreadEntity["forcedMode"] | null;
                context?: ThreadEntity["context"];
                archived?: boolean;
                chatState?: string;
            }) => void;
            readonly markAsVisited: (id: EARS.EntityId) => void;
            readonly linkFork: (sourceThreadId: EARS.EntityId, forkedThreadId: EARS.EntityId) => void;
            readonly forkCount: (sourceThreadId: EARS.EntityId) => number;
            readonly setParent: (parentId: EARS.EntityId, childIds: EARS.EntityId[]) => {
                reparented: string[];
                skipped: string[];
            };
            readonly delete: (id: EARS.EntityId) => void;
        };
        readonly noteQueries: {
            readonly byId: (id: EARS.EntityId) => NoteEntity | undefined;
            readonly byIdDTO: (id: EARS.EntityId) => NoteDTO | undefined;
            readonly all: () => NoteEntity[];
            readonly allDTOs: () => NoteDTO[];
            readonly children: (parentId: EARS.EntityId) => NoteDTO[];
            readonly ancestorChain: (noteId: EARS.EntityId) => NoteDTO[];
            readonly referencedBy: (noteId: EARS.EntityId) => EARS.EntityId[];
            readonly trashedDTOs: () => NoteDTO[];
            readonly expiredSoftDeleted: (maxAgeDays: number) => NoteEntity[];
            readonly connectedData: () => {
                notes: NoteDTO[];
            };
        };
        readonly noteCommands: {
            readonly create: (input: {
                title: string;
                content?: string;
                icon?: string | null;
                parentId?: string;
                displayOrder?: number;
                noteType?: "document" | "tasklist" | "task";
                completed?: boolean;
                id?: string;
            }) => NoteEntity;
            readonly update: (id: EARS.EntityId, updates: {
                title?: string;
                content?: string;
                icon?: string | null;
                displayOrder?: number;
                savedDisplayOrder?: number | null;
                lastSeen?: number;
                completed?: boolean;
                hideCompletedChildren?: boolean;
                favorite?: boolean;
            }, skipTimestamp?: boolean) => void;
            readonly softDelete: (id: EARS.EntityId) => string[];
            readonly restore: (id: EARS.EntityId) => string[];
            readonly move: (id: EARS.EntityId, newParentId: EARS.EntityId | null) => {
                oldParentId: string | null;
            };
            readonly reorder: (id: EARS.EntityId, newParentId: EARS.EntityId | null, newIndex: number) => {
                oldParentId: string | null;
                affectedIds: string[];
            };
            readonly delete: (id: EARS.EntityId) => void;
        };
    };
    settings: SettingsService;
    textStream: TextStreamService;
    chat: typeof chat;
    artifact: typeof artifact;
    brain: typeof brain;
    media: typeof media;
    cli: CliServiceType;
    filesystem: FilesystemServiceType;
    threads: typeof threads;
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

export { ActionService, LibraryService, PromptService, params as params, services };
export type { ActionEntity, ActionParams, Services, SettingsData };
