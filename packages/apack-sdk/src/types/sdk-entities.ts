/**
 * The entity types and relation kinds the SDK owns: the EARS engine's own (Relation) and the data
 * model the SDK's compilers, appliers and repositories are written against (flows and their nodes,
 * step executions, actions and prompts). Every pack has them, and no pack declares them. The
 * generator, the manifest schema and the host all read this module.
 *
 * The shapes here are part of the typed EARS contract (packages/apack-sdk/TYPED-EARS.md).
 */
import type { BaseEntity, RequiredField, RowRules, ShortCode } from '@apackdev/ears';
import type { EARS } from './entities.ts';
import type { TNodeEntity } from '../steps/types.ts';

export const SDK_ENTITIES = {
  /** Every link between two entities */
  Relation: 'Relation',
  Flow: 'Flow',
  /** A flow's step or trigger */
  Node: 'Node',
  /** A step's execution record: runtime only, never persisted */
  TNode: 'TNode',
  Action: 'Action',
  Prompt: 'Prompt',
  /** Text a pack ships and the user edits; a feature's surface is the editor over these rows */
  Document: 'Document',
  /** A folder documents and other folders sit in */
  Collection: 'Collection',
} as const;

export const SDK_REL_KINDS = {
  CONTAINS: 'contains',
  TRANSITIONS_TO: 'transitions_to',
  INSTANCE_OF: 'instance_of',
  /** A TNode's child executions */
  SPAWNED: 'spawned',
  /** The event TNodes a flow's TNode tracks */
  TRACKED: 'tracked',
  /** A folder's child folders; its documents are `contains` */
  PARENT_OF: 'parent_of',
} as const;

/** The roles the SDK's flow model grants, which every pack has and none declares */
export const SDK_ROLES = {
  /** The flow that starts when the app boots */
  ROOT_FLOW: 'root_flow',
  /** A flow's entry listener: the node a flow's entry track starts from */
  ENTRY_EVENT: 'entry_event',
} as const;

/** Entity types kept out of persistence */
export const SDK_EXCLUDED_ENTITY_TYPES: readonly string[] = [SDK_ENTITIES.TNode];

export interface ActionParameter {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any';
  description?: string;
  required?: boolean;
  default?: unknown;
  placeholder?: string;
}

export interface TemplateInput {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any';
  description?: string;
  required?: boolean;
  defaultValue?: unknown;
  example?: unknown;
}

/**
 * The fields every Node row has. A pack's step node types extend it (`interface FireNode extends
 * NodeBase`), and `apack pack generate-entries` unions them into the pack's shape for Node.
 */
export interface NodeBase extends BaseEntity {
  entityType: typeof SDK_ENTITIES.Node;
  nodeType: string;
  label: string;
  description?: string;
  color?: string;
  final?: boolean;
}

export interface RelationEntity extends BaseEntity {
  relationDetails: EARS.RelationDetail;
}

export interface FlowEntity extends BaseEntity {
  entityType: typeof SDK_ENTITIES.Flow;
  /** Numbered by `create` */
  shortCode: ShortCode<'F'>;
  label: string;
  description?: string;
  flowType: 'workflow' | 'integration';
  createdAt: number;
  contentHash?: string;
}

export interface ActionEntity extends BaseEntity {
  entityType: typeof SDK_ENTITIES.Action;
  label: string;
  description?: string;
  category?: string;
  input: Record<string, ActionParameter>;
  actionFn: string;
  output?: unknown;
  /** SHA256 hash of DSL source at the last apply. Absent on user-created actions. */
  contentHash?: string;
  /** Numbered by `create` */
  shortCode: ShortCode<'ACT'>;
  createdAt: number;
  updatedAt: number;
}

export interface PromptEntity extends BaseEntity {
  entityType: typeof SDK_ENTITIES.Prompt;
  label: string;
  description?: string;
  category?: string;
  inputs: Record<string, TemplateInput>;
  /** Stored as a string, evaluated at runtime */
  templateFn: string;
  /** Optional JSON schema for structured output */
  outputSchema?: unknown;
  /** SHA256 hash of DSL source at the last apply. Absent on user-created prompts. */
  contentHash?: string;
  /** Numbered by `create` */
  shortCode: ShortCode<'PROMPT'>;
  createdAt: number;
  updatedAt: number;
}

export interface FieldContent { type: 'field'; fields: Array<{ key: string; value: string }> }
export interface ListContent { type: 'list'; items: string[] }
export interface MarkdownContent { type: 'markdown'; text: string }
export interface TextContent { type: 'text'; text: string }
export interface CodeContent { type: 'code'; text: string; language: string }

/** A section of a document's content, as a markdown source's `<!-- section:<type> -->` markers split it */
export type ContentSection = FieldContent | ListContent | MarkdownContent | TextContent | CodeContent;
export type ContentType = ContentSection['type'];

/** A document's human-readable code, which `create` numbers */
export type DocumentShortCode = ShortCode<'DOC'>;

