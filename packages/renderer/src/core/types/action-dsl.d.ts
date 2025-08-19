declare module "@app/dsl/action" {

import * as zod from 'zod';
import { z } from 'zod';
export { z } from 'zod';
import * as ai from 'ai';
import { CoreMessage } from 'ai';
import * as _ai_sdk_openai from '@ai-sdk/openai';
import * as _ai_sdk_anthropic from '@ai-sdk/anthropic';
import { BrowserType, ElementHandle, Page, Browser, BrowserContext, chromium, firefox, webkit } from 'playwright';

declare namespace EARS {
    export enum Entity {
        Agent = "Agent",
        Brain = "Brain",
        Message = "Message",
        Thread = "Thread",
        Tag = "Tag",
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
        Terminal = "Terminal",
        Directory = "Directory",
        Settings = "Settings",
        FAQ = "FAQ"
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
        readonly EVENT_TRACE: "event_trace";
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
        readonly EVENT_TRACE: "event_trace";
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

interface SafeLinkOptions {
    /** Additional info to store with the relation */
    info?: unknown;
    /** If true, creates bidirectional edges automatically */
    symmetric?: boolean;
    /** If specified, prevents cycles within this group of relation kinds */
    acyclicGroup?: readonly EARS.RelKind[];
}
declare function tx(typeOrId: EARS.Entity | EARS.EntityId): {
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
    readonly destroy: () => never;
    readonly id: () => `Agent-${string}` | `Brain-${string}` | `Message-${string}` | `Thread-${string}` | `Tag-${string}` | `Relation-${string}` | `Artifact-${string}` | `Flow-${string}` | `Node-${string}` | `TNode-${string}` | `Prompt-${string}` | `Action-${string}` | `Document-${string}` | `Collection-${string}` | `SearchIndex-${string}` | `Terminal-${string}` | `Directory-${string}` | `Settings-${string}` | `FAQ-${string}`;
};

type Simplify<T> = {
    [K in keyof T]: T[K];
} & {};

/** Extract a union of inferred objects from a readonly tuple of Zod schemas. */
type EventsFromSchemas<S extends readonly z.ZodTypeAny[]> = {
    [K in keyof S]: z.infer<S[K]>;
}[number];

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
    createdAt: number;
    updatedAt: number;
}
interface ActionsStartupData {
    actions: ActionEntity[];
    page: number;
    totalPages: number;
    totalCount: number;
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
    createdAt: number;
    updatedAt: number;
}
/**
 * Data sent on prompts system startup
 */
interface PromptsStartupData {
    prompts: PromptEntity[];
    page: number;
    totalPages: number;
    totalCount: number;
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

interface MessageEntity extends BaseEntity {
    entityType: EARS.Entity.Message;
    text: string;
    sender: 'user' | 'assistant' | 'system';
    timestamp: number;
}
interface ThreadEntity extends BaseEntity {
    entityType: EARS.Entity.Thread;
    topic: string;
    instructions: string;
    sideTopics?: string[];
    timestamp: number;
    lastMessageTimestamp?: number;
    shortCode?: string;
    threadType: 'work-item' | 'project' | 'user';
    status: 'backlog' | 'open' | 'in-progress' | 'in-review' | 'done';
}
interface ArtifactEntity extends BaseEntity {
    entityType: EARS.Entity.Artifact;
    title?: string;
    content: string | any;
    artifactType: 'text' | 'code' | 'image' | 'json' | 'graph' | 'table' | 'kanban' | 'slack';
}
interface TagEntity extends BaseEntity {
    entityType: EARS.Entity.Tag;
    name: string;
    color?: string;
}
declare const ThreadRelations: readonly ["parent_of", "blocks", "blocked_by", "duplicates"];
type ThreadLinkRelation = typeof ThreadRelations[number];
type ThreadLinkItem = Pick<ThreadEntity, 'id' | 'shortCode' | 'status' | 'timestamp' | 'topic' | 'threadType'> & {
    relation: ThreadLinkRelation;
};
type ThreadTagItem = Omit<TagEntity, 'createdAt' | 'updatedAt' | 'entityType'>;
type ThreadEditFields = Simplify<Pick<ThreadEntity, 'topic' | 'threadType' | 'instructions'> & {
    status?: ThreadEntity['status'];
} & ThreadLinkedFields>;
type ThreadLinkedFields = {
    tags?: ThreadTagItem[];
    linkedThreads?: ThreadLinkItem[];
};
type ThreadCreateData = Simplify<ThreadEditFields>;
type ThreadExtended = Simplify<ThreadEntity & ThreadExtendedData>;
type ThreadExtendedData = ThreadLinkedFields & {
    messages?: Partial<MessageEntity>[];
};
type ThreadStartupData = {
    threads: ThreadExtended[];
    availableTags: TagEntity[];
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
};
type RecentThreadRefreshData = {
    currentThread: AgentThreadData | null;
    threads: Partial<ThreadEntity>[];
};
interface AgentMode {
    id: string;
    name: string;
    description: string;
}
interface AgentSettings {
    modes: AgentMode[];
    hotkeys: {
        textToSpeech?: KeyboardShortcut | null;
        switchMode?: KeyboardShortcut | null;
        [key: string]: KeyboardShortcut | null | undefined;
    };
}
type AgentStartupData = {
    currentThread: AgentThreadData | null;
    threads: Partial<ThreadEntity>[];
    dashboardArtifacts: Partial<ArtifactEntity>[];
    tabs: Tab[];
    settings?: AgentSettings;
};
interface Tab {
    id: string;
    label: string;
    artifacts: ArtifactItem[];
    selectedArtifactId?: string;
}
type ArtifactType = 'text' | 'code' | 'review' | 'image' | 'kanban' | 'slack' | 'todo';
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
}
interface FileChangeInfo {
    path: string;
    modifiedAt: Date;
    changeType: 'add' | 'change' | 'unlink';
}
interface TerminalInfo {
    id: EARS.EntityId;
    title: string;
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
interface CodeSettings {
    hotkeys: {
        openTerminal?: KeyboardShortcut | null;
        navigatePrevPanel?: KeyboardShortcut | null;
        navigateNextPanel?: KeyboardShortcut | null;
        [key: string]: KeyboardShortcut | null | undefined;
    };
    restoreTerminals?: boolean;
    defaultRootDirectory?: string | null;
}
type CodeStartupData = {
    rootDirectory: string | null;
    currentDirectory: string | null;
    settings?: CodeSettings;
};

type EmbeddingModelId = 'minilm-l6-v2' | 'bge-small-en' | 'bge-small-en-v1.5' | 'bge-base-en' | 'bge-base-en-v1.5' | 'e5-large-multilingual' | 'text-embedding-3-small' | 'text-embedding-3-large';

type EmbeddingModel = EmbeddingModelId;
type IndexMetric = 'cosine' | 'dot_product';
interface SegmentRule {
    id: string;
    type: 'text' | 'list' | 'field';
    occurrence: string;
    key?: string;
    indexMode: 'combined' | 'separate';
}
interface SearchIndexConfig {
    name: string;
    description: string;
    embeddingModel: EmbeddingModel;
    indexMetric: IndexMetric;
    connectors: number;
    excludeAllSubfolders: boolean;
    excludedFolderIds: EARS.EntityId[];
    excludedDocumentIds: EARS.EntityId[];
    enableSectionIndexing: boolean;
    segmentRules: SegmentRule[];
    constructTemplate: string;
}
interface SearchIndex extends SearchIndexConfig {
    id: EARS.EntityId;
    folderId: EARS.EntityId | null;
    documentCount: number;
    vectorDimensions: number;
    createdAt: number;
    updatedAt: number;
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
interface TextBlockContent {
    type: 'text';
    text: string;
}
type ContentSection = FieldContent | ListContent | TextBlockContent;
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
}
type LibraryItem = FolderItem | DocumentItem;
interface FolderContents {
    items: LibraryItem[];
    currentPath: string[];
    currentFolderId: EARS.EntityId | null;
    breadcrumbs: BreadcrumbItem[];
    searchIndices?: any[];
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
    mode: 'entry' | 'internal';
}
interface FlowTNodeData {
    flowTNodeId: EARS.EntityId;
    tNodeTree: TrackEntity[];
    possibleEvents: EventListenerEntity[];
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
    id: string;
    label: string;
    result: unknown;
    timestamp: TimestampMs;
}
interface ExecutionContext {
    event: ExecutionEvent;
    steps: StepRun[];
    lastStep?: Omit<StepRun, 'timestamp'>;
}

declare const events: {
    readonly incoming: readonly [zod.ZodObject<{
        type: zod.ZodLiteral<"USER_MSG">;
        systemId: zod.ZodLiteral<"agent">;
        text: zod.ZodString;
        mode: zod.ZodOptional<zod.ZodEnum<["plan", "work", "chat", "note"]>>;
        threadId: zod.ZodOptional<zod.ZodString>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        text: string;
        type: "USER_MSG";
        systemId: "agent";
        mode?: "plan" | "work" | "chat" | "note" | undefined;
        threadId?: string | undefined;
    }, {
        text: string;
        type: "USER_MSG";
        systemId: "agent";
        mode?: "plan" | "work" | "chat" | "note" | undefined;
        threadId?: string | undefined;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"OPEN_THREAD_CHAT">;
        systemId: zod.ZodLiteral<"agent">;
        threadId: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        threadId: string;
        type: "OPEN_THREAD_CHAT";
        systemId: "agent";
    }, {
        threadId: string;
        type: "OPEN_THREAD_CHAT";
        systemId: "agent";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"OPEN_THREAD_TAB">;
        systemId: zod.ZodLiteral<"agent">;
        threadId: zod.ZodString;
        label: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        label: string;
        threadId: string;
        type: "OPEN_THREAD_TAB";
        systemId: "agent";
    }, {
        label: string;
        threadId: string;
        type: "OPEN_THREAD_TAB";
        systemId: "agent";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"REFRESH_DASHBOARD">;
        systemId: zod.ZodLiteral<"agent">;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "REFRESH_DASHBOARD";
        systemId: "agent";
    }, {
        type: "REFRESH_DASHBOARD";
        systemId: "agent";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"CANCEL">;
        systemId: zod.ZodLiteral<"agent">;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "CANCEL";
        systemId: "agent";
    }, {
        type: "CANCEL";
        systemId: "agent";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"APPROVE_TODO_LIST">;
        systemId: zod.ZodLiteral<"agent">;
        artifactId: zod.ZodString;
        tasks: zod.ZodArray<zod.ZodAny, "many">;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "APPROVE_TODO_LIST";
        systemId: "agent";
        artifactId: string;
        tasks: any[];
    }, {
        type: "APPROVE_TODO_LIST";
        systemId: "agent";
        artifactId: string;
        tasks: any[];
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"REJECT_TODO_LIST">;
        systemId: zod.ZodLiteral<"agent">;
        artifactId: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "REJECT_TODO_LIST";
        systemId: "agent";
        artifactId: string;
    }, {
        type: "REJECT_TODO_LIST";
        systemId: "agent";
        artifactId: string;
    }>] | readonly [zod.ZodObject<{
        type: zod.ZodLiteral<"OPEN_TNODE">;
        systemId: zod.ZodLiteral<"brain">;
        tNodeId: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "OPEN_TNODE";
        systemId: "brain";
        tNodeId: string;
    }, {
        type: "OPEN_TNODE";
        systemId: "brain";
        tNodeId: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"GO_BACK_TNODE">;
        systemId: zod.ZodLiteral<"brain">;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "GO_BACK_TNODE";
        systemId: "brain";
    }, {
        type: "GO_BACK_TNODE";
        systemId: "brain";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"REQUEST_PLUGIN_DATA">;
        systemId: zod.ZodLiteral<"brain">;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "REQUEST_PLUGIN_DATA";
        systemId: "brain";
    }, {
        type: "REQUEST_PLUGIN_DATA";
        systemId: "brain";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"GET_TNODE_DETAILS">;
        systemId: zod.ZodLiteral<"brain">;
        tNodeId: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "GET_TNODE_DETAILS";
        systemId: "brain";
        tNodeId: string;
    }, {
        type: "GET_TNODE_DETAILS";
        systemId: "brain";
        tNodeId: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"TOGGLE_DEBUG">;
        systemId: zod.ZodLiteral<"brain">;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "TOGGLE_DEBUG";
        systemId: "brain";
    }, {
        type: "TOGGLE_DEBUG";
        systemId: "brain";
    }>] | readonly [zod.ZodObject<{
        type: zod.ZodLiteral<"CREATE_THREAD">;
        systemId: zod.ZodLiteral<"threads">;
        linkedThreads: zod.ZodOptional<zod.ZodArray<zod.ZodObject<{
            id: zod.ZodString;
            relation: zod.ZodUnion<[zod.ZodLiteral<"parent_of">, zod.ZodLiteral<"blocks">, zod.ZodLiteral<"blocked_by">, zod.ZodLiteral<"duplicates">]>;
        }, "strip", zod.ZodTypeAny, {
            id: string;
            relation: "parent_of" | "blocks" | "duplicates" | "blocked_by";
        }, {
            id: string;
            relation: "parent_of" | "blocks" | "duplicates" | "blocked_by";
        }>, "many">>;
        parentThreadId: zod.ZodOptional<zod.ZodString>;
        topic: zod.ZodString;
        threadType: zod.ZodString;
        tags: zod.ZodOptional<zod.ZodArray<zod.ZodObject<{
            id: zod.ZodString;
            name: zod.ZodString;
            color: zod.ZodOptional<zod.ZodString>;
        }, "strip", zod.ZodTypeAny, {
            name: string;
            id: string;
            color?: string | undefined;
        }, {
            name: string;
            id: string;
            color?: string | undefined;
        }>, "many">>;
        instructions: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        topic: string;
        threadType: string;
        instructions: string;
        type: "CREATE_THREAD";
        systemId: "threads";
        tags?: {
            name: string;
            id: string;
            color?: string | undefined;
        }[] | undefined;
        linkedThreads?: {
            id: string;
            relation: "parent_of" | "blocks" | "duplicates" | "blocked_by";
        }[] | undefined;
        parentThreadId?: string | undefined;
    }, {
        topic: string;
        threadType: string;
        instructions: string;
        type: "CREATE_THREAD";
        systemId: "threads";
        tags?: {
            name: string;
            id: string;
            color?: string | undefined;
        }[] | undefined;
        linkedThreads?: {
            id: string;
            relation: "parent_of" | "blocks" | "duplicates" | "blocked_by";
        }[] | undefined;
        parentThreadId?: string | undefined;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"VIEW_THREAD">;
        systemId: zod.ZodLiteral<"threads">;
        threadId: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        threadId: string;
        type: "VIEW_THREAD";
        systemId: "threads";
    }, {
        threadId: string;
        type: "VIEW_THREAD";
        systemId: "threads";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"UPDATE_THREAD_STATUS">;
        systemId: zod.ZodLiteral<"threads">;
        threadId: zod.ZodString;
        status: zod.ZodEnum<["backlog", "open", "in-progress", "in-review", "done"]>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        status: "backlog" | "open" | "in-progress" | "in-review" | "done";
        threadId: string;
        type: "UPDATE_THREAD_STATUS";
        systemId: "threads";
    }, {
        status: "backlog" | "open" | "in-progress" | "in-review" | "done";
        threadId: string;
        type: "UPDATE_THREAD_STATUS";
        systemId: "threads";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"UPDATE_THREAD_FIELD">;
        systemId: zod.ZodLiteral<"threads">;
        threadId: zod.ZodString;
        key: zod.ZodString;
        value: zod.ZodAny;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        threadId: string;
        type: "UPDATE_THREAD_FIELD";
        systemId: "threads";
        key: string;
        value?: any;
    }, {
        threadId: string;
        type: "UPDATE_THREAD_FIELD";
        systemId: "threads";
        key: string;
        value?: any;
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
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "CREATE_EDGE";
        systemId: "flows";
        flowId: string;
        sourceId: string;
        targetId: string;
    }, {
        type: "CREATE_EDGE";
        systemId: "flows";
        flowId: string;
        sourceId: string;
        targetId: string;
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
    }>] | readonly [zod.ZodObject<{
        type: zod.ZodLiteral<"EXECUTE_QUERY">;
        systemId: zod.ZodLiteral<"database">;
        code: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "EXECUTE_QUERY";
        systemId: "database";
        code: string;
    }, {
        type: "EXECUTE_QUERY";
        systemId: "database";
        code: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"EXECUTE_TRANSACTION">;
        systemId: zod.ZodLiteral<"database">;
        code: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "EXECUTE_TRANSACTION";
        systemId: "database";
        code: string;
    }, {
        type: "EXECUTE_TRANSACTION";
        systemId: "database";
        code: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"CREATE_SNAPSHOT">;
        systemId: zod.ZodLiteral<"database">;
        name: zod.ZodOptional<zod.ZodString>;
        excludeTypes: zod.ZodOptional<zod.ZodArray<zod.ZodString, "many">>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "CREATE_SNAPSHOT";
        systemId: "database";
        name?: string | undefined;
        excludeTypes?: string[] | undefined;
    }, {
        type: "CREATE_SNAPSHOT";
        systemId: "database";
        name?: string | undefined;
        excludeTypes?: string[] | undefined;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"GENERATE_MAGIC_PROMPT">;
        systemId: zod.ZodLiteral<"database">;
        prompt: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        prompt: string;
        type: "GENERATE_MAGIC_PROMPT";
        systemId: "database";
    }, {
        prompt: string;
        type: "GENERATE_MAGIC_PROMPT";
        systemId: "database";
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
        entityType: zod.ZodEnum<["general", "plugin"]>;
        label: zod.ZodString;
        path: zod.ZodArray<zod.ZodString, "many">;
        value: zod.ZodAny;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        entityType: "general" | "plugin";
        label: string;
        type: "UPDATE_SETTINGS";
        systemId: "settings";
        path: string[];
        value?: any;
    }, {
        entityType: "general" | "plugin";
        label: string;
        type: "UPDATE_SETTINGS";
        systemId: "settings";
        path: string[];
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
        input?: Record<string, any> | undefined;
        actionFn?: string | undefined;
        output?: any;
    }, {
        type: "UPDATE_ACTION";
        systemId: "actions";
        actionId: string;
        category?: string | undefined;
        label?: string | undefined;
        description?: string | undefined;
        input?: Record<string, any> | undefined;
        actionFn?: string | undefined;
        output?: any;
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
            type: zod.ZodLiteral<"text">;
            text: zod.ZodString;
        }, "strip", zod.ZodTypeAny, {
            text: string;
            type: "text";
        }, {
            text: string;
            type: "text";
        }>]>, "many">;
        tags: zod.ZodArray<zod.ZodString, "many">;
        collectionId: zod.ZodOptional<zod.ZodString>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        tags: string[];
        name: string;
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
            type: "text";
        })[];
        type: "CREATE_DOCUMENT";
        systemId: "library";
        collectionId?: string | undefined;
    }, {
        tags: string[];
        name: string;
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
            type: "text";
        })[];
        type: "CREATE_DOCUMENT";
        systemId: "library";
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
            type: zod.ZodLiteral<"text">;
            text: zod.ZodString;
        }, "strip", zod.ZodTypeAny, {
            text: string;
            type: "text";
        }, {
            text: string;
            type: "text";
        }>]>, "many">;
        tags: zod.ZodArray<zod.ZodString, "many">;
        collectionId: zod.ZodOptional<zod.ZodString>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        tags: string[];
        name: string;
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
            type: "text";
        })[];
        type: "UPDATE_DOCUMENT";
        systemId: "library";
        collectionId?: string | undefined;
    }, {
        tags: string[];
        name: string;
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
            type: "text";
        })[];
        type: "UPDATE_DOCUMENT";
        systemId: "library";
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
        name: string;
        type: "CREATE_COLLECTION";
        systemId: "library";
        description?: string | undefined;
        parentId?: string | undefined;
    }, {
        name: string;
        type: "CREATE_COLLECTION";
        systemId: "library";
        description?: string | undefined;
        parentId?: string | undefined;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"UPDATE_COLLECTION">;
        systemId: zod.ZodLiteral<"library">;
        id: zod.ZodString;
        name: zod.ZodString;
        description: zod.ZodOptional<zod.ZodString>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        name: string;
        id: string;
        type: "UPDATE_COLLECTION";
        systemId: "library";
        description?: string | undefined;
    }, {
        name: string;
        id: string;
        type: "UPDATE_COLLECTION";
        systemId: "library";
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
        name: string;
        id: string;
        type: "RENAME_ITEM";
        systemId: "library";
        itemType: "document" | "folder";
    }, {
        name: string;
        id: string;
        type: "RENAME_ITEM";
        systemId: "library";
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
        type: zod.ZodLiteral<"REORDER_ITEMS">;
        systemId: zod.ZodLiteral<"library">;
        itemIds: zod.ZodArray<zod.ZodString, "many">;
        targetIndex: zod.ZodNumber;
        targetFolderId: zod.ZodNullable<zod.ZodString>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "REORDER_ITEMS";
        systemId: "library";
        targetFolderId: string | null;
        itemIds: string[];
        targetIndex: number;
    }, {
        type: "REORDER_ITEMS";
        systemId: "library";
        targetFolderId: string | null;
        itemIds: string[];
        targetIndex: number;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"LIST_SEARCH_INDICES">;
        systemId: zod.ZodLiteral<"library">;
        folderId: zod.ZodNullable<zod.ZodString>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "LIST_SEARCH_INDICES";
        systemId: "library";
        folderId: string | null;
    }, {
        type: "LIST_SEARCH_INDICES";
        systemId: "library";
        folderId: string | null;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"CREATE_SEARCH_INDEX">;
        systemId: zod.ZodLiteral<"library">;
        config: zod.ZodObject<{
            name: zod.ZodString;
            description: zod.ZodString;
            embeddingModel: zod.ZodEnum<["minilm-l6-v2", "bge-small-en", "bge-small-en-v1.5", "bge-base-en", "bge-base-en-v1.5", "e5-large-multilingual", "text-embedding-3-small", "text-embedding-3-large"]>;
            indexMetric: zod.ZodEnum<["cosine", "dot_product"]>;
            connectors: zod.ZodNumber;
            excludeAllSubfolders: zod.ZodBoolean;
            excludedFolderIds: zod.ZodArray<zod.ZodString, "many">;
            excludedDocumentIds: zod.ZodArray<zod.ZodString, "many">;
            enableSectionIndexing: zod.ZodBoolean;
            segmentRules: zod.ZodArray<zod.ZodObject<{
                id: zod.ZodString;
                type: zod.ZodEnum<["text", "list", "field"]>;
                occurrence: zod.ZodString;
                key: zod.ZodOptional<zod.ZodString>;
                indexMode: zod.ZodEnum<["combined", "separate"]>;
            }, "strip", zod.ZodTypeAny, {
                id: string;
                type: "text" | "field" | "list";
                occurrence: string;
                indexMode: "combined" | "separate";
                key?: string | undefined;
            }, {
                id: string;
                type: "text" | "field" | "list";
                occurrence: string;
                indexMode: "combined" | "separate";
                key?: string | undefined;
            }>, "many">;
            constructTemplate: zod.ZodString;
        }, "strip", zod.ZodTypeAny, {
            name: string;
            description: string;
            embeddingModel: "minilm-l6-v2" | "bge-small-en" | "bge-small-en-v1.5" | "bge-base-en" | "bge-base-en-v1.5" | "e5-large-multilingual" | "text-embedding-3-small" | "text-embedding-3-large";
            indexMetric: "cosine" | "dot_product";
            connectors: number;
            excludeAllSubfolders: boolean;
            excludedFolderIds: string[];
            excludedDocumentIds: string[];
            enableSectionIndexing: boolean;
            segmentRules: {
                id: string;
                type: "text" | "field" | "list";
                occurrence: string;
                indexMode: "combined" | "separate";
                key?: string | undefined;
            }[];
            constructTemplate: string;
        }, {
            name: string;
            description: string;
            embeddingModel: "minilm-l6-v2" | "bge-small-en" | "bge-small-en-v1.5" | "bge-base-en" | "bge-base-en-v1.5" | "e5-large-multilingual" | "text-embedding-3-small" | "text-embedding-3-large";
            indexMetric: "cosine" | "dot_product";
            connectors: number;
            excludeAllSubfolders: boolean;
            excludedFolderIds: string[];
            excludedDocumentIds: string[];
            enableSectionIndexing: boolean;
            segmentRules: {
                id: string;
                type: "text" | "field" | "list";
                occurrence: string;
                indexMode: "combined" | "separate";
                key?: string | undefined;
            }[];
            constructTemplate: string;
        }>;
        folderId: zod.ZodNullable<zod.ZodString>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "CREATE_SEARCH_INDEX";
        systemId: "library";
        folderId: string | null;
        config: {
            name: string;
            description: string;
            embeddingModel: "minilm-l6-v2" | "bge-small-en" | "bge-small-en-v1.5" | "bge-base-en" | "bge-base-en-v1.5" | "e5-large-multilingual" | "text-embedding-3-small" | "text-embedding-3-large";
            indexMetric: "cosine" | "dot_product";
            connectors: number;
            excludeAllSubfolders: boolean;
            excludedFolderIds: string[];
            excludedDocumentIds: string[];
            enableSectionIndexing: boolean;
            segmentRules: {
                id: string;
                type: "text" | "field" | "list";
                occurrence: string;
                indexMode: "combined" | "separate";
                key?: string | undefined;
            }[];
            constructTemplate: string;
        };
    }, {
        type: "CREATE_SEARCH_INDEX";
        systemId: "library";
        folderId: string | null;
        config: {
            name: string;
            description: string;
            embeddingModel: "minilm-l6-v2" | "bge-small-en" | "bge-small-en-v1.5" | "bge-base-en" | "bge-base-en-v1.5" | "e5-large-multilingual" | "text-embedding-3-small" | "text-embedding-3-large";
            indexMetric: "cosine" | "dot_product";
            connectors: number;
            excludeAllSubfolders: boolean;
            excludedFolderIds: string[];
            excludedDocumentIds: string[];
            enableSectionIndexing: boolean;
            segmentRules: {
                id: string;
                type: "text" | "field" | "list";
                occurrence: string;
                indexMode: "combined" | "separate";
                key?: string | undefined;
            }[];
            constructTemplate: string;
        };
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"UPDATE_SEARCH_INDEX">;
        systemId: zod.ZodLiteral<"library">;
        id: zod.ZodString;
        config: zod.ZodObject<{
            name: zod.ZodString;
            description: zod.ZodString;
            embeddingModel: zod.ZodEnum<["minilm-l6-v2", "bge-small-en", "bge-small-en-v1.5", "bge-base-en", "bge-base-en-v1.5", "e5-large-multilingual", "text-embedding-3-small", "text-embedding-3-large"]>;
            indexMetric: zod.ZodEnum<["cosine", "dot_product"]>;
            connectors: zod.ZodNumber;
            excludeAllSubfolders: zod.ZodBoolean;
            excludedFolderIds: zod.ZodArray<zod.ZodString, "many">;
            excludedDocumentIds: zod.ZodArray<zod.ZodString, "many">;
            enableSectionIndexing: zod.ZodBoolean;
            segmentRules: zod.ZodArray<zod.ZodObject<{
                id: zod.ZodString;
                type: zod.ZodEnum<["text", "list", "field"]>;
                occurrence: zod.ZodString;
                key: zod.ZodOptional<zod.ZodString>;
                indexMode: zod.ZodEnum<["combined", "separate"]>;
            }, "strip", zod.ZodTypeAny, {
                id: string;
                type: "text" | "field" | "list";
                occurrence: string;
                indexMode: "combined" | "separate";
                key?: string | undefined;
            }, {
                id: string;
                type: "text" | "field" | "list";
                occurrence: string;
                indexMode: "combined" | "separate";
                key?: string | undefined;
            }>, "many">;
            constructTemplate: zod.ZodString;
        }, "strip", zod.ZodTypeAny, {
            name: string;
            description: string;
            embeddingModel: "minilm-l6-v2" | "bge-small-en" | "bge-small-en-v1.5" | "bge-base-en" | "bge-base-en-v1.5" | "e5-large-multilingual" | "text-embedding-3-small" | "text-embedding-3-large";
            indexMetric: "cosine" | "dot_product";
            connectors: number;
            excludeAllSubfolders: boolean;
            excludedFolderIds: string[];
            excludedDocumentIds: string[];
            enableSectionIndexing: boolean;
            segmentRules: {
                id: string;
                type: "text" | "field" | "list";
                occurrence: string;
                indexMode: "combined" | "separate";
                key?: string | undefined;
            }[];
            constructTemplate: string;
        }, {
            name: string;
            description: string;
            embeddingModel: "minilm-l6-v2" | "bge-small-en" | "bge-small-en-v1.5" | "bge-base-en" | "bge-base-en-v1.5" | "e5-large-multilingual" | "text-embedding-3-small" | "text-embedding-3-large";
            indexMetric: "cosine" | "dot_product";
            connectors: number;
            excludeAllSubfolders: boolean;
            excludedFolderIds: string[];
            excludedDocumentIds: string[];
            enableSectionIndexing: boolean;
            segmentRules: {
                id: string;
                type: "text" | "field" | "list";
                occurrence: string;
                indexMode: "combined" | "separate";
                key?: string | undefined;
            }[];
            constructTemplate: string;
        }>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        id: string;
        type: "UPDATE_SEARCH_INDEX";
        systemId: "library";
        config: {
            name: string;
            description: string;
            embeddingModel: "minilm-l6-v2" | "bge-small-en" | "bge-small-en-v1.5" | "bge-base-en" | "bge-base-en-v1.5" | "e5-large-multilingual" | "text-embedding-3-small" | "text-embedding-3-large";
            indexMetric: "cosine" | "dot_product";
            connectors: number;
            excludeAllSubfolders: boolean;
            excludedFolderIds: string[];
            excludedDocumentIds: string[];
            enableSectionIndexing: boolean;
            segmentRules: {
                id: string;
                type: "text" | "field" | "list";
                occurrence: string;
                indexMode: "combined" | "separate";
                key?: string | undefined;
            }[];
            constructTemplate: string;
        };
    }, {
        id: string;
        type: "UPDATE_SEARCH_INDEX";
        systemId: "library";
        config: {
            name: string;
            description: string;
            embeddingModel: "minilm-l6-v2" | "bge-small-en" | "bge-small-en-v1.5" | "bge-base-en" | "bge-base-en-v1.5" | "e5-large-multilingual" | "text-embedding-3-small" | "text-embedding-3-large";
            indexMetric: "cosine" | "dot_product";
            connectors: number;
            excludeAllSubfolders: boolean;
            excludedFolderIds: string[];
            excludedDocumentIds: string[];
            enableSectionIndexing: boolean;
            segmentRules: {
                id: string;
                type: "text" | "field" | "list";
                occurrence: string;
                indexMode: "combined" | "separate";
                key?: string | undefined;
            }[];
            constructTemplate: string;
        };
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"DELETE_SEARCH_INDEX">;
        systemId: zod.ZodLiteral<"library">;
        id: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        id: string;
        type: "DELETE_SEARCH_INDEX";
        systemId: "library";
    }, {
        id: string;
        type: "DELETE_SEARCH_INDEX";
        systemId: "library";
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"SEARCH_IN_INDEX">;
        systemId: zod.ZodLiteral<"library">;
        indexId: zod.ZodString;
        query: zod.ZodString;
        limit: zod.ZodOptional<zod.ZodNumber>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "SEARCH_IN_INDEX";
        systemId: "library";
        indexId: string;
        query: string;
        limit?: number | undefined;
    }, {
        type: "SEARCH_IN_INDEX";
        systemId: "library";
        indexId: string;
        query: string;
        limit?: number | undefined;
    }>] | readonly [zod.ZodObject<{
        type: zod.ZodLiteral<"explorer.LIST_FILES">;
        systemId: zod.ZodLiteral<"code">;
        path: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "explorer.LIST_FILES";
        systemId: "code";
        path: string;
    }, {
        type: "explorer.LIST_FILES";
        systemId: "code";
        path: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"explorer.READ_FILE">;
        systemId: zod.ZodLiteral<"code">;
        path: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "explorer.READ_FILE";
        systemId: "code";
        path: string;
    }, {
        type: "explorer.READ_FILE";
        systemId: "code";
        path: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"explorer.WRITE_FILE">;
        systemId: zod.ZodLiteral<"code">;
        path: zod.ZodString;
        content: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        content: string;
        type: "explorer.WRITE_FILE";
        systemId: "code";
        path: string;
    }, {
        content: string;
        type: "explorer.WRITE_FILE";
        systemId: "code";
        path: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"explorer.CREATE_FILE">;
        systemId: zod.ZodLiteral<"code">;
        path: zod.ZodString;
        content: zod.ZodOptional<zod.ZodString>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "explorer.CREATE_FILE";
        systemId: "code";
        path: string;
        content?: string | undefined;
    }, {
        type: "explorer.CREATE_FILE";
        systemId: "code";
        path: string;
        content?: string | undefined;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"explorer.DELETE_FILE">;
        systemId: zod.ZodLiteral<"code">;
        path: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "explorer.DELETE_FILE";
        systemId: "code";
        path: string;
    }, {
        type: "explorer.DELETE_FILE";
        systemId: "code";
        path: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"explorer.RENAME_FILE">;
        systemId: zod.ZodLiteral<"code">;
        oldPath: zod.ZodString;
        newPath: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "explorer.RENAME_FILE";
        systemId: "code";
        oldPath: string;
        newPath: string;
    }, {
        type: "explorer.RENAME_FILE";
        systemId: "code";
        oldPath: string;
        newPath: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"explorer.CREATE_DIRECTORY">;
        systemId: zod.ZodLiteral<"code">;
        path: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "explorer.CREATE_DIRECTORY";
        systemId: "code";
        path: string;
    }, {
        type: "explorer.CREATE_DIRECTORY";
        systemId: "code";
        path: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"explorer.GET_FILE_INFO">;
        systemId: zod.ZodLiteral<"code">;
        path: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "explorer.GET_FILE_INFO";
        systemId: "code";
        path: string;
    }, {
        type: "explorer.GET_FILE_INFO";
        systemId: "code";
        path: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"explorer.CLOSE_FILE">;
        systemId: zod.ZodLiteral<"code">;
        path: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "explorer.CLOSE_FILE";
        systemId: "code";
        path: string;
    }, {
        type: "explorer.CLOSE_FILE";
        systemId: "code";
        path: string;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"explorer.QUICK_OPEN_SEARCH">;
        systemId: zod.ZodLiteral<"code">;
        rootDirectory: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "explorer.QUICK_OPEN_SEARCH";
        systemId: "code";
        rootDirectory: string;
    }, {
        type: "explorer.QUICK_OPEN_SEARCH";
        systemId: "code";
        rootDirectory: string;
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
        type: "search.SEARCH_FILES";
        systemId: "code";
        path: string;
        query: string;
        includePattern?: string | undefined;
        excludePattern?: string | undefined;
        caseSensitive?: boolean | undefined;
        wholeWord?: boolean | undefined;
        useRegex?: boolean | undefined;
        maxResults?: number | undefined;
    }, {
        type: "search.SEARCH_FILES";
        systemId: "code";
        path: string;
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
        type: "commit.COMMIT";
        systemId: "code";
        message: string;
    }, {
        type: "commit.COMMIT";
        systemId: "code";
        message: string;
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
        type: "commit.REVERT_FILE";
        systemId: "code";
        path: string;
    }, {
        type: "commit.REVERT_FILE";
        systemId: "code";
        path: string;
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
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "pr.GET_BRANCH_DIFF";
        systemId: "code";
        baseBranch?: string | undefined;
    }, {
        type: "pr.GET_BRANCH_DIFF";
        systemId: "code";
        baseBranch?: string | undefined;
    }>, zod.ZodObject<{
        type: zod.ZodLiteral<"pr.GET_BRANCH_FILE_DIFF">;
        systemId: zod.ZodLiteral<"code">;
        path: zod.ZodString;
        baseBranch: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "pr.GET_BRANCH_FILE_DIFF";
        systemId: "code";
        path: string;
        baseBranch: string;
    }, {
        type: "pr.GET_BRANCH_FILE_DIFF";
        systemId: "code";
        path: string;
        baseBranch: string;
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
        type: zod.ZodLiteral<"codeActions.LIST">;
        systemId: zod.ZodLiteral<"code">;
        page: zod.ZodOptional<zod.ZodNumber>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "codeActions.LIST";
        systemId: "code";
        page?: number | undefined;
    }, {
        type: "codeActions.LIST";
        systemId: "code";
        page?: number | undefined;
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
        type: zod.ZodLiteral<"codePrompts.LIST">;
        systemId: zod.ZodLiteral<"code">;
        page: zod.ZodOptional<zod.ZodNumber>;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "codePrompts.LIST";
        systemId: "code";
        page?: number | undefined;
    }, {
        type: "codePrompts.LIST";
        systemId: "code";
        page?: number | undefined;
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
        type: zod.ZodLiteral<"SET_ROOT_DIRECTORY">;
        systemId: zod.ZodLiteral<"code">;
        path: zod.ZodString;
    }, zod.UnknownKeysParam, zod.ZodTypeAny, {
        type: "SET_ROOT_DIRECTORY";
        systemId: "code";
        path: string;
    }, {
        type: "SET_ROOT_DIRECTORY";
        systemId: "code";
        path: string;
    }>];
    readonly outgoing: {
        type: "AGENT_STARTUP";
        data: AgentStartupData;
        pluginId: "agent";
    } | {
        type: "REFRESH_RECENT_THREADS";
        data: RecentThreadRefreshData;
        pluginId: "agent";
    } | {
        type: "LOAD_CHAT_THREAD";
        data: AgentThreadData;
        pluginId: "agent";
    } | {
        type: "ARTIFACT_ADDED";
        tabId: string;
        artifact: any;
        pluginId: "agent";
    } | {
        type: "THREAD_TAB_REQUESTED";
        threadId: string;
        artifacts: any[];
        pluginId: "agent";
    } | {
        type: "AGENT_SETTINGS_UPDATED";
        settings: AgentSettings;
        pluginId: "agent";
    } | {
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
        type: "DEBUG_TOGGLED";
        enabled: boolean;
        pluginId: "brain";
    } | {
        type: "THREAD_STARTUP";
        data: ThreadStartupData;
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
        threadType?: ThreadEntity["threadType"] | undefined;
        instructions?: string | undefined;
        status?: ThreadEntity["status"] | undefined;
        pluginId: "threads";
    } | {
        type: "THREAD_STATUS_UPDATED";
        threadId: string;
        status: ThreadEntity["status"];
        pluginId: "threads";
    } | {
        type: "FLOWS_STARTUP";
        data: FlowsStartupData;
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
        type: "SNAPSHOT_CREATED";
        filename: string;
        pluginId: "database";
    } | {
        type: "SNAPSHOT_ERROR";
        error: string;
        pluginId: "database";
    } | {
        type: "MAGIC_PROMPT_GENERATED";
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
        type: "LOGS_STARTUP";
        logs: LogEntry[];
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
        type: "PROMPTS_STARTUP";
        data: PromptsStartupData;
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
        type: "SETTINGS_LOADED";
        data: SettingsData;
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
        hotkeys: SettingsData["general"]["hotkeys"];
        pluginId: "settings";
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
        type: "LIBRARY_STARTUP";
        data: {
            documents: DocumentDTO[];
            collections: CollectionDTO[];
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
        type: "ITEMS_REORDERED";
        data: {
            itemIds: string[];
            targetFolderId: string | null;
        };
        pluginId: "library";
    } | {
        type: "SEARCH_INDICES_LOADED";
        data: {
            indices: SearchIndex[];
        };
        pluginId: "library";
    } | {
        type: "SEARCH_INDEX_CREATED";
        data: {
            index: SearchIndex;
        };
        pluginId: "library";
    } | {
        type: "SEARCH_INDEX_UPDATED";
        data: {
            index: SearchIndex;
        };
        pluginId: "library";
    } | {
        type: "SEARCH_INDEX_DELETED";
        data: {
            indexId: string;
        };
        pluginId: "library";
    } | {
        type: "SEARCH_RESULTS";
        data: {
            results: any[];
        };
        pluginId: "library";
    } | {
        type: "INDEXING_PROGRESS";
        data: {
            indexId: string;
            progress: number;
            total: number;
        };
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
        type: "explorer.CURRENT_DIRECTORY";
        data: {
            path: string;
            rootDirectory: string;
        };
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
        };
        pluginId: "code";
    } | {
        type: "pr.FILE_DIFF_RECEIVED";
        data: GitDiff;
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
        type: "codeActions.ACTIONS_LISTED";
        data: {
            actions: ActionEntity[];
            page: number;
            totalPages: number;
            totalCount: number;
        };
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
        type: "CODE_STARTUP";
        data: CodeStartupData;
        pluginId: "code";
    } | {
        type: "CODE_SETTINGS_UPDATED";
        settings: CodeSettings;
        pluginId: "code";
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
interface DecisionNode extends NodeBase {
    nodeType: 'decision';
    conditions: Array<{
        expr: string;
        label?: string;
    }>;
    elseLabel?: string;
}
interface FireNode extends NodeBase {
    nodeType: 'fire';
    eventType: string;
    payload?: unknown;
    scope?: 'local' | 'global';
}
interface ListenNode extends NodeBase {
    nodeType: 'listen';
    mode: 'entry' | 'internal';
    eventType: string;
    debounceMs?: number;
    scope?: 'local' | 'global';
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
    actionId?: string;
    params?: Record<string, any>;
    fieldMappings?: Array<{
        target: string;
        source: string;
        default?: any;
    }>;
}
type NodeEntity = QueryNode | CreateNode | UpdateNode | ActionNode | DecisionNode | FireNode | ListenNode | TransformNode | FlowNode | KeepAliveNode | LLMNode;
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
    info?: {
        [key: string]: any;
    };
};
interface FlowsStartupData {
    selectedFlowId: EARS.EntityId;
    graph: {
        nodes: NodeEntity[];
        edges: EdgeEntity[];
    };
    flows: Partial<FlowEntity>[];
    rootFlow?: Partial<FlowEntity>;
    models: ModelConfig[];
    prompts: PromptEntity[];
    actions: ActionEntity[];
}
interface ModelConfig {
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

interface SettingsEntity extends BaseEntity {
    entityType: EARS.Entity.Settings;
    type: 'general' | 'plugin' | 'internal';
    label: string;
    data: any;
}
interface SettingsData {
    general: GeneralSettings;
    plugins: PluginSettings;
    internal: InternalSettings;
}
interface GeneralSettings {
    personal: PersonalInfo;
    apiKeys: ApiKeys;
    hotkeys: ApplicationHotkeys;
    misc: MiscSettings;
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
interface ApiKeys {
    google?: string;
    anthropic?: string;
    openai?: string;
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
interface MiscSettings {
}
interface PluginSettings {
    [pluginId: string]: any;
}
interface InternalSettings {
    hasOnboarded: boolean;
    lastInteractionTimestamp: number | null;
    version: string;
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
     * @param category - The general settings category (e.g., 'hotkeys', 'apiKeys')
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
    getSettingValue(type: 'general' | 'plugin' | 'internal', label: string, path: string[]): any;
}

interface DirectoryEntity {
    id: EARS.EntityId;
    entityType: EARS.Entity.Directory;
    path: string;
    label?: string;
    lastAccessedAt: number;
    createdAt: number;
    role?: 'lastOpened' | 'recent';
}

interface TerminalEntity {
    id: EARS.EntityId;
    entityType: EARS.Entity.Terminal;
    title: string;
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
 * Type-safe query helpers to eliminate repetitive type casting
 * These are simple wrappers around EARS query functions
 */
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
 * Type-safe transaction helpers for common operations
 */
declare function prepareEntity<T extends {
    entityType: EARS.Entity;
}>(entityType: EARS.Entity, data: Partial<T>, defaults?: Partial<T>): Omit<T, 'id'>;
declare function createEntityWithDefaults<T extends {
    entityType: EARS.Entity;
    shortCode?: string;
    label?: string;
}>(entityType: EARS.Entity, data: Partial<T>, prefix?: string): T & {
    id: EARS.EntityId;
};
declare function updateEntity(id: EARS.EntityId, updates: Record<string, any>): void;
declare function createRelation(sourceId: EARS.EntityId, relationType: EARS.RelKind, targetId: EARS.EntityId): void;
declare function removeRelation(sourceId: EARS.EntityId, relationType: EARS.RelKind, targetId?: EARS.EntityId): void;
declare function grantRole(entityId: EARS.EntityId, role: string): void;
declare function revokeRole(entityId: EARS.EntityId, role: string): void;

/**
 * Common repository types for consistent return values and error handling
 */
type RepositoryResult<T> = {
    success: true;
    data: T;
} | {
    success: false;
    error: string;
    code?: string;
};
type OperationResult = RepositoryResult<void>;

declare class LibraryService {
    getById(id: EARS.EntityId): Promise<DocumentDTO | undefined>;
    getDocByCode(shortCode: string): Promise<DocumentDTO | undefined>;
    getByName(name: string): Promise<DocumentDTO | undefined>;
    getWithinFolder(folderName: string): Promise<DocumentDTO[]>;
}

declare class ActionService {
    getById(id: EARS.EntityId): Promise<ActionEntity | undefined>;
    getByLabel(label: string): Promise<ActionEntity | undefined>;
    getByCategory(category: string): Promise<ActionEntity[]>;
    executeAction(actionFn: string, params?: Record<string, any>): Promise<any>;
    getAndExecute(label: string, params?: Record<string, any>): Promise<any | undefined>;
}

declare class PromptService {
    getByLabel(label: string): Promise<PromptEntity | undefined>;
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
    usePrompt(label: string, templateParams: Record<string, any>): Promise<string | undefined>;
}

declare const providers: {
    readonly anthropic: _ai_sdk_anthropic.AnthropicProvider;
    readonly openai: _ai_sdk_openai.OpenAIProvider;
};
type Provider = keyof typeof providers;
type ModelConfig = {
    provider: Provider;
    model: string;
};
declare function streamText(params: {
    model: ModelConfig;
    prompt?: string;
    messages?: CoreMessage[];
    system?: string;
    temperature?: number;
    maxTokens?: number;
}): Promise<ai.StreamTextResult<ai.ToolSet, never>>;
declare function generateText(params: {
    model: ModelConfig;
    prompt?: string;
    messages?: CoreMessage[];
    system?: string;
    temperature?: number;
    maxTokens?: number;
}): Promise<ai.GenerateTextResult<ai.ToolSet, never>>;
declare function streamObject<T>(params: {
    model: ModelConfig;
    schema: any;
    prompt?: string;
    messages?: CoreMessage[];
    system?: string;
    temperature?: number;
    maxTokens?: number;
}): Promise<ai.StreamObjectResult<ai.DeepPartial<T>, T, never>>;
declare function generateObject<T>(params: {
    model: ModelConfig;
    schema: any;
    prompt?: string;
    messages?: CoreMessage[];
    system?: string;
    temperature?: number;
    maxTokens?: number;
}): Promise<ai.GenerateObjectResult<T>>;

const llm = /*#__PURE__*/Object.freeze({
  __proto__: null,
  CoreMessage: CoreMessage,
  ModelConfig: ModelConfig,
  Provider: Provider,
  generateObject: generateObject,
  generateText: generateText,
  streamObject: streamObject,
  streamText: streamText
});

/**
 * Emit an event to a frontend plugin
 * @param pluginId - The target plugin ID (or 'application' for main plugin)
 * @param event - The event to emit (without pluginId)
 * @example
 * sendToPlugin('agent', {
 *   type: 'TOKEN_STREAM',
 *   token: 'Hello'
 * });
 */
declare function sendToPlugin<T extends OutgoingSystemEvents>(pluginId: string, event: Omit<T, 'pluginId'>): void;
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

const emitter = /*#__PURE__*/Object.freeze({
  __proto__: null,
  onIncoming: onIncoming,
  onOutgoing: onOutgoing,
  sendToPlugin: sendToPlugin,
  sendToSystem: sendToSystem
});

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
        readonly items: (`Agent-${string}` | `Brain-${string}` | `Message-${string}` | `Thread-${string}` | `Tag-${string}` | `Relation-${string}` | `Artifact-${string}` | `Flow-${string}` | `Node-${string}` | `TNode-${string}` | `Prompt-${string}` | `Action-${string}` | `Document-${string}` | `Collection-${string}` | `SearchIndex-${string}` | `Terminal-${string}` | `Directory-${string}` | `Settings-${string}` | `FAQ-${string}`)[];
        readonly nextCursor: string | null;
    };
    readonly distinct: (field?: string) => /*elided*/ any;
    readonly groupBy: (field: string) => Map<unknown, /*elided*/ any>;
    readonly ids: () => (`Agent-${string}` | `Brain-${string}` | `Message-${string}` | `Thread-${string}` | `Tag-${string}` | `Relation-${string}` | `Artifact-${string}` | `Flow-${string}` | `Node-${string}` | `TNode-${string}` | `Prompt-${string}` | `Action-${string}` | `Document-${string}` | `Collection-${string}` | `SearchIndex-${string}` | `Terminal-${string}` | `Directory-${string}` | `Settings-${string}` | `FAQ-${string}`)[];
    readonly id: () => `Agent-${string}` | `Brain-${string}` | `Message-${string}` | `Thread-${string}` | `Tag-${string}` | `Relation-${string}` | `Artifact-${string}` | `Flow-${string}` | `Node-${string}` | `TNode-${string}` | `Prompt-${string}` | `Action-${string}` | `Document-${string}` | `Collection-${string}` | `SearchIndex-${string}` | `Terminal-${string}` | `Directory-${string}` | `Settings-${string}` | `FAQ-${string}`;
    readonly count: () => number;
    readonly first: () => `Agent-${string}` | `Brain-${string}` | `Message-${string}` | `Thread-${string}` | `Tag-${string}` | `Relation-${string}` | `Artifact-${string}` | `Flow-${string}` | `Node-${string}` | `TNode-${string}` | `Prompt-${string}` | `Action-${string}` | `Document-${string}` | `Collection-${string}` | `SearchIndex-${string}` | `Terminal-${string}` | `Directory-${string}` | `Settings-${string}` | `FAQ-${string}`;
    readonly last: () => `Agent-${string}` | `Brain-${string}` | `Message-${string}` | `Thread-${string}` | `Tag-${string}` | `Relation-${string}` | `Artifact-${string}` | `Flow-${string}` | `Node-${string}` | `TNode-${string}` | `Prompt-${string}` | `Action-${string}` | `Document-${string}` | `Collection-${string}` | `SearchIndex-${string}` | `Terminal-${string}` | `Directory-${string}` | `Settings-${string}` | `FAQ-${string}` | null;
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
            readonly items: (`Agent-${string}` | `Brain-${string}` | `Message-${string}` | `Thread-${string}` | `Tag-${string}` | `Relation-${string}` | `Artifact-${string}` | `Flow-${string}` | `Node-${string}` | `TNode-${string}` | `Prompt-${string}` | `Action-${string}` | `Document-${string}` | `Collection-${string}` | `SearchIndex-${string}` | `Terminal-${string}` | `Directory-${string}` | `Settings-${string}` | `FAQ-${string}`)[];
            readonly nextCursor: string | null;
        };
        readonly distinct: (field?: string) => /*elided*/ any;
        readonly groupBy: (field: string) => Map<unknown, /*elided*/ any>;
        readonly ids: () => (`Agent-${string}` | `Brain-${string}` | `Message-${string}` | `Thread-${string}` | `Tag-${string}` | `Relation-${string}` | `Artifact-${string}` | `Flow-${string}` | `Node-${string}` | `TNode-${string}` | `Prompt-${string}` | `Action-${string}` | `Document-${string}` | `Collection-${string}` | `SearchIndex-${string}` | `Terminal-${string}` | `Directory-${string}` | `Settings-${string}` | `FAQ-${string}`)[];
        readonly id: () => `Agent-${string}` | `Brain-${string}` | `Message-${string}` | `Thread-${string}` | `Tag-${string}` | `Relation-${string}` | `Artifact-${string}` | `Flow-${string}` | `Node-${string}` | `TNode-${string}` | `Prompt-${string}` | `Action-${string}` | `Document-${string}` | `Collection-${string}` | `SearchIndex-${string}` | `Terminal-${string}` | `Directory-${string}` | `Settings-${string}` | `FAQ-${string}`;
        readonly count: () => number;
        readonly first: () => `Agent-${string}` | `Brain-${string}` | `Message-${string}` | `Thread-${string}` | `Tag-${string}` | `Relation-${string}` | `Artifact-${string}` | `Flow-${string}` | `Node-${string}` | `TNode-${string}` | `Prompt-${string}` | `Action-${string}` | `Document-${string}` | `Collection-${string}` | `SearchIndex-${string}` | `Terminal-${string}` | `Directory-${string}` | `Settings-${string}` | `FAQ-${string}`;
        readonly last: () => `Agent-${string}` | `Brain-${string}` | `Message-${string}` | `Thread-${string}` | `Tag-${string}` | `Relation-${string}` | `Artifact-${string}` | `Flow-${string}` | `Node-${string}` | `TNode-${string}` | `Prompt-${string}` | `Action-${string}` | `Document-${string}` | `Collection-${string}` | `SearchIndex-${string}` | `Terminal-${string}` | `Directory-${string}` | `Settings-${string}` | `FAQ-${string}` | null;
        readonly exists: () => boolean;
        readonly map: <T>(fn: (i: EARS.EntityId) => T) => T[];
        readonly forEach: /*elided*/ any;
        readonly reduce: <T>(fn: (a: T, i: EARS.EntityId) => T, init: T) => T;
    };
    readonly reduce: <T>(fn: (a: T, i: EARS.EntityId) => T, init: T) => T;
};

