declare module "@app/defs/database" {

import { Database, RootDatabase } from 'lmdb';

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
        readonly items: (`Agent-${string}` | `Brain-${string}` | `Message-${string}` | `Thread-${string}` | `Relation-${string}` | `Artifact-${string}` | `Flow-${string}` | `Node-${string}` | `TNode-${string}` | `Prompt-${string}` | `Action-${string}` | `Document-${string}` | `Collection-${string}` | `SearchIndex-${string}` | `IndexedDoc-${string}` | `Terminal-${string}` | `Directory-${string}` | `Settings-${string}` | `FAQ-${string}` | `Secret-${string}` | `Note-${string}` | `BrowserTab-${string}` | `BrowserBookmark-${string}`)[];
        readonly nextCursor: string | null;
    };
    readonly distinct: (field?: string) => /*elided*/ any;
    readonly groupBy: (field: string) => Map<unknown, /*elided*/ any>;
    readonly ids: () => (`Agent-${string}` | `Brain-${string}` | `Message-${string}` | `Thread-${string}` | `Relation-${string}` | `Artifact-${string}` | `Flow-${string}` | `Node-${string}` | `TNode-${string}` | `Prompt-${string}` | `Action-${string}` | `Document-${string}` | `Collection-${string}` | `SearchIndex-${string}` | `IndexedDoc-${string}` | `Terminal-${string}` | `Directory-${string}` | `Settings-${string}` | `FAQ-${string}` | `Secret-${string}` | `Note-${string}` | `BrowserTab-${string}` | `BrowserBookmark-${string}`)[];
    readonly id: () => `Agent-${string}` | `Brain-${string}` | `Message-${string}` | `Thread-${string}` | `Relation-${string}` | `Artifact-${string}` | `Flow-${string}` | `Node-${string}` | `TNode-${string}` | `Prompt-${string}` | `Action-${string}` | `Document-${string}` | `Collection-${string}` | `SearchIndex-${string}` | `IndexedDoc-${string}` | `Terminal-${string}` | `Directory-${string}` | `Settings-${string}` | `FAQ-${string}` | `Secret-${string}` | `Note-${string}` | `BrowserTab-${string}` | `BrowserBookmark-${string}`;
    readonly count: () => number;
    readonly first: () => `Agent-${string}` | `Brain-${string}` | `Message-${string}` | `Thread-${string}` | `Relation-${string}` | `Artifact-${string}` | `Flow-${string}` | `Node-${string}` | `TNode-${string}` | `Prompt-${string}` | `Action-${string}` | `Document-${string}` | `Collection-${string}` | `SearchIndex-${string}` | `IndexedDoc-${string}` | `Terminal-${string}` | `Directory-${string}` | `Settings-${string}` | `FAQ-${string}` | `Secret-${string}` | `Note-${string}` | `BrowserTab-${string}` | `BrowserBookmark-${string}`;
    readonly last: () => `Agent-${string}` | `Brain-${string}` | `Message-${string}` | `Thread-${string}` | `Relation-${string}` | `Artifact-${string}` | `Flow-${string}` | `Node-${string}` | `TNode-${string}` | `Prompt-${string}` | `Action-${string}` | `Document-${string}` | `Collection-${string}` | `SearchIndex-${string}` | `IndexedDoc-${string}` | `Terminal-${string}` | `Directory-${string}` | `Settings-${string}` | `FAQ-${string}` | `Secret-${string}` | `Note-${string}` | `BrowserTab-${string}` | `BrowserBookmark-${string}` | null;
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
            readonly items: (`Agent-${string}` | `Brain-${string}` | `Message-${string}` | `Thread-${string}` | `Relation-${string}` | `Artifact-${string}` | `Flow-${string}` | `Node-${string}` | `TNode-${string}` | `Prompt-${string}` | `Action-${string}` | `Document-${string}` | `Collection-${string}` | `SearchIndex-${string}` | `IndexedDoc-${string}` | `Terminal-${string}` | `Directory-${string}` | `Settings-${string}` | `FAQ-${string}` | `Secret-${string}` | `Note-${string}` | `BrowserTab-${string}` | `BrowserBookmark-${string}`)[];
            readonly nextCursor: string | null;
        };
        readonly distinct: (field?: string) => /*elided*/ any;
        readonly groupBy: (field: string) => Map<unknown, /*elided*/ any>;
        readonly ids: () => (`Agent-${string}` | `Brain-${string}` | `Message-${string}` | `Thread-${string}` | `Relation-${string}` | `Artifact-${string}` | `Flow-${string}` | `Node-${string}` | `TNode-${string}` | `Prompt-${string}` | `Action-${string}` | `Document-${string}` | `Collection-${string}` | `SearchIndex-${string}` | `IndexedDoc-${string}` | `Terminal-${string}` | `Directory-${string}` | `Settings-${string}` | `FAQ-${string}` | `Secret-${string}` | `Note-${string}` | `BrowserTab-${string}` | `BrowserBookmark-${string}`)[];
        readonly id: () => `Agent-${string}` | `Brain-${string}` | `Message-${string}` | `Thread-${string}` | `Relation-${string}` | `Artifact-${string}` | `Flow-${string}` | `Node-${string}` | `TNode-${string}` | `Prompt-${string}` | `Action-${string}` | `Document-${string}` | `Collection-${string}` | `SearchIndex-${string}` | `IndexedDoc-${string}` | `Terminal-${string}` | `Directory-${string}` | `Settings-${string}` | `FAQ-${string}` | `Secret-${string}` | `Note-${string}` | `BrowserTab-${string}` | `BrowserBookmark-${string}`;
        readonly count: () => number;
        readonly first: () => `Agent-${string}` | `Brain-${string}` | `Message-${string}` | `Thread-${string}` | `Relation-${string}` | `Artifact-${string}` | `Flow-${string}` | `Node-${string}` | `TNode-${string}` | `Prompt-${string}` | `Action-${string}` | `Document-${string}` | `Collection-${string}` | `SearchIndex-${string}` | `IndexedDoc-${string}` | `Terminal-${string}` | `Directory-${string}` | `Settings-${string}` | `FAQ-${string}` | `Secret-${string}` | `Note-${string}` | `BrowserTab-${string}` | `BrowserBookmark-${string}`;
        readonly last: () => `Agent-${string}` | `Brain-${string}` | `Message-${string}` | `Thread-${string}` | `Relation-${string}` | `Artifact-${string}` | `Flow-${string}` | `Node-${string}` | `TNode-${string}` | `Prompt-${string}` | `Action-${string}` | `Document-${string}` | `Collection-${string}` | `SearchIndex-${string}` | `IndexedDoc-${string}` | `Terminal-${string}` | `Directory-${string}` | `Settings-${string}` | `FAQ-${string}` | `Secret-${string}` | `Note-${string}` | `BrowserTab-${string}` | `BrowserBookmark-${string}` | null;
        readonly exists: () => boolean;
        readonly map: <T>(fn: (i: EARS.EntityId) => T) => T[];
        readonly forEach: /*elided*/ any;
        readonly reduce: <T>(fn: (a: T, i: EARS.EntityId) => T, init: T) => T;
    };
    readonly reduce: <T>(fn: (a: T, i: EARS.EntityId) => T, init: T) => T;
};