/**
 * A document: text a pack ships and the user edits.
 *
 * The SDK owns it because the app reads it — `getCommands()` is a query over the documents whose
 * `documentType` marks them command lists — and because a pack can then store one without depending on
 * whichever pack used to own them. A feature's surface is the editor over these rows, as the flows canvas
 * is over `Flow`.
 *
 * `displayOrder` is here rather than with that editor because it is written when a document is created,
 * and its siblings are mixed: folders by `parent_of`, documents by `contains`. An entity that moved
 * without it would sort differently depending on who wrote it.
 */
export interface DocumentEntity extends BaseEntity {
  entityType: typeof SDK_ENTITIES.Document;
  name: string;
  content: ContentSection[];
  /** Numbered by `create` */
  shortCode: DocumentShortCode;
  displayOrder?: number;
  tags?: string[];
  /** What the document is: `commands` marks a slash-command list. Absent, it is just a document. */
  documentType?: string;
  /** Hash of the content source at the last apply. Absent on user-created documents. */
  contentHash?: string;
}

/**
 * A folder, holding documents by `contains` and other folders by `parent_of`.
 *
 * A place rather than an owner: removing one keeps what it held. `symlinkPath` is a folder standing for a
 * directory on disk — the field is stored here, and resolving it is the editor's, since nothing in the
 * core reads the filesystem.
 */
export interface CollectionEntity extends BaseEntity {
  entityType: typeof SDK_ENTITIES.Collection;
  name: string;
  description?: string;
  displayOrder?: number;
  symlinkPath?: string;
  /** Hash of the content source at the last apply. Absent on user-created folders. */
  contentHash?: string;
}

/**
 * Shapes of the SDK's entities; every pack's generated PackShapes includes them. A pack that defines
 * steps reads Node rows as its step node types (and its dependencies') instead of NodeBase.
 */
export type SdkEntityShapes = {
  Relation: RelationEntity;
  Flow: FlowEntity;
  Node: NodeBase;
  TNode: TNodeEntity;
  Action: ActionEntity;
  Prompt: PromptEntity;
  Document: DocumentEntity;
  Collection: CollectionEntity;
};

/** The keys of SdkEntityShapes, at runtime */
export const SDK_SHAPED_ENTITIES = [
  SDK_ENTITIES.Relation, SDK_ENTITIES.Flow, SDK_ENTITIES.Node, SDK_ENTITIES.TNode, SDK_ENTITIES.Action, SDK_ENTITIES.Prompt,
  SDK_ENTITIES.Document, SDK_ENTITIES.Collection,
] as const;

// Fails to compile when SDK_SHAPED_ENTITIES and SdkEntityShapes list different entities
type SameKeys<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const shapedEntitiesMatchShapes: SameKeys<(typeof SDK_SHAPED_ENTITIES)[number], keyof SdkEntityShapes> = true;
void shapedEntitiesMatchShapes;

/** The prefix a shape's `shortCode` is numbered with (`ShortCode<prefix>`), or `never` when it has none */
type ShortCodePrefix<T> = T extends { shortCode: ShortCode<infer P> } ? P : never;

/**
 * What each SDK entity's created row is held to (`RowRules`): the fields it must hold, which `create` refuses a row
 * without at runtime as its type refuses one at compile time, and the prefix it numbers a short code with. The rules
 * are the shapes' own: this fails to compile naming the field when a list misses or adds one, and when a prefix
 * isn't the one the shape's `ShortCode` names or a shape's prefix is missing. Relation has none a row carries, its
 * details being the engine's to write.
 */
export const SDK_ROW_RULES = {
  Relation: { required: [] },
  Flow: { required: ['shortCode', 'label', 'flowType'], shortCode: 'F' },
  Node: { required: ['nodeType', 'label'] },
  TNode: { required: ['tNodeType', 'label', 'status', 'startedAt'] },
  Action: { required: ['label', 'input', 'actionFn', 'shortCode'], shortCode: 'ACT' },
  Prompt: { required: ['label', 'inputs', 'templateFn', 'shortCode'], shortCode: 'PROMPT' },
  Document: { required: ['name', 'content', 'shortCode'], shortCode: 'DOC' },
  Collection: { required: ['name'] },
} as const satisfies {
  [E in keyof SdkEntityShapes]: RowRules & {
    required: readonly RequiredField<SdkEntityShapes, E>[];
    shortCode?: ShortCodePrefix<SdkEntityShapes[E]>;
  }
};

type UnlistedRequired = {
  [E in keyof SdkEntityShapes]: Exclude<RequiredField<SdkEntityShapes, E>, (typeof SDK_ROW_RULES)[E]['required'][number]>
}[keyof SdkEntityShapes];
const requiredFieldsListed: [UnlistedRequired] extends [never] ? true : UnlistedRequired = true;
void requiredFieldsListed;

type UnnumberedShortCode = {
  [E in keyof SdkEntityShapes]: [ShortCodePrefix<SdkEntityShapes[E]>] extends [never] ? never
    : (typeof SDK_ROW_RULES)[E] extends { shortCode: string } ? never : E
}[keyof SdkEntityShapes];
const shortCodesNumbered: [UnnumberedShortCode] extends [never] ? true : UnnumberedShortCode = true;
void shortCodesNumbered;
