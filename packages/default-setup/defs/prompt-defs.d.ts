declare class PromptService {
    getByLabel(label: string): any;
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

interface PromptContext {
    usePrompt(label: string, params: Record<string, any>): string | undefined;
}

/**
 * Prompt DSL Export Module
 * This module exports all types and functions needed for the Prompt DSL
 * Used to generate type definitions for Monaco Editor
 */

interface PromptParams {
    [key: string]: any;
}
declare function usePrompt(label: string, params: Record<string, any>): string | undefined;
declare const params: PromptParams;

export { PromptService, params, usePrompt };
export type { PromptContext, PromptEntity, PromptParams };
