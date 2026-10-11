// How library entities are written, for any pack whose content declares Collection or Document: through
// libraryCommands, so written documents get shortCodes and display order, and collections nest with
// PARENT_OF and hold documents with contains, like rows created in the app. Rows match by name
// within their folder, as the library itself names them.
import type { ContentWriter, ContentItem } from '@apack/sdk/content';
import { EARS, findWhere, qx } from '#generated/ears.ts';
import { repository } from '#generated/repository.ts';
import type { ContentSection } from '#features/library/be/types.ts';

export interface DocumentItem extends ContentItem {
  name: string;
  content: ContentSection[];
  tags?: string[];
}

export interface CollectionItem extends ContentItem {
  name: string;
  description?: string;
}

/** The folder a row sits in, or undefined at the library's root */
function folderOf(id: EARS.EntityId, relKind: EARS.RelKind): EARS.EntityId | undefined {
  return qx(id).linksTo(relKind, EARS.Entity.Collection, false).ids()[0];
}

/**
 * The row a record names in its folder. A library name is unique among its siblings, not across the
 * library, so a folder or document of that name elsewhere is a different row.
 */
function namedIn<R extends { id: EARS.EntityId; contentHash?: string }>(
  rows: R[],
  relKind: EARS.RelKind,
  parentId: EARS.EntityId | undefined,
): { id: EARS.EntityId; contentHash?: string } | undefined {
  const match = rows.find((row) => folderOf(row.id, relKind) === parentId);
  return match && { id: match.id, contentHash: match.contentHash };
}

export const documentWriter: ContentWriter<DocumentItem> = {
  find(record, { parentId }) {
    return namedIn(findWhere(EARS.Entity.Document, 'name', record.name), EARS.RelKind.CONTAINS, parentId);
  },

  create(record, { parentId }) {
    return repository.libraryCommands.createDocument(record.name, record.content, record.tags ?? [], parentId, undefined, record.contentHash).id;
  },

  update(id, record) {
    repository.libraryCommands.updateDocument(id, record.name, record.content, record.tags ?? [], undefined, record.contentHash);
  },

  remove(id) {
    repository.libraryCommands.deleteDocument(id);
  },
};

export const collectionWriter: ContentWriter<CollectionItem> = {
  // A folder holds other packs' documents too, so one another pack wrote is written into, not copied
  container: true,

  find(record, { parentId }) {
    return namedIn(findWhere(EARS.Entity.Collection, 'name', record.name), EARS.RelKind.PARENT_OF, parentId);
  },

  create(record, { parentId }) {
    return repository.libraryCommands.createCollection(record.name, record.description, parentId, undefined, record.contentHash).id;
  },

  /** A description the record no longer sets is emptied */
  update(id, record, { clearedFields }) {
    const description = record.description ?? (clearedFields.includes('description') ? '' : undefined);
    repository.libraryCommands.updateCollection(id, record.name, description, record.contentHash);
  },

  remove(id) {
    repository.libraryCommands.deleteCollection(id);
  },
};
