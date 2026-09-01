import { z } from 'zod';

declare namespace EARS {
    const Entity: {
        readonly Relation: "Relation";
    };
    type Entity = typeof Entity[keyof typeof Entity] | (string & {});
    type EntityId<E extends string = string> = `${string}-${string}` & {
        readonly __entity?: E;
    };
    const RelKind: {
        readonly Custom: <T extends string>(k: T) => T & RelKind;
    };
    type RelKind = string & {};
    interface RelationDetail {
        sourceEntity: EntityId;
        targetEntity: EntityId;
        relationType: RelKind;
        info?: AttributeValue;
    }
    const RoleKind: {
        readonly Custom: <T extends string>(k: T) => T & RoleKind;
    };
    type RoleKind = string & {};
    const AttrKindValues: {
        readonly Role: "role";
        readonly RelationDetails: "relationDetails";
    };
    const AttrKind: {
        readonly Custom: <T extends string>(k: T) => T & AttrKind;
        readonly Role: "role";
        readonly RelationDetails: "relationDetails";
    };
    type AttrKind = typeof AttrKindValues[keyof typeof AttrKindValues] | (string & {});
    interface AttributePayloads {
        [AttrKindValues.Role]: RoleKind;
        [AttrKindValues.RelationDetails]: RelationDetail;
        [key: string]: any;
    }
    type AttributeValue<K extends AttrKind = AttrKind> = K extends keyof AttributePayloads ? AttributePayloads[K] : any;
    type AttributeTypeMap = Record<EntityId, AttributeValue[]>;
    type AttributeType = AttrKind;
    type AttributeStore = Record<string, AttributeTypeMap>;
    type Blueprint = {
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
}

declare namespace EARS {
    namespace Entity {
        const Relation = "Relation";
        type Relation = typeof Relation;
        const Agent = "Agent";
        type Agent = typeof Agent;
        const Thread = "Thread";
        type Thread = typeof Thread;
        const Message = "Message";
        type Message = typeof Message;
        const Artifact = "Artifact";
        type Artifact = typeof Artifact;
        const Brain = "Brain";
        type Brain = typeof Brain;
        const Flow = "Flow";
        type Flow = typeof Flow;
        const Node = "Node";
        type Node = typeof Node;
        const TNode = "TNode";
        type TNode = typeof TNode;
        const Document = "Document";
        type Document = typeof Document;
        const Collection = "Collection";
        type Collection = typeof Collection;
        const SearchIndex = "SearchIndex";
        type SearchIndex = typeof SearchIndex;
        const IndexedDoc = "IndexedDoc";
        type IndexedDoc = typeof IndexedDoc;
        const Terminal = "Terminal";
        type Terminal = typeof Terminal;
        const Directory = "Directory";
        type Directory = typeof Directory;
        const Settings = "Settings";
        type Settings = typeof Settings;
        const Secret = "Secret";
        type Secret = typeof Secret;
        const FAQ = "FAQ";
        type FAQ = typeof FAQ;
        const CalendarEvent = "CalendarEvent";
        type CalendarEvent = typeof CalendarEvent;
        const BrowserTab = "BrowserTab";
        type BrowserTab = typeof BrowserTab;
        const BrowserBookmark = "BrowserBookmark";
        type BrowserBookmark = typeof BrowserBookmark;
        const Note = "Note";
        type Note = typeof Note;
        const Action = "Action";
        type Action = typeof Action;
        const Prompt = "Prompt";
        type Prompt = typeof Prompt;
    }
    type Entity = Entity.Relation | Entity.Agent | Entity.Thread | Entity.Message | Entity.Artifact | Entity.Brain | Entity.Flow | Entity.Node | Entity.TNode | Entity.Document | Entity.Collection | Entity.SearchIndex | Entity.IndexedDoc | Entity.Terminal | Entity.Directory | Entity.Settings | Entity.Secret | Entity.FAQ | Entity.CalendarEvent | Entity.BrowserTab | Entity.BrowserBookmark | Entity.Note | Entity.Action | Entity.Prompt;
    type EntityId<E extends string = string> = EARS.EntityId<E>;
    namespace RelKind {
        const PARENT_OF = "parent_of";
        type PARENT_OF = typeof PARENT_OF;
        const CONTAINS = "contains";
        type CONTAINS = typeof CONTAINS;
        const REPLIED_TO = "replied_to";
        type REPLIED_TO = typeof REPLIED_TO;
        const HAS = "has";
        type HAS = typeof HAS;
        const BLOCKS = "blocks";
        type BLOCKS = typeof BLOCKS;
        const DEPENDS_ON = "depends_on";
        type DEPENDS_ON = typeof DEPENDS_ON;
        const RELATES_TO = "relates_to";
        type RELATES_TO = typeof RELATES_TO;
        const DUPLICATES = "duplicates";
        type DUPLICATES = typeof DUPLICATES;
        const TRANSITIONS_TO = "transitions_to";
        type TRANSITIONS_TO = typeof TRANSITIONS_TO;
        const EMITS = "emits";
        type EMITS = typeof EMITS;
        const INSTANCE_OF = "instance_of";
        type INSTANCE_OF = typeof INSTANCE_OF;
        const SPAWNED = "spawned";
        type SPAWNED = typeof SPAWNED;
        const TRACKED = "tracked";
        type TRACKED = typeof TRACKED;
        const Custom: <T extends string>(k: T) => T & RelKind;
    }
    type RelKind = RelKind.PARENT_OF | RelKind.CONTAINS | RelKind.REPLIED_TO | RelKind.HAS | RelKind.BLOCKS | RelKind.DEPENDS_ON | RelKind.RELATES_TO | RelKind.DUPLICATES | RelKind.TRANSITIONS_TO | RelKind.EMITS | RelKind.INSTANCE_OF | RelKind.SPAWNED | RelKind.TRACKED | (string & {});
    namespace RoleKind {
        const Custom: <T extends string>(k: T) => T & RoleKind;
    }
    type RoleKind = EARS.RoleKind;
    const AttrKindValues: {
        readonly Role: "role";
        readonly RelationDetails: "relationDetails";
    };
    namespace AttrKind {
        const Role = "role";
        type Role = typeof Role;
        const RelationDetails = "relationDetails";
        type RelationDetails = typeof RelationDetails;
        const Custom: <T extends string>(k: T) => T & AttrKind;
    }
    type AttrKind = EARS.AttrKind;
    type Blueprint = EARS.Blueprint;
    type RelationDetail = EARS.RelationDetail;
    type AttributePayloads = EARS.AttributePayloads;
    type AttributeValue<K extends AttrKind = AttrKind> = EARS.AttributeValue<K>;
    type AttributeTypeMap = EARS.AttributeTypeMap;
    type AttributeStore = EARS.AttributeStore;
}
interface BaseEntity {
    id: EARS.EntityId;
    entityType: EARS.Entity;
    createdAt: number;
    updatedAt?: number;
}

/** ── Shared aliases ─────────────────────────────────────────────────────── */
type TimestampMs = number;
type EntityStatus = 'active' | 'paused' | 'completed' | 'failed';
type TNodeKind = 'flow' | 'event' | 'step';
type JsonPath = string;
/** ── Core entities ──────────────────────────────────────────────────────── */
interface TNodeEntity extends BaseEntity {
    entityType: EARS.Entity.TNode;
    tNodeType: TNodeKind;
    label: string;
    status: EntityStatus;
    startedAt: TimestampMs;
    completedAt?: TimestampMs;
    eventType?: string;
    triggerType?: 'listener' | 'schedule';
    cronExpression?: string;
    stepNodeType?: string;
    final?: boolean;
    nodeAttributes?: Record<string, unknown>;
    resolvedParams?: Record<string, unknown>;
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
    triggerType: 'listener' | 'schedule';
    scope?: 'global' | 'local' | 'entry';
    cronExpression?: string;
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
interface BrainRuntimeError {
    errorId: string;
    message: string;
    stack?: string;
    source: string;
    phase: string;
    flowTNodeId?: EARS.EntityId;
    eventTNodeId?: EARS.EntityId;
    tNodeId?: EARS.EntityId;
    nodeId?: EARS.EntityId;
    nodeLabel?: string;
    nodeType?: string;
    actionId?: EARS.EntityId;
    actionLabel?: string;
    eventType?: string;
    timestamp: TimestampMs;
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
/** ── Schema definition types ────────────────────────────────────────────── */
interface FieldSchema {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any';
    description?: string;
    required?: boolean;
    properties?: Record<string, FieldSchema>;
    items?: FieldSchema;
}
interface EventSchema {
    eventType: string;
    description?: string;
    fields: Record<string, FieldSchema>;
}
interface StepOutputSchema {
    stepId: string;
    stepLabel: string;
    description?: string;
    fields: Record<string, FieldSchema>;
}
/** ── Typed context paths (constants unchanged) ──────────────────────────── */
declare const ContextPaths: {
    readonly EVENT_TYPE: "$.event.type";
    readonly EVENT_DATA: "$.event.data";
    readonly EVENT_TIMESTAMP: "$.event.timestamp";
    readonly EVENT_MESSAGE: "$.event.data.message";
    readonly EVENT_PAYLOAD: "$.event.data.payload";
    readonly EVENT_TEXT: "$.event.data.text";
    readonly EVENT_USER_ID: "$.event.data.userId";
    readonly LAST_STEP: "$.lastStep";
    readonly LAST_STEP_RESULT: "$.lastStep.result";
    readonly STEPS: "$.steps";
    readonly stepById: (tNodeId: string) => JsonPath;
    readonly stepByLabel: (label: string) => JsonPath;
};
/** ── Field mapping ─────────────────────────────────────────────────────── */
type SourceResolver = JsonPath | ((ctx: ExecutionContext) => unknown);
interface FieldMapping {
    target: string;
    source: SourceResolver;
    default?: unknown;
}
interface EventReceived {
    eventType: string;
    payload?: unknown;
}

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
    openLinksInApp: boolean;
}
interface Project {
    name: string;
    directories: string[];
    color: string;
}
interface PluginVisibilitySettings {
    [pluginId: string]: boolean;
}
interface DatabaseSettings {
    hotkeys: {
        executeQuery?: KeyboardShortcut;
    };
}
interface Category {
    name: string;
    color: string;
}
interface PromptsSettings {
    categories: Category[];
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
    skipArchiveConfirm?: boolean;
    chat?: AgentSettings;
}
interface ActionsSettings {
    categories: Category[];
}
interface FlowsSettings {
    rootFlowId?: string;
    enableFlowPreview?: boolean;
}
interface BrainSettings {
    runningRootFlowId?: string;
    inspectEnabled?: boolean;
}
interface NotesSettings {
    tasklistPanelPosition: 'left' | 'right';
    showCollapseIcon: boolean;
}
interface BrowserSettings {
    showBookmarksBar: boolean;
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
    hasOnboarded: boolean;
    lastInteractionTimestamp: number | null;
    version: string;
    seedHash: string | null;
    packSeedHashes?: Record<string, string>;
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
interface SettingsEntity extends BaseEntity {
    entityType: EARS.Entity.Settings;
    name: string;
    data: any;
    type?: SETTINGS_SCOPE;
    label?: string;
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
interface SeedCounts {
    created: number;
    updated: number;
    skipped: number;
}

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
    /** Stable identity for the compiled/source track that produced this trigger. */
    trackKey?: string;
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
interface ScheduleNode extends NodeBase {
    nodeType: 'schedule';
    cronExpression: string;
    /** Stable identity for the compiled/source track that produced this trigger. */
    trackKey?: string;
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
type NodeEntity = QueryNode | CreateNode | UpdateNode | ActionNode | SwitchNode | FireNode | ListenerNode | TransformNode | FlowNode | KeepAliveNode | KillNode | LLMNode | ScheduleNode;
/** Literal union of all nodeType strings (keeps Base clean) */
type NodeKind = NodeEntity['nodeType'];
declare const isNodeKind: <K extends NodeKind>(k: K) => (n: NodeEntity) => n is Extract<NodeEntity, {
    nodeType: K;
}>;
declare function assertNever(x: never): never;
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

type OutgoingBrainEvents = {
    type: 'RECEIVE_PLUGIN_DATA';
    data: FlowTNodeData;
} | {
    type: 'TNODE_OPENED';
    tNodeId: EARS.EntityId;
    data: FlowTNodeData;
} | {
    type: 'TNODE_SPAWNED';
    tNode: TNodeEntity;
    parentId?: EARS.EntityId;
    eventTNodeId?: EARS.EntityId;
    flowTNodeId: EARS.EntityId;
} | {
    type: 'TNODE_UPDATED';
    data: TNodeUpdate;
} | {
    type: 'EVENT_PULSE';
    eventType: string;
} | {
    type: 'TNODE_DETAILS';
    tNodeId: EARS.EntityId;
    details: TNodeEntity | null;
} | {
    type: 'BRAIN_RUNTIME_ERROR';
    error: BrainRuntimeError;
} | {
    type: 'INSPECT_TOGGLED';
    enabled: boolean;
} | {
    type: 'BRAIN_KILLED';
} | {
    type: 'BRAIN_STARTED';
} | {
    type: 'BRAIN_PAUSED';
} | {
    type: 'BRAIN_RESUMED';
};

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

type Simplify<T> = {
    [K in keyof T]: T[K];
} & {};

type BlockType = 'prompt' | 'note' | 'markdown' | 'file-picker' | 'choice' | 'text' | 'approval' | 'actions' | 'link' | 'button-group' | 'tool-activity' | 'thinking' | 'question' | 'project-select' | 'toggles' | 'tool-input' | 'context-usage' | 'session-list';
interface BlockConfig {
    type: BlockType;
    props: Record<string, any>;
}
interface ToolActivityEntry {
    /** Stable id. Usually the CLI's `tool_use_id`. */
    id: string;
    /** Tool name as reported by the CLI: Read, Write, Edit, Glob, Grep, Bash, … */
    tool: string;
    /** One-line human summary of the input (e.g. a truncated file path). */
    summary: string;
    /** Row status drives the per-row icon and label. */
    status: 'running' | 'ok' | 'denied' | 'error';
    /** Wall-clock duration once the tool has reported progress/completion. */
    durationMs?: number;
    /** One-line output summary if the tool reported one (e.g. "3 matches"). */
    outputSummary?: string;
    /** Optional full details revealed when the row is expanded. */
    details?: {
        input?: unknown;
        output?: string;
        error?: string;
    };
}
interface ToolActivityBlockProps {
    /** Tool entries in arrival order. Append-only during the turn. */
    entries: ToolActivityEntry[];
    /** Live status label shown when collapsed (e.g. "Reading 3 files…"). */
    label: string;
    /** Group state — drives spinner visibility and label tense. */
    state: 'streaming' | 'done' | 'error';
    /** Initial open/closed state. User toggles win after first interaction. */
    defaultOpen?: boolean;
    /** Optional pointer to a promoted artifact (Phase C). */
    artifactRef?: {
        artifactId: string;
        label: string;
    };
}
interface ThinkingBlockProps {
    /** Accumulated thinking text. */
    content: string;
    /** Collapsed header label (e.g. "Thinking…" or "Thought for 3s"). */
    label: string;
    /** Block state — drives spinner visibility. */
    state: 'streaming' | 'done';
    /** Initial open/closed state. Collapsed by default. */
    defaultOpen?: boolean;
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
interface ButtonGroupResponse {
    buttonId: string;
    state: string;
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
        cwd?: string;
        model?: string;
        startedAt?: number;
        turns?: number;
        totalCostUsd?: number;
        chatState?: string;
        toolCallCount?: number;
        permissionMode?: string;
        useWorktree?: boolean;
        sessionError?: string;
        [key: string]: unknown;
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
    forcedMode?: string;
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
    forcedMode?: string;
    pinned?: boolean;
}>;
type ThreadViewData = Simplify<ThreadCreateData & {
    id: ThreadEntity['id'];
    shortCode: ThreadEntity['shortCode'];
    status: ThreadEntity['status'];
    timestamp: ThreadEntity['timestamp'];
    archived?: ThreadEntity['archived'];
    lastMessageTimestamp?: ThreadEntity['lastMessageTimestamp'];
    messages?: ThreadExtendedData['messages'];
}>;
type ThreadExtended = Simplify<ThreadEntity & ThreadExtendedData & {
    parentId?: string;
}>;
type ThreadExtendedData = ThreadLinkedFields & {
    messages?: Partial<MessageEntity>[];
    tags?: string[];
    topic?: string;
    instructions?: string;
    status?: string;
    pinned?: boolean;
    archived?: boolean;
    shortCode?: string;
    timestamp?: number;
    lastMessageTimestamp?: number;
};
type ThreadTypeShortCode = `T-${number}`;
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
    context?: ThreadContext;
    hasMore?: boolean;
    nextCursor?: string | null;
};
type RecentThreadRefreshData = {
    recentThreads: Partial<ThreadEntity>[];
};
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
    groupId?: string;
}
type ArtifactType = 'text' | 'code' | 'review' | 'image' | 'slack' | 'todo' | 'project' | 'json' | 'graph' | 'table' | 'markdown' | 'claude-session' | 'codex-session' | 'diff' | 'plan' | 'note';
interface ClaudeSessionArtifactContent {
    /** Claude CLI session id (empty string until the first system/init event). */
    sessionId: string;
    /** Model name reported by the CLI ("claude-sonnet-4-6" etc.). */
    model: string;
    /** Working directory the CLI is running in. */
    cwd: string;
    /** Epoch ms when the session artifact was created. */
    startedAt: number;
    /** Epoch ms of the most recent turn. */
    lastTurnAt: number;
    /** Number of turns executed in this session. */
    turns: number;
    /** Running cost total in USD across all turns. */
    totalCostUsd: number;
    /** High-level chat state. Drives the status indicator and pause button. */
    chatState: 'idle' | 'working' | 'paused';
    /** Total tool calls across all turns in this session. */
    toolCallCount: number;
    /** The most recent tool the agent used (for the sidebar summary line). */
    lastTool?: {
        name: string;
        summary: string;
        at: number;
    };
    /** Last 3 tools executed (rolling window, most recent last). */
    recentTools?: Array<{
        name: string;
        summary: string;
        at: number;
    }>;
    /**
     * Permission policy for the next turn. Mutated by the user via the
     * session artifact's segmented control in the right panel and read by
     * `chat.ts` at action entry. The three useful values are:
     *   - `'default'` — CLI emits `can_use_tool` per Edit/Write/Bash (Ask mode)
     *   - `'acceptEdits'` — CLI auto-approves Edit/Write (Auto mode); Bash still prompts
     *   - `'plan'` — read-only; CLI produces a plan, makes no file changes
     * Other `PermissionMode` variants are allowed by the type but not
     * surfaced in the UI. Optional for backwards compat with artifacts
     * persisted before this field existed; readers coalesce to `'default'`.
     */
    permissionMode?: PermissionMode;
    /** Threshold percentages that have already fired an alert (avoids re-alerting). */
    alertedThresholds?: number[];
    /** Full context usage breakdown from CLI `/context` query (populated after each turn). */
    contextUsage?: {
        model: string;
        totalTokens: number;
        maxTokens: number;
        percentage: number;
        categories: Array<{
            name: string;
            tokens: number;
            percentage: number;
        }>;
        memoryFiles?: Array<{
            type: string;
            path: string;
            tokens: number;
        }>;
        skills?: Array<{
            name: string;
            source: string;
            tokens: number;
        }>;
    };
}
interface DiffArtifactContent {
    files: Array<{
        path: string;
        /** Unified diff text for this file. */
        patch: string;
        added: number;
        removed: number;
        changeType: 'added' | 'modified' | 'deleted' | 'renamed';
    }>;
    /** Aggregate summary e.g. "12 files, +420 -87". */
    summary: string;
}
interface PlanArtifactContent {
    /** Raw markdown notes body. Phase D-min uses this as the only content field. */
    notes: string;
    /** Overall plan status. Approve/Reject buttons mutate this. */
    status: 'draft' | 'approved' | 'in-progress' | 'completed' | 'rejected';
    /** Structured steps. Phase D-min leaves this empty; full Phase D will parse from notes. */
    steps: Array<{
        id: string;
        title: string;
        description?: string;
        status: 'pending' | 'in-progress' | 'done' | 'skipped';
    }>;
}
interface ArtifactItem {
    id: string;
    type: ArtifactType;
    title: string;
    content: any;
    /** Optional Tailwind color token (e.g. 'blue', 'purple') for the pill background. */
    color?: string;
    metadata?: {
        createdAt: number;
        updatedAt?: number;
        [key: string]: any;
    };
}

type OutgoingThreadsEvents = {
    type: 'THREAD_CONNECTED';
    data: ThreadConnectedData;
} | {
    type: 'SET_VIEW_DATA';
    id: EARS.EntityId;
    data: ThreadExtendedData;
} | {
    type: 'THREAD_CREATED';
    id: EARS.EntityId;
    shortCode: string;
    entityType: EARS.Entity;
    timestamp: number;
    topic?: string;
    instructions?: string;
    status?: string;
} | {
    type: 'THREAD_UPDATED';
    threadId: string;
    updates: Partial<Pick<ThreadEntity, 'status' | 'tags' | 'context' | 'pinned' | 'topic' | 'instructions'>>;
} | {
    type: 'THREAD_DELETED';
    threadId: string;
} | {
    type: 'THREADS_EXPORTED';
    filePath: string;
    threadCount: number;
} | {
    type: 'THREADS_EXPORT_FAILED';
    errors: string[];
} | {
    type: 'THREADS_IMPORTED';
    count: number;
    errors?: string[];
} | {
    type: 'THREADS_IMPORT_FAILED';
    errors: string[];
} | {
    type: 'ARCHIVED_THREADS_DATA';
    threads: Partial<ThreadEntity>[];
} | {
    type: 'AGENT_CONNECTED';
    data: AgentConnectedData;
} | {
    type: 'LOAD_CHAT_THREAD';
    data: AgentThreadData;
    restore?: boolean;
} | {
    type: 'REFRESH_RECENT_THREADS';
    data: RecentThreadRefreshData;
} | {
    type: 'ARTIFACT_ADDED';
    tabId: string;
    artifact: any;
} | {
    type: 'ARTIFACT_UPDATED';
    tabId: string;
    artifact: any;
} | {
    type: 'THREAD_TAB_REQUESTED';
    threadId: string;
    topic: string;
    artifacts: any[];
    pinned?: boolean;
} | {
    type: 'AGENT_SETTINGS_UPDATED';
    settings: AgentSettings;
} | {
    type: 'API_KEYS_STATUS';
    hasRequiredApiKeys: boolean;
} | {
    type: 'UPDATE_MESSAGE_STATE';
    messageId: string;
    text?: string;
    blocks?: BlockConfig[];
    responseTimestamp?: number;
    blockResponse?: BlockResponse;
    forkable?: boolean;
    status?: 'queued' | 'cancelled' | null;
    context?: Record<string, unknown>;
    asideText?: string;
    asideContext?: string;
    compacted?: boolean;
} | {
    type: 'MESSAGE_ADDED';
    threadId: string;
    message: MessageEntity;
} | {
    type: 'UPDATE_TODO_TASK';
    artifactId: string;
    taskId: string;
    completed: boolean;
} | {
    type: 'SET_MODE';
    mode: string;
} | {
    type: 'SET_PHASE';
    phase: string;
} | {
    type: 'SET_CHAT_STATE';
    threadId: string;
    chatState: string;
} | {
    type: 'FLASH_CHAT_STATE';
    threadId: string;
    stateId: string;
    durationMs?: number;
} | {
    type: 'COMMANDS_UPDATED';
    commands: CommandItem[];
} | {
    type: 'THREAD_CHAT_ERROR';
    threadId: string;
    error: string;
} | {
    type: 'OLDER_MESSAGES_LOADED';
    threadId: string;
    messages: Partial<MessageEntity>[];
    hasMore: boolean;
    nextCursor: string | null;
};

type OutgoingFlowsEvents = {
    type: 'FLOWS_CONNECTED';
    data: FlowsConnectedData;
} | {
    type: 'FLOW_SELECTED';
    flowId: EARS.EntityId;
    data: {
        nodes: any[];
        edges: any[];
    };
} | {
    type: 'FLOW_CREATED';
    flow: FlowEntity;
    flowId: EARS.EntityId;
    data: {
        nodes: any[];
        edges: any[];
    };
} | {
    type: 'FLOW_DELETED';
    flowId: EARS.EntityId;
} | {
    type: 'NODE_CREATED';
    tempId: string;
    nodeId: EARS.EntityId;
    node: any;
} | {
    type: 'NODE_UPDATED';
    nodeId: EARS.EntityId;
    node: any;
} | {
    type: 'NODE_DELETED';
    nodeId: string;
} | {
    type: 'EDGE_CREATED';
    sourceId: EARS.EntityId;
    targetId: EARS.EntityId;
    relId: EARS.EntityId;
    sourceHandle?: string;
    targetHandle?: string;
} | {
    type: 'EDGE_CREATE_FAILED';
    sourceId: string;
    targetId: string;
    error: string;
} | {
    type: 'EDGE_DELETED';
    edgeId: string;
} | {
    type: 'EDGE_UPDATED';
    oldEdgeId: EARS.EntityId;
    newEdgeId: EARS.EntityId;
    newSource: EARS.EntityId;
    newTarget: EARS.EntityId;
} | {
    type: 'ACTION_CREATED';
    action: ActionEntity;
    actionId: EARS.EntityId;
} | {
    type: 'ACTION_UPDATED';
    action: ActionEntity;
    actionId: EARS.EntityId;
} | {
    type: 'ACTION_DELETED';
    actionId: EARS.EntityId;
} | {
    type: 'DSL_IMPORTED';
    flowIds: EARS.EntityId[];
    errors?: string[];
} | {
    type: 'DSL_IMPORT_FAILED';
    errors: string[];
} | {
    type: 'DSL_EXPORTED';
    filePath: string;
    flowCount: number;
} | {
    type: 'DSL_EXPORT_FAILED';
    errors: string[];
};

interface DatabaseQueryResult {
    nodes: Array<{
        id: EARS.EntityId;
        type: EARS.Entity;
        data: Record<string, unknown>;
    }>;
    edges: Array<{
        id: string;
        source: EARS.EntityId;
        target: EARS.EntityId;
        type: EARS.RelKind;
        data?: Record<string, unknown>;
    }>;
}
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

type OutgoingDatabaseEvents = {
    type: 'DATABASE_REFRESH';
    data: DatabaseStartupData;
} | {
    type: 'QUERY_RESULT';
    result: any;
    executionTime: number;
} | {
    type: 'QUERY_ERROR';
    error: string;
} | {
    type: 'TRANSACTION_RESULT';
    result: any;
    executionTime: number;
} | {
    type: 'TRANSACTION_ERROR';
    error: string;
} | {
    type: 'AI_QUERY_LOADING';
} | {
    type: 'AI_QUERY_GENERATED';
    query: string;
} | {
    type: 'TRACE_FLOWS_RESULT';
    flows: TNodeEntity[];
} | {
    type: 'FLOW_EVENTS_RESULT';
    flowId: string;
    events: TNodeEntity[];
    hasMore: boolean;
} | {
    type: 'NODE_DETAILS_RESULT';
    nodeId: string;
    details: TNodeEntity | null;
} | {
    type: 'EXPORT_DATABASE_SUCCESS';
    path: string;
} | {
    type: 'EXPORT_DATABASE_ERROR';
    error: string;
} | {
    type: 'IMPORT_DATABASE_SUCCESS';
    message?: string;
} | {
    type: 'IMPORT_DATABASE_ERROR';
    error: string;
} | {
    type: 'BACKUP_INFO_RESULT';
    info: {
        timestamp: number;
        databases: string[];
        size: number;
        hasMedia?: boolean;
    } | null;
} | {
    type: 'RESET_DATABASE_SUCCESS';
    message: string;
} | {
    type: 'RESET_DATABASE_ERROR';
    error: string;
};

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
    level: "error" | "debug" | "info" | "warn";
    message: string;
    meta?: Record<string, any> | undefined;
    source?: string | undefined;
    stack?: string | undefined;
}, {
    id: string;
    timestamp: number;
    level: "error" | "debug" | "info" | "warn";
    message: string;
    meta?: Record<string, any> | undefined;
    source?: string | undefined;
    stack?: string | undefined;
}>;
type LogEntry = z.infer<typeof LogEntry>;
interface LogsState {
    logs: LogEntry[];
    maxLogs: number;
}

type OutgoingLogsEvents = {
    type: 'LOGS_CONNECTED';
    logs: LogEntry[];
    settings?: LogsSettings;
} | {
    type: 'LOGS_UPDATE';
    logs: LogEntry[];
} | {
    type: 'LOG_ADDED';
    log: LogEntry;
} | {
    type: 'LOGS_CLEARED';
} | {
    type: 'LOGS_SETTINGS_UPDATED';
    settings: LogsSettings;
};

type OutgoingPromptEvents = {
    type: 'PROMPTS_CONNECTED';
    data: PromptsConnectedData;
} | {
    type: 'PROMPT_SELECTED';
    promptId: EARS.EntityId;
    data: PromptEntity;
} | {
    type: 'PROMPT_CREATED';
    prompt: PromptEntity;
    promptId: EARS.EntityId;
} | {
    type: 'PROMPT_UPDATED';
    prompt: PromptEntity;
    promptId: EARS.EntityId;
} | {
    type: 'PROMPT_DELETED';
    promptId: EARS.EntityId;
} | {
    type: 'PROMPTS_PAGE_LOADED';
    data: {
        prompts: PromptEntity[];
        page: number;
        totalPages: number;
    };
} | {
    type: 'PROMPTS_ALL_LOADED';
    data: {
        prompts: PromptEntity[];
    };
} | {
    type: 'PROMPTS_IMPORTED';
    count: number;
    errors?: string[];
} | {
    type: 'PROMPTS_IMPORT_FAILED';
    errors: string[];
} | {
    type: 'PROMPTS_EXPORTED';
    filePath: string;
    promptCount: number;
} | {
    type: 'PROMPTS_EXPORT_FAILED';
    errors: string[];
};

type OutgoingActionEvents = {
    type: 'ACTIONS_LISTED';
    data: ActionsStartupData;
} | {
    type: 'ACTION_SELECTED';
    actionId: EARS.EntityId;
    data: ActionEntity;
} | {
    type: 'ACTION_CREATED';
    action: ActionEntity;
    actionId: EARS.EntityId;
} | {
    type: 'ACTION_UPDATED';
    action: ActionEntity;
    actionId: EARS.EntityId;
} | {
    type: 'ACTION_DELETED';
    actionId: EARS.EntityId;
} | {
    type: 'ACTIONS_PAGE_LOADED';
    data: {
        actions: ActionEntity[];
        page: number;
        totalPages: number;
    };
} | {
    type: 'ACTIONS_ALL_LOADED';
    data: {
        actions: ActionEntity[];
    };
} | {
    type: 'ACTIONS_IMPORTED';
    count: number;
    errors?: string[];
} | {
    type: 'ACTIONS_IMPORT_FAILED';
    errors: string[];
} | {
    type: 'ACTIONS_EXPORTED';
    filePath: string;
    actionCount: number;
} | {
    type: 'ACTIONS_EXPORT_FAILED';
    errors: string[];
};

type ModelProvider = 'fastembed' | 'openai';
type EmbeddingModelId = 'minilm-l6-v2' | 'bge-small-en' | 'bge-small-en-v1.5' | 'bge-base-en' | 'bge-base-en-v1.5' | 'e5-large-multilingual' | 'text-embedding-3-small' | 'text-embedding-3-large';
interface EmbeddingModelConfig {
    id: string;
    displayName: string;
    description: string;
    provider: ModelProvider;
    dimensions: number;
    fastEmbedModel?: string;
    apiModelName?: string;
    maxTokens?: number;
    speed: 'fast' | 'medium' | 'slow';
    quality: 'good' | 'better' | 'best';
}

type EmbeddingModel = EmbeddingModelId;
type IndexMetric = 'cosine' | 'dot_product';
type Occurrence = 'first' | 'last' | 'all' | {
    index: number;
} | {
    from: number;
    to: number;
};
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
interface ChunkInfo {
    sourceDocId: EARS.EntityId;
    segmentIndex: number;
    itemIndex?: number;
    totalChunks: number;
    chunkType: 'full' | 'segment-item';
    chunkKey: string;
}
interface IndexedDocument {
    documentId: EARS.EntityId;
    vectorId: number;
    embedding?: Float32Array;
    text: string;
    chunkInfo?: ChunkInfo;
    metadata: {
        shortCode: string;
        name: string;
        indexedAt: number;
    };
}
interface IndexSearchResult {
    documentId: EARS.EntityId;
    score: number;
    text: string;
    metadata: IndexedDocument['metadata'];
    chunkInfo?: ChunkInfo;
}
interface EmbeddingResult {
    text: string;
    embedding: Float32Array;
    model: EmbeddingModel;
}

type DocumentShortCode = `DOC-${number}`;
type ContentType = 'field' | 'list' | 'markdown' | 'text' | 'code';
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
interface Document extends BaseEntity {
    _type: EARS.Entity.Document;
    name: string;
    content: ContentSection[];
    shortCode: DocumentShortCode;
    displayOrder?: number;
    /** SHA256 hash of DSL source at last seed. Absent on user-created documents. */
    sourceHash?: string;
}
interface Collection extends BaseEntity {
    _type: EARS.Entity.Collection;
    name: string;
    description?: string;
    displayOrder?: number;
    symlinkPath?: string;
    /** SHA256 hash of DSL source at last seed. Absent on user-created collections. */
    sourceHash?: string;
}
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
interface LibrarySystemContext {
    documents: DocumentDTO[];
    collections: CollectionDTO[];
    selectedDocumentId?: EARS.EntityId;
    selectedCollectionId?: EARS.EntityId;
    currentItems: LibraryItem[];
    currentFolderId: EARS.EntityId | null;
    currentPath: string[];
}

type OutgoingLibraryEvents = {
    type: 'LIBRARY_CONNECTED';
    data: {
        documents: DocumentDTO[];
        collections: CollectionDTO[];
        settings: any;
    };
} | {
    type: 'DOCUMENTS_LOADED';
    data: {
        documents: DocumentDTO[];
    };
} | {
    type: 'DOCUMENT_CREATED';
    data: {
        document: DocumentDTO;
    };
} | {
    type: 'DOCUMENT_UPDATED';
    data: {
        document: DocumentDTO;
    };
} | {
    type: 'DOCUMENT_DELETED';
    data: {
        documentId: string;
    };
} | {
    type: 'DOCUMENT_LOADED';
    data: {
        document: DocumentDTO;
    };
} | {
    type: 'COLLECTIONS_LOADED';
    data: {
        collections: CollectionDTO[];
    };
} | {
    type: 'COLLECTION_CREATED';
    data: {
        collection: CollectionDTO;
    };
} | {
    type: 'COLLECTION_UPDATED';
    data: {
        collection: CollectionDTO;
    };
} | {
    type: 'COLLECTION_DELETED';
    data: {
        collectionId: string;
    };
} | {
    type: 'LIBRARY_ERROR';
    data: {
        error: string;
    };
} | {
    type: 'SYMLINK_UPDATED';
    data: {
        collection: CollectionDTO;
    };
} | {
    type: 'FOLDER_CONTENTS_LOADED';
    data: FolderContents;
} | {
    type: 'NAVIGATION_CHANGED';
    data: {
        folderId: string | null;
        path: string[];
    };
} | {
    type: 'ITEM_RENAMED';
    data: {
        item: LibraryItem;
    };
} | {
    type: 'ITEMS_DELETED';
    data: {
        ids: string[];
    };
} | {
    type: 'ITEMS_MOVED';
    data: {
        ids: string[];
        targetFolderId: string | null;
    };
} | {
    type: 'LIBRARY_IMPORTED';
    count: number;
    errors?: string[];
} | {
    type: 'LIBRARY_IMPORT_FAILED';
    errors: string[];
} | {
    type: 'LIBRARY_EXPORTED';
    filePath: string;
    itemCount: number;
} | {
    type: 'LIBRARY_EXPORT_FAILED';
    errors: string[];
};

type OutgoingActionsEvents = {
    type: 'codeActions.ACTION_SELECTED';
    actionId: string;
    data: ActionEntity & {
        actionFnContent?: string;
    };
} | {
    type: 'codeActions.ACTION_UPDATED';
    action: ActionEntity;
    actionId: string;
} | {
    type: 'codeActions.CODE_ERROR';
    data: {
        message: string;
    };
};

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
    isVideo?: boolean;
}
interface FileOperation {
    type: 'create' | 'update' | 'delete' | 'rename';
    path: string;
    newPath?: string;
    content?: string;
}
interface CodeSystemError {
    code: 'NOT_FOUND' | 'PERMISSION_DENIED' | 'INVALID_PATH' | 'IO_ERROR' | 'FILE_TOO_LARGE' | 'SEARCH_ERROR';
    message: string;
    path?: string;
}
interface SearchOptions {
    query: string;
    path: string;
    includePattern?: string;
    excludePattern?: string;
    caseSensitive?: boolean;
    wholeWord?: boolean;
    useRegex?: boolean;
    maxResults?: number;
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
interface GitBranch {
    name: string;
    current: boolean;
}
interface GitCommitInfo {
    message: string;
    author?: string;
    date?: Date;
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
interface WorktreeEntry {
    path: string;
    head: string;
    branch: string;
    isBare: boolean;
    isCurrent: boolean;
    isMain: boolean;
    isLocked: boolean;
    lockedReason?: string;
}
interface CommitLogEntry {
    hash: string;
    shortHash: string;
    subject: string;
    body: string;
    authorName: string;
    authorEmail: string;
    date: string;
    refs: string;
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
    startLine?: number | null;
    originalLine?: number | null;
    originalStartLine?: number | null;
    diffSide?: 'LEFT' | 'RIGHT' | null;
    startDiffSide?: 'LEFT' | 'RIGHT' | null;
    subjectType?: 'LINE' | 'FILE' | null;
    diffHunk?: string | null;
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
    path?: string | null;
    line?: number | null;
    startLine?: number | null;
    originalLine?: number | null;
    originalStartLine?: number | null;
    diffHunk?: string | null;
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
interface TerminalOutput {
    terminalId: EARS.EntityId;
    data: string;
}
interface TerminalInput {
    terminalId: EARS.EntityId;
    data: string;
}
interface TerminalResize {
    terminalId: EARS.EntityId;
    cols: number;
    rows: number;
}
interface TerminalCreate {
    id?: EARS.EntityId;
    title?: string;
    cwd?: string;
    shell?: string;
    cols?: number;
    rows?: number;
}
interface TerminalClose {
    terminalId: string;
}
interface QuickOpenOptions {
    query: string;
    baseDirectory: string;
    excludePatterns?: string[];
    maxResults?: number;
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
    baseDirectory?: string | null;
    enableShellIntegration?: boolean;
    confirmTerminalClose?: boolean;
    closeTerminalOnTabClose?: boolean;
    maxTerminals?: number;
    mdEditorDefault?: boolean;
    enablePreview?: boolean;
    autoFetchRemote?: boolean;
    autoFetchIntervalSeconds?: number;
    terminalScripts?: TerminalScript[];
    showStashes?: boolean;
    showCommits?: boolean;
    showWorktrees?: boolean;
}
type CodeConnectedData = {
    baseDirectory: string | null;
    settings?: CodeSettings;
};

type OutgoingTerminalEvents = {
    type: 'terminal.CREATED';
    data: TerminalInfo;
} | {
    type: 'terminal.OUTPUT';
    data: {
        terminalId: string;
        data: string;
    };
} | {
    type: 'terminal.INITIAL_OUTPUT';
    data: {
        terminalId: string;
        data: string;
    };
} | {
    type: 'terminal.CLOSED';
    data: {
        terminalId: string;
    };
} | {
    type: 'terminal.RENAMED';
    data: {
        terminalId: string;
        customTitle: string;
    };
} | {
    type: 'terminal.CWD_CHANGED';
    data: {
        terminalId: string;
        cwd: string;
        title?: string;
    };
} | {
    type: 'terminal.ERROR';
    data: {
        message: string;
        terminalId?: string;
    };
} | {
    type: 'terminal.TERMINALS_LISTED';
    data: TerminalInfo[];
} | {
    type: 'terminal.TERMINAL_TAB_OPENED';
    data: TerminalInfo;
};

type TokenSource = 'GITHUB_TOKEN' | 'keyring' | 'unknown';
type TokenKind = 'fine-grained-pat' | 'classic-pat' | 'oauth' | 'unknown';
interface ActiveTokenInfo {
    source: TokenSource;
    kind: TokenKind;
    prefix: string;
}

type OutgoingPullRequestEvents = {
    type: 'pr.BASE_BRANCH_RECEIVED';
    data: {
        branch: string;
    };
} | {
    type: 'pr.BRANCH_DIFF_RECEIVED';
    data: {
        files: GitStatusFile[];
        baseBranch: string;
        headBranch?: string;
    };
} | {
    type: 'pr.FILE_DIFF_RECEIVED';
    data: GitDiff & {
        baseBranch: string;
        headBranch?: string;
    };
} | {
    type: 'pr.ERROR';
    message: string;
} | {
    type: 'pr.STATUS_CHANGED';
    data: {
        timestamp: Date;
    };
} | {
    type: 'pr.GIT_STATUS_REFRESHED';
    data: {
        timestamp: Date;
    };
} | {
    type: 'pr.OPEN_PRS_RECEIVED';
    data: {
        prs: GhPullRequest[];
    };
} | {
    type: 'pr.PR_DETAILS_RECEIVED';
    data: {
        pr: GhPullRequest;
        comments: GhPRComment[];
        requestId: number;
    };
} | {
    type: 'pr.PR_CREATED';
    data: {
        pr: GhPullRequest;
    };
} | {
    type: 'pr.PR_MERGED';
    data: {
        number: number;
    };
} | {
    type: 'pr.PR_CLOSED';
    data: {
        number: number;
    };
} | {
    type: 'pr.PR_DRAFT_TOGGLED';
    data: {
        number: number;
        isDraft: boolean;
    };
} | {
    type: 'pr.BRANCH_PR_CHECKED';
    data: {
        pr: GhPullRequest | null;
    };
} | {
    type: 'pr.GH_AUTH_CHECKED';
    data: {
        available: boolean;
        prAccess: boolean;
        activeToken: ActiveTokenInfo | null;
    };
} | {
    type: 'pr.AUTOFILL_RECEIVED';
    data: {
        title: string;
        body: string;
    };
} | {
    type: 'pr.SMART_BASE_BRANCH_RECEIVED';
    data: {
        branch: string;
    };
} | {
    type: 'pr.BRANCH_DELETED';
    data: {
        branch: string;
    };
} | {
    type: 'pr.PR_UPDATED';
    data: {
        number: number;
        title?: string;
        body?: string;
        base?: string;
    };
} | {
    type: 'pr.COMMENT_CREATED';
    data: {
        number: number;
    };
} | {
    type: 'pr.COMMENT_EDITED';
    data: {
        commentId: number;
    };
} | {
    type: 'pr.COMMENT_DELETED';
    data: {
        commentId: number;
    };
} | {
    type: 'pr.COMMENTS_RECEIVED';
    data: {
        number: number;
        comments: GhPRComment[];
    };
} | {
    type: 'pr.REVIEW_THREADS_RECEIVED';
    data: {
        threads: GhReviewThread[];
    };
} | {
    type: 'pr.THREAD_REPLIED';
    data: {
        prNumber: number;
    };
} | {
    type: 'pr.THREAD_RESOLVED';
    data: {
        threadId: string;
    };
} | {
    type: 'pr.THREAD_UNRESOLVED';
    data: {
        threadId: string;
    };
} | {
    type: 'pr.REVIEW_COMMENT_EDITED';
    data: {
        commentId: number;
    };
} | {
    type: 'pr.REVIEW_COMMENT_DELETED';
    data: {
        commentId: number;
    };
};

interface FileChangeInfo {
    path: string;
    modifiedAt: Date;
    changeType: 'add' | 'change' | 'unlink';
}

type OutgoingCommitEvents = {
    type: 'commit.STATUS_RECEIVED';
    data: {
        files: GitStatusFile[];
        branch: string;
        hasUpstream: boolean;
        commitsAhead: number;
        commitsBehind: number;
    };
} | {
    type: 'commit.DIFF_RECEIVED';
    data: GitDiff;
} | {
    type: 'commit.FILES_STAGED';
    data: {
        paths: string[];
    };
} | {
    type: 'commit.FILES_UNSTAGED';
    data: {
        paths: string[];
    };
} | {
    type: 'commit.COMMIT_SUCCESS';
    data: {
        message: string;
    };
} | {
    type: 'commit.FILE_REVERTED';
    data: {
        path: string;
    };
} | {
    type: 'commit.FILES_REVERTED';
    data: {
        paths: string[];
    };
} | {
    type: 'commit.ERROR_RECEIVED';
    data: {
        message: string;
    };
} | {
    type: 'commit.BRANCH_RETRIEVED';
    data: {
        branch: string;
    };
} | {
    type: 'commit.BRANCHES_RECEIVED';
    data: {
        branches: string[];
    };
} | {
    type: 'commit.BRANCH_CHECKOUT_SUCCESS';
    data: {
        branchName: string;
    };
} | {
    type: 'commit.BRANCH_PUSHED';
    data: {
        branchName: string;
    };
} | {
    type: 'commit.BRANCH_PULLED';
    data: {
        branchName: string;
    };
} | {
    type: 'commit.GENERATING_MESSAGE';
} | {
    type: 'commit.MESSAGE_GENERATED';
    data: {
        message: string;
    };
} | {
    type: 'commit.STASH_LIST_RECEIVED';
    data: {
        stashes: StashEntry[];
    };
} | {
    type: 'commit.STASH_SUCCESS';
    data: {
        message: string;
    };
} | {
    type: 'commit.WORKTREE_LIST_RECEIVED';
    data: {
        worktrees: WorktreeEntry[];
    };
} | {
    type: 'commit.WORKTREE_ADDED';
    data: {
        path: string;
        branch: string;
    };
} | {
    type: 'commit.WORKTREE_REMOVED';
    data: {
        path: string;
    };
} | {
    type: 'commit.CONFLICT_RESOLVED';
    data: {
        path: string;
    };
} | {
    type: 'commit.ALL_CONFLICTS_RESOLVED';
} | {
    type: 'commit.LOG_LIST_RECEIVED';
    data: {
        commits: CommitLogEntry[];
    };
} | {
    type: 'commit.REVERT_COMMIT_SUCCESS';
    data: {
        hash: string;
    };
} | {
    type: 'commit.RESET_COMMIT_SUCCESS';
    data: {
        hash: string;
    };
};

type OutgoingSearchEvents = {
    type: 'search.RESULT';
    data: SearchResult;
} | {
    type: 'search.PROGRESS';
    data: SearchProgress;
} | {
    type: 'search.COMPLETE';
    data: {
        results: SearchResult[];
        totalMatches: number;
    };
} | {
    type: 'search.ERROR';
    data: {
        message: string;
    };
};

type OutgoingExplorerEvents = {
    type: 'explorer.FILES_LISTED';
    data: DirectoryContent;
} | {
    type: 'explorer.FILE_CREATED';
    data: {
        path: string;
    };
} | {
    type: 'explorer.FILE_DELETED';
    data: {
        path: string;
    };
} | {
    type: 'explorer.FILE_RENAMED';
    data: {
        oldPath: string;
        newPath: string;
    };
} | {
    type: 'explorer.DIRECTORY_CREATED';
    data: {
        path: string;
    };
} | {
    type: 'explorer.FILE_INFO';
    data: FileInfo;
} | {
    type: 'explorer.FILE_CONTENT';
    data: FileContent;
} | {
    type: 'explorer.FILE_SAVED';
    data: {
        path: string;
    };
} | {
    type: 'explorer.CODE_ERROR';
    data: CodeSystemError;
} | {
    type: 'explorer.FILE_CHANGED_EXTERNALLY';
    data: FileChangeInfo;
} | {
    type: 'explorer.QUICK_OPEN_RESULTS';
    data: QuickOpenResult[];
} | {
    type: 'explorer.FILES_MOVED';
    data: {
        sourcePaths: string[];
        targetDir: string;
        movedPaths: string[];
    };
} | {
    type: 'explorer.FILES_COPIED';
    data: {
        targetDir: string;
        copiedPaths: string[];
    };
};

type OutgoingCodeEvents = OutgoingExplorerEvents | OutgoingSearchEvents | OutgoingCommitEvents | OutgoingPullRequestEvents | OutgoingTerminalEvents | OutgoingActionsEvents | {
    type: 'CODE_CONNECTED';
    data: CodeConnectedData;
} | {
    type: 'CODE_SETTINGS_UPDATED';
    settings: CodeSettings;
};

type SecretProvider = 'google' | 'anthropic' | 'openai' | 'groq' | 'mistral' | 'cohere' | 'custom';
interface SecretData {
    id: EARS.EntityId;
    provider: SecretProvider;
    customName?: string;
    createdAt: number;
    updatedAt?: number;
}

type SecretsOutputEvents = {
    type: 'SECRETS.EVENT.LOADED';
    data: SecretData[];
} | {
    type: 'SECRETS.EVENT.CREATED';
    id: EARS.EntityId;
    provider: SecretProvider;
    customName?: string;
} | {
    type: 'SECRETS.EVENT.UPDATED';
    id: EARS.EntityId;
} | {
    type: 'SECRETS.EVENT.DELETED';
    id: EARS.EntityId;
} | {
    type: 'SECRETS.EVENT.VALUE';
    id: EARS.EntityId;
    value: string;
} | {
    type: 'SECRETS.EVENT.ERROR';
    message: string;
};

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

type OutgoingSettingsEvents = {
    type: 'SETTINGS_LOADED';
    data: SettingsData;
    faqs: FAQItem[];
} | {
    type: 'SETTINGS_UPDATED';
    data: SettingsData;
} | {
    type: 'SETTINGS_RESET';
    data: SettingsData;
} | {
    type: 'APPLICATION_HOTKEYS';
    hotkeys: SettingsData['general']['application']['hotkeys'];
} | {
    type: 'CLI_TEST_RESULT';
    provider: string;
    success: boolean;
    error?: string;
    resolvedPath?: string;
} | {
    type: 'SETUP_PACK_IMPORTED';
    result: Record<string, SeedCounts>;
} | {
    type: 'SETUP_PACK_IMPORT_FAILED';
    error: string;
} | {
    type: 'SETUP_PACK_PREVIEW';
    preview: SetupPackPreview;
} | {
    type: 'SETUP_PACK_PREVIEW_FAILED';
    error: string;
} | {
    type: 'APP_RESET_COMPLETE';
} | {
    type: 'APP_RESET_FAILED';
    error: string;
} | {
    type: 'PACK_INSTALL_STARTED';
    packSlug: string;
} | {
    type: 'PACK_INSTALL_FAILED';
    packSlug: string;
    error: string;
} | SecretsOutputEvents;

declare const REFERENCES: "references";
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
type OutgoingNotesSearchEvent = {
    type: 'NOTES_SEARCH_RESULTS';
    results: NoteDTO[];
};
interface NotesConnectedData {
    notes: NoteDTO[];
    settings?: NotesSettings;
}

type OutgoingNotesEvents = {
    type: 'NOTES_CONNECTED';
    data: NotesConnectedData;
} | {
    type: 'NOTE_CREATED';
    note: NoteDTO;
} | {
    type: 'NOTE_UPDATED';
    note: NoteDTO;
} | {
    type: 'NOTE_DELETED';
    noteId: string;
} | {
    type: 'NOTE_RESTORED';
    note: NoteDTO;
} | {
    type: 'TRASHED_NOTES';
    notes: NoteDTO[];
} | OutgoingNotesSearchEvent | {
    type: 'NOTES_IMPORTED';
    count: number;
    errors?: string[];
} | {
    type: 'NOTES_IMPORT_FAILED';
    errors: string[];
} | {
    type: 'NOTES_EXPORTED';
    filePath: string;
    itemCount: number;
} | {
    type: 'NOTES_EXPORT_FAILED';
    errors: string[];
};

interface CalendarEventEntity extends BaseEntity {
    entityType: EARS.Entity.CalendarEvent;
    title: string;
    notes: string;
    startsAt: number;
    endsAt: number;
    allDay: boolean;
    createdAt: number;
    updatedAt: number;
}
interface CalendarEventDTO {
    id: string;
    title: string;
    notes: string;
    startsAt: number;
    endsAt: number;
    allDay: boolean;
    createdAt: number;
    updatedAt: number;
}
interface CalendarConnectedData {
    events: CalendarEventDTO[];
}

type OutgoingCalendarEvents = {
    type: 'CALENDAR_CONNECTED';
    data: CalendarConnectedData;
} | {
    type: 'CALENDAR_EVENT_CREATED';
    calendarEvent: CalendarEventDTO;
} | {
    type: 'CALENDAR_EVENT_UPDATED';
    calendarEvent: CalendarEventDTO;
} | {
    type: 'CALENDAR_EVENT_DELETED';
    calendarEventId: string;
};

export { BinaryOperator, Collection, ContextPaths, Document, LogEntry, LogLevel, REFERENCES, SearchIndex, ThreadRelations, assertNever, isNodeKind };
export type { ActionEntity, ActionNode, ActionParameter, ActionsSettings, ActionsStartupData, Address, AgentConnectedData, AgentMode, AgentPhase, AgentSettings, AgentThreadData, AppSettings, ApplicationHotkeys, ArtifactEntity, ArtifactItem, ArtifactType, AssistantSettings, BlockConfig, BlockResponse, BlockType, BrainRuntimeError, BrainSettings, BreadcrumbItem, BrowserSettings, ButtonConfig, ButtonGroupResponse, CalendarConnectedData, CalendarEventDTO, CalendarEventEntity, Category, ChatStateConfig, ClaudeSessionArtifactContent, CodeConnectedData, CodeContent, CodeSettings, CodeSystemError, CollectionDTO, CommandItem, CommitLogEntry, Condition, ContentSection, ContentType, ContextReference, ContextReferenceType, CreateNode, CustomHotkey, DatabaseQueryResult, DatabaseSchemaInfo, DatabaseSettings, DatabaseStartupData, DiffArtifactContent, DirectoryContent, DocumentDTO, DocumentItem, DocumentShortCode, EdgeEntity, EmbeddingModel, EmbeddingModelConfig, EmbeddingModelId, EmbeddingResult, EntityStatus, EventListenerEntity, EventReceived, EventSchema, ExecutionContext, ExecutionEvent, FAQItem, FieldContent, FieldMapping, FieldSchema, FileContent, FileInfo, FileOperation, FileReference, FireNode, FlowEntity, FlowExtendedData, FlowNode, FlowTNodeData, FlowsConnectedData, FlowsSettings, FolderContents, FolderItem, GeneralSettings, GhPRComment, GhPullRequest, GhReviewComment, GhReviewThread, GitBranch, GitCommitInfo, GitDiff, GitStatusFile, ImageReference, IndexMetric, IndexSearchResult, IndexedDocument, InternalSettings, JsonPath, KeepAliveNode, KeyboardShortcut, KillNode, LLMNode, LibraryItem, LibrarySystemContext, LinkConfig, LinkEvent, LinkIcon, ListContent, ListenerNode, LogsSettings, LogsState, MarkdownContent, MessageEntity, MessageReferences, ModelCatalogEntry, ModelProvider, NodeCreateInput, NodeEntity, NodeKind, NoteDTO, NoteEntity, NotesConnectedData, NotesSettings, Occurrence, OutgoingActionEvents, OutgoingBrainEvents, OutgoingCalendarEvents, OutgoingCodeEvents, OutgoingDatabaseEvents, OutgoingFlowsEvents, OutgoingLibraryEvents, OutgoingLogsEvents, OutgoingNotesEvents, OutgoingNotesSearchEvent, OutgoingPromptEvents, OutgoingSettingsEvents, OutgoingThreadsEvents, PersonalInfo, PlanArtifactContent, PluginSettings, PluginVisibilitySettings, Predicate, Project, PromptEntity, PromptsConnectedData, PromptsSettings, QueryNode, QuickOpenOptions, QuickOpenResult, QuickPrompt, RecentThreadRefreshData, SETTINGS_SCOPE, ScheduleNode, SearchIndexConfig, SearchMatch, SearchOptions, SearchProgress, SearchResult, Secrets, SegmentRule, SettingsData, SettingsEntity, SourceResolver, StashEntry, StepOutputSchema, StepRun, SwitchNode, TNodeEntity, TNodeKind, TNodeUpdate, Tab, TemplateInput, TerminalClose, TerminalCreate, TerminalInfo, TerminalInput, TerminalOutput, TerminalResize, TerminalScript, TextContent, ThinkingBlockProps, ThreadConnectedData, ThreadContext, ThreadCreateData, ThreadEditFields, ThreadEntity, ThreadExtended, ThreadExtendedData, ThreadLinkItem, ThreadLinkRelation, ThreadLinkedFields, ThreadStatusOption, ThreadTagOption, ThreadTypeShortCode, ThreadViewData, ThreadsSettings, TimestampMs, ToolActivityBlockProps, ToolActivityEntry, TrackEntity, TransformNode, UpdateNode, WorktreeEntry };