/**
 * Base interface for persistence sinks.
 * Any storage backend (LMDB, SQLite, etc.) can implement this interface.
 */
interface PersistenceSink {
    onCreateEntity(entityId: string, entityType?: string): void;
    onDestroyEntity(entityId: string): void;
    onPutAttr(kind: string, entityId: string, idx: number, value: unknown, entireArray?: unknown[]): void;
    onDropAttr(kind: string, entityId: string, idx: number, entireArray?: unknown[]): void;
    /** Rewrite the whole array for (kind, entityId) to keep indices consistent. */
    onPutAttrArray?(kind: string, entityId: string, values: unknown[]): void;
    onAddRelation(relId: string, kind: string, src: string, tgt: string, info: unknown): void;
    onUpdateRelation(relId: string, patch: {
        src?: string;
        tgt?: string;
        info?: unknown;
    }): void;
    onRemoveRelation(relId: string): void;
    /** Optional: flush pending operations and close on shutdown */
    close?(): void;
    /** Optional: get error statistics for monitoring */
    getErrorStats?(): {
        errorCount: number;
        lastError: any;
    };
}

type Partition = 'primary' | 'volatileBackup' | 'secrets';
interface PartitionPolicy {
    /** Which partition should an entity live in? */
    routeEntity(entityId: string, entityType?: EARS.Entity): Partition;
    /** Which partition should a relation live in? */
    routeRelation(params: {
        srcType: EARS.Entity;
        tgtType: EARS.Entity;
    }): Partition;
    /** Whether we hydrate a partition on startup (default: only primary). */
    hydrate: Set<Partition>;
}