/**
 * Database Service
 *
 * Centralized service that provides access to all database operations
 * including EARS transaction and query utilities.
 */

const database = /*#__PURE__*/Object.freeze({
  __proto__: null,
  EARS: EARS,
  SafeLinkOptions: SafeLinkOptions,
  countEntities: countEntities,
  createEntityWithDefaults: createEntityWithDefaults,
  createRelation: createRelation,
  exists: exists,
  findAll: findAll,
  findById: findById,
  findByIdWithFields: findByIdWithFields,
  findFirst: findFirst,
  findFirstWithRole: findFirstWithRole,
  findWhere: findWhere,
  findWithFields: findWithFields,
  findWithRole: findWithRole,
  grantRole: grantRole,
  prepareEntity: prepareEntity,
  qx: qx,
  removeRelation: removeRelation,
  revokeRole: revokeRole,
  tx: tx,
  updateEntity: updateEntity
});

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
    waitForSelector(selector: string, timeout?: number): Promise<ElementHandle<Element> | null>;
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

const browser = /*#__PURE__*/Object.freeze({
  __proto__: null,
  Browser: Browser,
  BrowserContext: BrowserContext,
  BrowserService: BrowserService,
  LaunchOptions: LaunchOptions,
  Page: Page,
  chromium: chromium,
  createBrowser: createBrowser,
  firefox: firefox,
  webkit: webkit
});

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
            readonly startupData: (page?: number) => {
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
            }) => RepositoryResult<ActionEntity>;
            readonly update: (id: EARS.EntityId, updates: {
                label?: string;
                description?: string;
                category?: string;
                input?: Record<string, any>;
                actionFn?: string;
                output?: any;
            }) => OperationResult;
            readonly delete: (id: EARS.EntityId) => OperationResult;
        };
        readonly agentQueries: {
            readonly threadArtifacts: (threadId: EARS.EntityId) => {
                id: `Agent-${string}` | `Brain-${string}` | `Message-${string}` | `Thread-${string}` | `Tag-${string}` | `Relation-${string}` | `Artifact-${string}` | `Flow-${string}` | `Node-${string}` | `TNode-${string}` | `Prompt-${string}` | `Action-${string}` | `Document-${string}` | `Collection-${string}` | `SearchIndex-${string}` | `Terminal-${string}` | `Directory-${string}` | `Settings-${string}` | `FAQ-${string}`;
                type: unknown;
                title: unknown;
                content: unknown;
            }[];
            readonly threadData: (threadId: EARS.EntityId) => AgentThreadData;
            readonly refreshThreadsData: () => RecentThreadRefreshData;
            readonly startupData: () => AgentStartupData;
        };
        readonly agentCommands: {
            readonly addMessage: (params: {
                threadId: EARS.EntityId;
                text: string;
                sender: "user" | "assistant" | "system";
            }) => RepositoryResult<{
                id: EARS.EntityId;
                threadId: EARS.EntityId;
                text: string;
                sender: string;
                timestamp: number;
            }>;
        };
        readonly brainQueries: {
            readonly rootFlowTNode: () => EARS.EntityId | undefined;
            readonly tNodeById: (id: EARS.EntityId) => TNodeEntity | null;
            readonly flowEventNodes: (flowId: EARS.EntityId) => ListenNode[];
            readonly eventFirstStep: (eventNodeId: EARS.EntityId) => NodeEntity | undefined;
            readonly nextNodeInFlowTrack: (nodeId: EARS.EntityId) => NodeEntity;
            readonly eventTracks: (flowTNodeId: EARS.EntityId) => TrackEntity[];
            readonly possibleEvents: (flowTNodeId: EARS.EntityId) => EventListenerEntity[];
            readonly extendedTNodeData: (tNodeId: EARS.EntityId) => FlowTNodeData;
            readonly rootData: () => FlowTNodeData;
        };
        readonly brainCommands: {
            readonly createEventTNode: (eventNode: ListenNode, flowTNodeId: EARS.EntityId) => TNodeEntity;
            readonly createFlowTNode: (flowStepId: EARS.EntityId, eventTrackId?: EARS.EntityId, executionContext?: ExecutionContext) => {
                flowTNode: TNodeEntity;
                eventNodes: ListenNode[];
            };
            readonly createStepTNode: (stepId: EARS.EntityId, eventTrackId: EARS.EntityId, executionContext?: ExecutionContext) => {
                tNode: TNodeEntity;
                step: NodeEntity;
            };
            readonly createRootFlowTNode: () => {
                rootFlow: FlowEntity;
                rootFlowTNode: TNodeEntity;
                eventNodes: ListenNode[];
                entryNode: ListenNode;
            };
            readonly updateTNodeStatus: (tNodeId: EARS.EntityId, status: TNodeEntity["status"]) => void;
            readonly updateTNodeResult: (tNodeId: EARS.EntityId, result: any) => void;
            readonly updateTNodeAttributes: (tNodeId: EARS.EntityId, attributes: any) => void;
        };
        readonly flowsQueries: {
            readonly rootFlow: () => EARS.EntityId | undefined;
            readonly getNodeActionId: (nodeId: EARS.EntityId) => EARS.EntityId | undefined;
            readonly node: (nodeId: EARS.EntityId) => NodeEntity | undefined;
            readonly flowNodes: (flowId: EARS.EntityId) => NodeEntity[];
            readonly flowEdges: (flowId: EARS.EntityId) => EdgeEntity[];
            readonly extendedData: (flowId: EARS.EntityId, include?: keyof FlowExtendedData | (keyof FlowExtendedData)[]) => FlowExtendedData;
            readonly startupData: () => FlowsStartupData;
        };
        readonly flowsCommands: {
            readonly createFlow: (flow?: Partial<FlowEntity>) => RepositoryResult<FlowEntity>;
            readonly createFlowWithEntryNode: (flow?: Partial<FlowEntity>) => RepositoryResult<{
                flow: FlowEntity;
                entryNode: NodeEntity;
            }>;
            readonly createNode: (flowId: EARS.EntityId, nodeData: NodeCreateInput) => RepositoryResult<NodeEntity>;
            readonly createEdge: (sourceId: EARS.EntityId, targetId: EARS.EntityId) => RepositoryResult<{
                relId: EARS.EntityId;
            }>;
            readonly updateFlowLabel: (flowId: EARS.EntityId, label: string) => OperationResult;
            readonly updateNode: (nodeId: EARS.EntityId, updates: NodeCreateInput) => OperationResult;
            readonly deleteNode: (nodeId: EARS.EntityId) => OperationResult;
            readonly deleteEdge: (edgeId: EARS.EntityId) => OperationResult;
            readonly updateEdge: (edgeId: EARS.EntityId, oldSource: EARS.EntityId, oldTarget: EARS.EntityId, newSource: EARS.EntityId, newTarget: EARS.EntityId) => RepositoryResult<{
                newRelId: EARS.EntityId;
            }>;
        };
        readonly libraryQueries: {
            readonly getDocuments: (collectionId?: string) => DocumentDTO[];
            readonly getDocument: (id: EARS.EntityId) => DocumentDTO | null;
            readonly getDocumentByShortCode: (shortCode: DocumentShortCode) => DocumentDTO | null;
            readonly getCollections: () => CollectionDTO[];
            readonly getFolderContents: (folderId: EARS.EntityId | null) => FolderContents;
            readonly getFolderPath: (folderId: EARS.EntityId | null) => BreadcrumbItem[];
            readonly getParentFolderId: (folderId: EARS.EntityId) => EARS.EntityId | null;
            readonly getCollectionByName: (name: string) => CollectionDTO | null;
            readonly getDocumentsInCollection: (collectionId: EARS.EntityId) => DocumentDTO[];
        };
        readonly libraryCommands: {
            readonly createDocument: (name: string, content: ContentSection[], tags: string[], collectionId?: EARS.EntityId) => DocumentDTO;
            readonly updateDocument: (id: EARS.EntityId, name: string, content: ContentSection[], tags: string[], collectionId?: EARS.EntityId) => DocumentDTO;
            readonly deleteDocument: (id: EARS.EntityId) => void;
            readonly createCollection: (name: string, description?: string, parentId?: EARS.EntityId) => CollectionDTO;
            readonly updateCollection: (id: EARS.EntityId, name: string, description?: string) => CollectionDTO;
            readonly deleteCollection: (id: EARS.EntityId) => void;
            readonly moveDocument: (documentId: EARS.EntityId, newCollectionId?: EARS.EntityId) => DocumentDTO;
            readonly renameItem: (id: EARS.EntityId, name: string, type: "document" | "folder") => LibraryItem;
            readonly deleteItems: (ids: EARS.EntityId[]) => void;
            readonly moveItems: (ids: EARS.EntityId[], targetFolderId: EARS.EntityId | null) => void;
            readonly reorderItems: (itemIds: EARS.EntityId[], targetIndex: number, targetFolderId: EARS.EntityId | null) => void;
            readonly migrateDocumentShortCodes: () => void;
            readonly migrateDisplayOrders: () => void;
        };
        readonly promptQueries: {
            byId: (id: EARS.EntityId) => PromptEntity | undefined;
            all: () => PromptEntity[];
            byLabel: (label: string) => PromptEntity | undefined;
            startupData: (page?: number, pageSize?: number) => {
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
            }) => RepositoryResult<PromptEntity>;
            update: (id: EARS.EntityId, updates: {
                label?: string;
                description?: string;
                templateFn?: string;
                inputs?: Record<string, any>;
            }) => OperationResult;
            delete: (id: EARS.EntityId) => OperationResult;
        };
        readonly settingsQueries: {
            getAllSettings: () => SettingsEntity[];
            getSettings: () => SettingsData;
            getGeneralSettings: () => SettingsData["general"];
            getPluginSettings: (pluginId: string) => any;
            getInternalSettings: () => any;
            getSettingsByLabel: (type: "general" | "plugin" | "internal", label: string) => SettingsEntity | null;
        };
        readonly settingsCommands: {
            updateSettings(type: "general" | "plugin" | "internal", label: string, path: string[], value: any): SettingsEntity;
            resetSettings: () => void;
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
            updatePid: (id: EARS.EntityId, pid: number) => void;
            markClosed: (id: EARS.EntityId) => void;
            delete: (id: EARS.EntityId) => void;
        };
        readonly directoryQueries: {
            getLastOpenedDirectory: () => DirectoryEntity | undefined;
            getRecentDirectories: (limit?: number) => DirectoryEntity[];
            findByPath: (path: string) => DirectoryEntity | undefined;
        };
        readonly directoryCommands: {
            saveDirectory: (path: string, label?: string) => EARS.EntityId;
            markAsLastOpened: (path: string) => void;
            clearAll: () => void;
        };
        readonly threadQueries: {
            readonly byId: (id: EARS.EntityId) => ThreadEntity | undefined;
            readonly all: () => ThreadEntity[];
            readonly allByRecency: () => ThreadEntity[];
            readonly messages: (threadId: EARS.EntityId) => Partial<MessageEntity>[];
            readonly tags: (threadId: EARS.EntityId) => ThreadTagItem[];
            readonly linkedThreads: (threadId: EARS.EntityId) => any[];
            readonly extendedData: (threadId: EARS.EntityId, include?: keyof ThreadExtendedData | (keyof ThreadExtendedData)[]) => ThreadExtendedData;
            readonly startupData: () => ThreadStartupData;
        };
        readonly threadCommands: {
            readonly create: (input: ThreadCreateData) => RepositoryResult<{
                id: EARS.EntityId;
                shortCode: string;
                timestamp: number;
            }>;
            readonly update: (id: EARS.EntityId, updates: {
                topic?: string;
                instructions?: string;
                status?: ThreadEntity["status"];
                tags?: ThreadTagItem[];
                linkedThreads?: any[];
            }) => OperationResult;
            readonly createTag: (name: string) => RepositoryResult<EARS.EntityId>;
        };
    };
    settings: SettingsService;
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

export { ActionService, LibraryService, PromptService, params, services };
export type { ActionEntity, ActionParams, Services };

}
