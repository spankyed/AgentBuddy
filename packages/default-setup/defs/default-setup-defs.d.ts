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

export { EARS, ROOT_FLOW_ROLE, isFlowConfig, resolveTracks };
export type { ActionParameter, BaseEntity, ButtonConfig, CodeContent, CompiledEntity, CompiledFlow, CompiledRelation, CompiledRole, CompilerContext, ContentSection, ContentType, DSLActionNode, DSLCreateNode, DSLFireNode, DSLFlowNode, DSLKeepAliveNode, DSLLLMNode, DSLQueryNode, DSLStepNode, DSLSwitchCondition, DSLSwitchNode, DSLTransformNode, DSLUpdateNode, ExportFormat, ExportedCollection, ExportedDocument, ExportedItem, ExportedLibrary, ExportedNote, ExportedNotes, ExportedSymlink, FieldContent, FlowConfig, FlowDSL, LinkConfig, LinkEvent, LinkIcon, ListContent, MarkdownContent, TemplateInput, TextContent, Track, ValidationError, ValidationResult };