type LmdbDbs = {
    entities: Database<any>;
    attrs: Database<any>;
    relations: Database<any>;
    root: RootDatabase;
};

declare let envs: {
    primary: LmdbDbs;
    volatileBackup: LmdbDbs;
    secrets: LmdbDbs;
};
declare const policy: PartitionPolicy;
declare let persistence: PersistenceSink & {
    seedRelationMetadata(relId: string, kind: string, src: string, tgt: string): void;
    getRelMeta(): Map<string, {
        kind: string;
        src: string;
        tgt: string;
    }>;
};

declare function closePersistence(): void;
declare function reinitializeLmdb(): void;
/**
 * Reset LMDB by deleting and recreating all database directories.
 * Follows pattern: null → close → delete → recreate
 */
declare function resetLmdbFiles(): Promise<void>;
declare const createEntity: (t: EARS.Entity) => EARS.EntityId;
declare function clearMemory(): void;
declare const putAttr: (id: EARS.EntityId, kind: EARS.AttrKind, val: unknown) => void;
declare const addAttr: (id: EARS.EntityId, kind: EARS.AttrKind, val: unknown) => void;
declare const mergeAttr: (id: EARS.EntityId, kind: EARS.AttrKind, val: unknown, idx?: number) => void;
declare const dropAttr: (id: EARS.EntityId, kind: EARS.AttrKind, idx?: number) => void;
declare const dropIf: (id: EARS.EntityId, kind: EARS.AttrKind, crit: unknown) => void;
declare const updateAttr: (id: EARS.EntityId, kind: EARS.AttrKind, val: unknown) => void;
declare const grantRole: (id: EARS.EntityId, role: string) => void;
declare const revokeRole: (id: EARS.EntityId, role: string) => void;
declare function addRelation(src: EARS.EntityId, kind: string, tgt: EARS.EntityId, info?: unknown): `Agent-${string}` | `Brain-${string}` | `Message-${string}` | `Thread-${string}` | `Relation-${string}` | `Artifact-${string}` | `Flow-${string}` | `Node-${string}` | `TNode-${string}` | `Prompt-${string}` | `Action-${string}` | `Document-${string}` | `Collection-${string}` | `SearchIndex-${string}` | `IndexedDoc-${string}` | `Terminal-${string}` | `Directory-${string}` | `Settings-${string}` | `FAQ-${string}` | `Secret-${string}` | `Note-${string}` | `BrowserTab-${string}` | `BrowserBookmark-${string}`;
declare function updateRelation(relId: EARS.EntityId, newS?: EARS.EntityId, newT?: EARS.EntityId, info?: unknown): void;
declare const removeRelation: (relId: EARS.EntityId) => void;
declare const getAttr: (id: EARS.EntityId, k: EARS.AttrKind, i?: number) => any;
declare const getAttrs: (id: EARS.EntityId, k: EARS.AttrKind) => any[];
declare const getRoles: (id: EARS.EntityId) => string[];
declare const getAll: (id: EARS.EntityId) => Record<string, unknown>;
declare const getAllEntities: () => (`Agent-${string}` | `Brain-${string}` | `Message-${string}` | `Thread-${string}` | `Relation-${string}` | `Artifact-${string}` | `Flow-${string}` | `Node-${string}` | `TNode-${string}` | `Prompt-${string}` | `Action-${string}` | `Document-${string}` | `Collection-${string}` | `SearchIndex-${string}` | `IndexedDoc-${string}` | `Terminal-${string}` | `Directory-${string}` | `Settings-${string}` | `FAQ-${string}` | `Secret-${string}` | `Note-${string}` | `BrowserTab-${string}` | `BrowserBookmark-${string}`)[];
declare const getEntitiesOfType: (t: EARS.Entity) => (`Agent-${string}` | `Brain-${string}` | `Message-${string}` | `Thread-${string}` | `Relation-${string}` | `Artifact-${string}` | `Flow-${string}` | `Node-${string}` | `TNode-${string}` | `Prompt-${string}` | `Action-${string}` | `Document-${string}` | `Collection-${string}` | `SearchIndex-${string}` | `IndexedDoc-${string}` | `Terminal-${string}` | `Directory-${string}` | `Settings-${string}` | `FAQ-${string}` | `Secret-${string}` | `Note-${string}` | `BrowserTab-${string}` | `BrowserBookmark-${string}`)[];
declare const queryEntitiesByRole: (role: string) => (`Agent-${string}` | `Brain-${string}` | `Message-${string}` | `Thread-${string}` | `Relation-${string}` | `Artifact-${string}` | `Flow-${string}` | `Node-${string}` | `TNode-${string}` | `Prompt-${string}` | `Action-${string}` | `Document-${string}` | `Collection-${string}` | `SearchIndex-${string}` | `IndexedDoc-${string}` | `Terminal-${string}` | `Directory-${string}` | `Settings-${string}` | `FAQ-${string}` | `Secret-${string}` | `Note-${string}` | `BrowserTab-${string}` | `BrowserBookmark-${string}`)[];
declare const queryEntitiesByAttribute: (k: EARS.AttrKind, v?: unknown) => (`Agent-${string}` | `Brain-${string}` | `Message-${string}` | `Thread-${string}` | `Relation-${string}` | `Artifact-${string}` | `Flow-${string}` | `Node-${string}` | `TNode-${string}` | `Prompt-${string}` | `Action-${string}` | `Document-${string}` | `Collection-${string}` | `SearchIndex-${string}` | `IndexedDoc-${string}` | `Terminal-${string}` | `Directory-${string}` | `Settings-${string}` | `FAQ-${string}` | `Secret-${string}` | `Note-${string}` | `BrowserTab-${string}` | `BrowserBookmark-${string}`)[];
/** target id participates in *any* relation with `target` (both directions) */
declare const queryEntitiesInRelationTo: (target: EARS.EntityId) => (`Agent-${string}` | `Brain-${string}` | `Message-${string}` | `Thread-${string}` | `Relation-${string}` | `Artifact-${string}` | `Flow-${string}` | `Node-${string}` | `TNode-${string}` | `Prompt-${string}` | `Action-${string}` | `Document-${string}` | `Collection-${string}` | `SearchIndex-${string}` | `IndexedDoc-${string}` | `Terminal-${string}` | `Directory-${string}` | `Settings-${string}` | `FAQ-${string}` | `Secret-${string}` | `Note-${string}` | `BrowserTab-${string}` | `BrowserBookmark-${string}`)[];
/** one specific relation type (+ direction) */
declare const queryEntitiesByRelationTo: (relKind: string, id: EARS.EntityId, asSource?: boolean) => (`Agent-${string}` | `Brain-${string}` | `Message-${string}` | `Thread-${string}` | `Relation-${string}` | `Artifact-${string}` | `Flow-${string}` | `Node-${string}` | `TNode-${string}` | `Prompt-${string}` | `Action-${string}` | `Document-${string}` | `Collection-${string}` | `SearchIndex-${string}` | `IndexedDoc-${string}` | `Terminal-${string}` | `Directory-${string}` | `Settings-${string}` | `FAQ-${string}` | `Secret-${string}` | `Note-${string}` | `BrowserTab-${string}` | `BrowserBookmark-${string}`)[];
declare function destroyEntity(id: EARS.EntityId, skipPersistence?: boolean): void;
declare const getAllAttributeKinds: () => EARS.AttrKind[];
declare const getAllRelationKinds: () => string[];
declare const getAllEntityTypes: () => EARS.Entity[];
declare const getAttributeStats: (kind: EARS.AttrKind) => {
    entityCount: number;
    totalValues: number;
};

