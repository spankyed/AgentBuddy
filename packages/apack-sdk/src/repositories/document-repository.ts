// Documents and the folders holding them: the SDK declares `Document`, `Collection` and `parent_of`, so
// the app can read documents itself — `getCommands()` is a query over the ones whose `documentType` marks
// them command lists — and a pack can store one without depending on whichever pack used to own them.
//
// **The tree's mechanics are here; its presentation is not.** A document's place among its siblings is
// written when it is created, and siblings are mixed — folders by `parent_of`, documents by `contains` —
// so an entity that moved without them would sort differently depending on who wrote it. What stays with
// the feature that draws the tree is everything a view wants: paths, counts, child shapes, the index,
// search, symlink resolution. These return rows and ids; a DTO is the editor's.
import { installedEngine as ears, untypedQx as qx, untypedTx as tx } from '@apackdev/ears';
import { EARS } from '../types/entities.ts';
import type { CollectionEntity, ContentSection, DocumentEntity } from '../types/sdk-entities.ts';

/** A document's fields, as it is created */
export interface DocumentInput {
  name: string;
  content: ContentSection[];
  tags?: string[];
  /** The folder to put it in; absent leaves it at the root */
  parentId?: EARS.EntityId;
  /** What the document is: `commands` marks a slash-command list */
  documentType?: string;
  contentHash?: string;
  /** An id to create it under, for a caller restoring a row rather than making one */
  id?: string;
}

/** A folder's fields, as it is created */
export interface CollectionInput {
  name: string;
  description?: string;
  parentId?: EARS.EntityId;
  contentHash?: string;
  id?: string;
}

/** The gap left between siblings, so one can be dropped between two without renumbering them */
const ORDER_GAP = 1000;

/** A row's display order, tolerating the array an older write left */
export function displayOrderOf(row: unknown): number {
  const order = (row as { displayOrder?: unknown } | undefined)?.displayOrder;
  return Array.isArray(order) ? (order[0] as number) || 0 : (order as number) || 0;
}

/** The folder holding `childId`, or none when it is at the root */
export function parentCollectionOf(childId: EARS.EntityId): EARS.EntityId | null {
  const [relation] = ears().findRelations({ relationType: EARS.RelKind.PARENT_OF, targetEntity: childId });
  return (relation?.sourceEntity as EARS.EntityId) ?? null;
}

/** The folder holding `documentId`, or none when it is at the root */
export function collectionOfDocument(documentId: EARS.EntityId): EARS.EntityId | null {
  const [relation] = ears().findRelations({ relationType: EARS.RelKind.CONTAINS, targetEntity: documentId });
  return (relation?.sourceEntity as EARS.EntityId) ?? null;
}

/** A folder's names from the root down to it */
export function collectionPath(collectionId: EARS.EntityId): string[] {
  const path: string[] = [];
  for (let id: EARS.EntityId | null = collectionId; id !== null; id = parentCollectionOf(id)) {
    const [row] = qx(id).pickAll() as Array<Record<string, unknown>>;
    if (row) path.unshift(String(row.name));
  }
  return path;
}

/**
 * Where a new child of `parentId` sorts: after every sibling, folders and documents alike.
 *
 * Both kinds share one ordering because the tree shows them together, which is why this cannot be
 * answered by either entity's own rows.
 */
export function nextDisplayOrder(parentId: EARS.EntityId | null): number {
  const siblings = parentId === null
    ? [
      ...(qx(EARS.Entity.Collection).pickAll() as Array<Record<string, unknown>>)
        .filter((row) => parentCollectionOf(row.id as EARS.EntityId) === null),
      ...(qx(EARS.Entity.Document).pickAll() as Array<Record<string, unknown>>)
        .filter((row) => collectionOfDocument(row.id as EARS.EntityId) === null),
    ]
    : [
      ...(qx(parentId).linksTo(EARS.RelKind.PARENT_OF, EARS.Entity.Collection).pickAll() as Array<Record<string, unknown>>),
      ...(qx(parentId).linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Document).pickAll() as Array<Record<string, unknown>>),
    ];
  return Math.max(0, ...siblings.map(displayOrderOf)) + ORDER_GAP;
}

