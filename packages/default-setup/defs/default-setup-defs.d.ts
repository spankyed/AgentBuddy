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
        BrowserBookmark = "BrowserBookmark"
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

/**
 * Flow DSL Types
 *
 * A succinct, user-friendly format for defining workflows that compiles
 * into the EARS database format.
 *
 * Format: Track-based DSL where each track is an event + parallel exit chains.
 */

/**
 * Top-level DSL structure: flow name → tracks (or FlowConfig with metadata)
 */
type FlowDSL = Record<string, Track[] | FlowConfig>;
/**
 * Flow configuration with metadata (e.g. root designation)
 */
interface FlowConfig {
    tracks: Track[];
    /** Mark this flow as the root flow */
    root?: boolean;
    /** SHA256 hash of the compiled source — populated by the compiler, not authored */
    sourceHash?: string;
}
/** Type guard: distinguish FlowConfig from bare Track[] */
declare function isFlowConfig(value: Track[] | FlowConfig): value is FlowConfig;
/** Extract tracks from a FlowDSL entry (normalizes both formats) */
declare function resolveTracks(entry: Track[] | FlowConfig): Track[];
/** Role string for the root flow designation */
declare const ROOT_FLOW_ROLE = "root_flow";
/**
 * A track represents a trigger node + its sequential response steps.
 * Exactly one of `event` or `schedule` must be set.
 * - `event` creates an implicit listener node
 * - `schedule` creates an implicit schedule node (cron-based trigger)
 */
interface Track {
    /** Event type to listen for (creates a listener node). Mutually exclusive with `schedule`. */
    event?: string;
    /** Cron expression (creates a schedule node). Mutually exclusive with `event`. */
    schedule?: string;
    /** Optional label for the trigger node (defaults to event type or cron expression) */
    label?: string;
    /** Optional description for the trigger node */
    description?: string;
    /** Exit paths from this trigger — each inner array is an independent sequential step chain.
     *  Single-exit: exits: [[step1, step2]]. Parallel: exits: [[chainA...], [chainB...]] */
    exits: DSLStepNode[][];
}
/** Common fields for all step nodes */
interface DSLNodeBase {
    label?: string;
    description?: string;
    final?: boolean;
    next?: string;
}
/** Execute a predefined action */
interface DSLActionNode extends DSLNodeBase {
    type: 'action';
    action: string;
    map?: Record<string, string>;
    params?: Record<string, any>;
}
/** Process with AI language model */
interface DSLLLMNode extends DSLNodeBase {
    type: 'llm';
    prompt: string;
    map?: Record<string, string>;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
}
/** Switch condition with inline branch steps */
interface DSLSwitchCondition {
    if: string;
    steps: DSLStepNode[];
}
/** Else branch: inline steps */
type DSLSwitchElse = DSLStepNode[];
/** Branch flow based on conditions */
interface DSLSwitchNode extends DSLNodeBase {
    type: 'switch';
    conditions: DSLSwitchCondition[];
    else?: DSLSwitchElse;
}
/** Emit an event */
interface DSLFireNode extends DSLNodeBase {
    type: 'fire';
    event: string;
    scope?: 'local' | 'global';
    payload?: unknown;
}
/** Transform data using script */
interface DSLTransformNode extends DSLNodeBase {
    type: 'transform';
    script: string;
    outputType?: 'json' | 'text' | 'custom';
}
/** Query data using natural language */
interface DSLQueryNode extends DSLNodeBase {
    type: 'query';
    prompt: string;
    as?: string;
}
/** Execute a sub-flow */
interface DSLFlowNode extends DSLNodeBase {
    type: 'flow';
    flow: string;
    inherit?: boolean;
    map?: Record<string, string>;
}
/** Create an entity */
interface DSLCreateNode extends DSLNodeBase {
    type: 'create';
    entity: string;
}
/** Update an entity */
interface DSLUpdateNode extends DSLNodeBase {
    type: 'update';
    target: string;
    onMissing?: 'fail' | 'ignore' | 'create';
}
/** Keep flow instance alive */
interface DSLKeepAliveNode extends DSLNodeBase {
    type: 'keep_alive';
}
/** Terminate the containing flow immediately */
interface DSLKillNode extends DSLNodeBase {
    type: 'kill';
}
/**
 * Union of all step node types (excludes listener - that's implicit in Track.event)
 */
type DSLStepNode = DSLActionNode | DSLLLMNode | DSLSwitchNode | DSLFireNode | DSLTransformNode | DSLQueryNode | DSLFlowNode | DSLCreateNode | DSLUpdateNode | DSLKeepAliveNode | DSLKillNode;
interface CompiledFlow {
    entity: CompiledEntity[];
    relation: CompiledRelation[];
    role: CompiledRole[];
}
interface CompiledEntity {
    id: string;
    entityType: EARS.Entity;
    [key: string]: any;
}
interface CompiledRelation {
    source: string;
    kind: EARS.RelKind;
    target: string;
    info?: Record<string, any>;
}
interface CompiledRole {
    entityId: string;
    role: string;
}
interface CompilerContext {
    /** Map action label -> action ID */
    actions: Map<string, string>;
    /** Map prompt label -> prompt ID */
    prompts: Map<string, string>;
    /** Map flow label -> flow ID (for sub-flow references) */
    flows: Map<string, string>;
}
interface ValidationError {
    path: string;
    message: string;
}
interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
}

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

interface ExportedDocument {
    id?: string;
    type: 'document';
    name: string;
    content: ContentSection[];
    tags: string[];
    sourceHash?: string;
}
interface ExportedCollection {
    id?: string;
    type: 'collection';
    name: string;
    description?: string;
    children: ExportedItem[];
    sourceHash?: string;
}
interface ExportedSymlink {
    id?: string;
    type: 'symlink';
    name: string;
    symlinkPath: string;
}
type ExportedItem = ExportedDocument | ExportedCollection | ExportedSymlink;
interface ExportedLibrary {
    version: number;
    items: ExportedItem[];
}
type ExportFormat = 'markdown' | 'json';

interface ActionParameter {
    type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any';
    description?: string;
    required?: boolean;
    default?: any;
    placeholder?: string;
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

interface ExportedNote {
    id?: string;
    type: 'document' | 'tasklist' | 'task';
    title: string;
    content: string;
    icon: string | null;
    completed: boolean;
    hideCompletedChildren: boolean;
    favorite: boolean;
    displayOrder?: number;
    savedDisplayOrder?: number;
    children: ExportedNote[];
}
interface ExportedNotes {
    version: number;
    notes: ExportedNote[];
}

export { EARS, ROOT_FLOW_ROLE, isFlowConfig, resolveTracks };
export type { ActionParameter, BaseEntity, ButtonConfig, CodeContent, CompiledEntity, CompiledFlow, CompiledRelation, CompiledRole, CompilerContext, ContentSection, ContentType, DSLActionNode, DSLCreateNode, DSLFireNode, DSLFlowNode, DSLKeepAliveNode, DSLLLMNode, DSLQueryNode, DSLStepNode, DSLSwitchCondition, DSLSwitchNode, DSLTransformNode, DSLUpdateNode, ExportFormat, ExportedCollection, ExportedDocument, ExportedItem, ExportedLibrary, ExportedNote, ExportedNotes, ExportedSymlink, FieldContent, FlowConfig, FlowDSL, LinkConfig, LinkEvent, LinkIcon, ListContent, MarkdownContent, TemplateInput, TextContent, Track, ValidationError, ValidationResult };