declare function descendants(start: EARS.EntityId, relKind: EARS.RelKind): EARS.EntityId[];
declare function ancestors(start: EARS.EntityId, relKind: EARS.RelKind): EARS.EntityId[];
declare function rootParent(start: EARS.EntityId, relKind: EARS.RelKind): EARS.EntityId;
declare function wouldCreateCycle(src: EARS.EntityId, tgt: EARS.EntityId, kinds: readonly EARS.RelKind[]): boolean;
declare function linkSymmetric(a: EARS.EntityId, b: EARS.EntityId, kind: EARS.RelKind, info?: unknown): void;
declare function topoSort(roots: EARS.EntityId[], kind: EARS.RelKind): EARS.EntityId[];
declare function shortestPath(src: EARS.EntityId, tgt: EARS.EntityId, kinds: EARS.RelKind[]): EARS.EntityId[] | null;
declare function leaves(kind: EARS.RelKind, filterType?: EARS.Entity): EARS.EntityId[];
declare function lowestCommonAncestor(a: EARS.EntityId, b: EARS.EntityId, treeKind?: "contains"): EARS.EntityId | null;

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
    readonly id: () => `Agent-${string}` | `Brain-${string}` | `Message-${string}` | `Thread-${string}` | `Relation-${string}` | `Artifact-${string}` | `Flow-${string}` | `Node-${string}` | `TNode-${string}` | `Prompt-${string}` | `Action-${string}` | `Document-${string}` | `Collection-${string}` | `SearchIndex-${string}` | `IndexedDoc-${string}` | `Terminal-${string}` | `Directory-${string}` | `Settings-${string}` | `FAQ-${string}` | `Secret-${string}` | `Note-${string}` | `BrowserTab-${string}` | `BrowserBookmark-${string}`;
};