/** Rows and writes of documents */
export const documentRepository = {
  byId: (id: EARS.EntityId): DocumentEntity | undefined => ears().findById<DocumentEntity>(id) ?? undefined,

  all: (): DocumentEntity[] => ears().findAll<DocumentEntity>(EARS.Entity.Document),

  /**
   * Every document of `documentType`, in the order the tree shows them: display order, then name.
   *
   * This is what the chat's slash commands are read through, so the order is the list's order and not
   * an accident of insertion.
   */
  ofType: (documentType: string): DocumentEntity[] =>
    documentRepository.all()
      .filter((document) => document.documentType === documentType)
      .sort((a, b) => displayOrderOf(a) - displayOrderOf(b) || a.name.localeCompare(b.name)),

  create: (data: DocumentInput): DocumentEntity => {
    const { parentId, id, tags, documentType, contentHash, ...fields } = data;
    const now = Date.now();
    // Both are read before the row exists: creating the builder creates it, and it would then count
    // itself as a document and sort as its own sibling
    const shortCode = `DOC-${qx(EARS.Entity.Document).count() + 1}`;
    const displayOrder = nextDisplayOrder(parentId ?? null);
    const builder = id ? tx(id as EARS.EntityId, true) : tx(EARS.Entity.Document);
    const documentId = builder.id();
    builder.updateBatch({
      ...fields,
      shortCode,
      displayOrder,
      tags: tags ?? [],
      ...(documentType !== undefined && { documentType }),
      ...(contentHash && { contentHash }),
      createdAt: now,
      updatedAt: now,
    });
    if (parentId) tx(parentId).link(EARS.RelKind.CONTAINS, documentId);
    return (qx(documentId).pickAll() as unknown as DocumentEntity[])[0];
  },

  /**
   * Writes the fields given. A `parentId` moves the document into that folder; omitting it leaves the
   * document in whichever folder it is already in. Moving one back out to the root is not expressible
   * here — a move out of every folder is an unlink, which the editor's own move does.
   */
  update: (id: EARS.EntityId, updates: Partial<DocumentInput>): void => {
    const { parentId, id: _id, tags, documentType, contentHash, ...fields } = updates;
    tx(id).updateBatch({
      ...fields,
      ...(documentType !== undefined && { documentType }),
      ...(contentHash && { contentHash }),
      updatedAt: Date.now(),
    });
    // An array is written on its own, as `updateBatch` takes one attribute's list at a time
    if (tags) tx(id).updateBatch({ tags });
    if (parentId === undefined) return;
    const current = collectionOfDocument(id);
    if (current === parentId) return;
    if (current) tx(current).unlinkIf(EARS.RelKind.CONTAINS, id);
    if (parentId) tx(parentId).safeLink(EARS.RelKind.CONTAINS, id);
  },

  /** Removes the document and the link holding it, which no longer names anything */
  remove: (id: EARS.EntityId): void => {
    const parent = collectionOfDocument(id);
    if (parent) tx(parent).unlinkIf(EARS.RelKind.CONTAINS, id);
    tx(id).destroy();
  },
};

/** Rows and writes of the folders documents sit in */
export const collectionRepository = {
  byId: (id: EARS.EntityId): CollectionEntity | undefined => ears().findById<CollectionEntity>(id) ?? undefined,

  all: (): CollectionEntity[] => ears().findAll<CollectionEntity>(EARS.Entity.Collection),

  /** The folders directly inside `parentId`, or the root ones */
  children: (parentId: EARS.EntityId | null): CollectionEntity[] => (parentId === null
    ? collectionRepository.all().filter((row) => parentCollectionOf(row.id as EARS.EntityId) === null)
    : qx(parentId).linksTo(EARS.RelKind.PARENT_OF, EARS.Entity.Collection).pickAll() as unknown as CollectionEntity[]),

  /** The documents directly inside `parentId` */
  documents: (parentId: EARS.EntityId): DocumentEntity[] =>
    qx(parentId).linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Document).pickAll() as unknown as DocumentEntity[],

  create: (data: CollectionInput): CollectionEntity => {
    const { parentId, id, description, contentHash, ...fields } = data;
    const now = Date.now();
    // Read before the row exists, which would otherwise sort as its own sibling
    const displayOrder = nextDisplayOrder(parentId ?? null);
    const builder = id ? tx(id as EARS.EntityId, true) : tx(EARS.Entity.Collection);
    const collectionId = builder.id();
    builder.updateBatch({
      ...fields,
      displayOrder,
      ...(contentHash && { contentHash }),
      // A folder is named, not numbered: it has no shortCode, so an empty description is simply absent
      ...(description ? { description } : {}),
      createdAt: now,
      updatedAt: now,
    });
    if (parentId) tx(parentId).link(EARS.RelKind.PARENT_OF, collectionId);
    return (qx(collectionId).pickAll() as unknown as CollectionEntity[])[0];
  },

  /** A description given as `''` is emptied; one left out is kept */
  update: (id: EARS.EntityId, updates: Partial<Omit<CollectionInput, 'parentId' | 'id'>>): void => {
    const { description, contentHash, ...fields } = updates;
    tx(id).updateBatch({
      ...fields,
      ...(contentHash && { contentHash }),
      ...(description !== undefined && { description }),
      updatedAt: Date.now(),
    });
  },

  /**
   * Removes the folder, keeping what it held: its documents go to the root and its folders to its own
   * parent. A folder is a place rather than an owner, so deleting one is not deleting what was in it.
   */
  remove: (id: EARS.EntityId): void => {
    for (const document of collectionRepository.documents(id)) {
      tx(id).unlinkIf(EARS.RelKind.CONTAINS, document.id as EARS.EntityId);
    }
    const parent = parentCollectionOf(id);
    if (parent) tx(parent).unlinkIf(EARS.RelKind.PARENT_OF, id);
    for (const child of collectionRepository.children(id)) {
      const childId = child.id as EARS.EntityId;
      tx(id).unlinkIf(EARS.RelKind.PARENT_OF, childId);
      if (parent) tx(parent).link(EARS.RelKind.PARENT_OF, childId);
    }
    tx(id).destroy();
  },
};