declare class AtomicTransaction {
    private operations;
    private committed;
    private rolledBack;
    private readonly createdEntities;
    private readonly createdRelations;
    create(type: EARS.Entity): EARS.EntityId;
    put(id: EARS.EntityId, kind: EARS.AttrKind | string, value: unknown, allowMultiple?: boolean): this;
    add(id: EARS.EntityId, kind: EARS.AttrKind | string, value: unknown): this;
    batchPut(id: EARS.EntityId, attrs: Record<string, unknown>): this;
    merge(id: EARS.EntityId, kind: EARS.AttrKind | string, value: unknown, idx?: number): this;
    drop(id: EARS.EntityId, kind: EARS.AttrKind | string, idx?: number): this;
    dropIf(id: EARS.EntityId, kind: EARS.AttrKind | string, criteria: unknown): this;
    grant(id: EARS.EntityId, role: string): this;
    revoke(id: EARS.EntityId, role: string): this;
    link(src: EARS.EntityId, kind: EARS.RelKind, tgt: EARS.EntityId, info?: unknown): this;
    linkOne(src: EARS.EntityId, kind: EARS.RelKind, tgt: EARS.EntityId, info?: unknown): this;
    unlink(relId: EARS.EntityId): this;
    destroy(id: EARS.EntityId): this;
    commit(): boolean;
    rollback(): void;
    private partialRollback;
    private ensureActive;
    get isCommitted(): boolean;
    get isRolledBack(): boolean;
    get operationCount(): number;
    get createdEntityCount(): number;
    get createdRelationCount(): number;
}

interface Blueprint {
    entity: EARS.Entity;
    attrs?: Record<string, unknown>;
    roles?: EARS.RoleKind[];
    uniqueRoles?: EARS.RoleKind[];
    rels?: Array<{
        kind: EARS.RelKind;
        target: Blueprint | EARS.EntityId;
        info?: unknown;
    }>;
}
/** Fluent builder */
declare const bp: (entity: EARS.Entity) => {
    attr(k: string, v: unknown): /*elided*/ any;
    grant(r: EARS.RoleKind): /*elided*/ any;
    ensure(r: EARS.RoleKind): /*elided*/ any;
    link(kind: EARS.RelKind, target: Blueprint | EARS.EntityId, info?: unknown): /*elided*/ any;
    build(): Blueprint;
};
declare function spawn(root: Blueprint, { dedupe }?: {
    dedupe?: boolean | undefined;
}): EARS.EntityId;

/**
 * DSL Export Module
 * This module exports all types and functions needed for the EARS DSL
 * Used to generate type definitions for Monaco Editor
 */

declare function getSchemaStats(): {
    entities: Record<string, number>;
    attributes: Record<string, number>;
    relations: Record<string, number>;
};
declare function isEntity(value: unknown): value is EARS.Entity;
type QueryBuilder = ReturnType<typeof qx>;
type EntityId = EARS.EntityId;
type Entity = EARS.Entity;
type RelKind = EARS.RelKind;
type AttrKind = EARS.AttrKind;

export { AtomicTransaction, AttrKind, EARS, Entity, RelKind, addAttr, addRelation, ancestors, bp, clearMemory, closePersistence, createEntity, descendants, destroyEntity, dropAttr, dropIf, envs, getAll, getAllAttributeKinds, getAllEntities, getAllEntityTypes, getAllRelationKinds, getAttr, getAttributeStats, getAttrs, getEntitiesOfType, getRoles, getSchemaStats, grantRole, isEntity, leaves, linkSymmetric, lowestCommonAncestor, mergeAttr, persistence, policy, putAttr, queryEntitiesByAttribute, queryEntitiesByRelationTo, queryEntitiesByRole, queryEntitiesInRelationTo, qx, reinitializeLmdb, removeRelation, resetLmdbFiles, revokeRole, rootParent, shortestPath, spawn, topoSort, tx, updateAttr, updateRelation, wouldCreateCycle };
export type { BaseEntity, EntityId, QueryBuilder };

}
