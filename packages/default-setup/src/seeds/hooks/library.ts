// How library rows are seeded, for any pack that seeds Collection or Document rows: through
// libraryCommands, so seeded documents get shortCodes and display order, and collections nest with
// PARENT_OF and hold documents with contains, like rows created in the app. Rows match by name
// within their folder, as the library itself names them.
import type { SeedHooks, SeedRecord } from '@abuddy/sdk/seed';
import { EARS, findWhere, qx } from '@/__generated__/ears';
import { repository } from '@/__generated__/repository';
import type { ContentSection } from '@/features/library/be/types';

export interface DocumentSeedRecord extends SeedRecord {
  name: string;
  content: ContentSection[];
  tags?: string[];
}

export interface CollectionSeedRecord extends SeedRecord {
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
function namedIn<R extends { id: EARS.EntityId; sourceHash?: string }>(
  rows: R[],
  relKind: EARS.RelKind,
  parentId: EARS.EntityId | undefined,
): { id: EARS.EntityId; sourceHash?: string } | undefined {
  const match = rows.find((row) => folderOf(row.id, relKind) === parentId);
  return match && { id: match.id, sourceHash: match.sourceHash };
}

export const documentSeedHooks: SeedHooks<DocumentSeedRecord> = {
  find(record, { parentId }) {
    return namedIn(findWhere(EARS.Entity.Document, 'name', record.name), EARS.RelKind.CONTAINS, parentId);
  },

  create(record, { parentId }) {
    return repository.libraryCommands.createDocument(record.name, record.content, record.tags ?? [], parentId, undefined, record.sourceHash).id;
  },

  update(id, record) {
    repository.libraryCommands.updateDocument(id, record.name, record.content, record.tags ?? [], undefined, record.sourceHash);
  },

  remove(id) {
    repository.libraryCommands.deleteDocument(id);
  },
};

export const collectionSeedHooks: SeedHooks<CollectionSeedRecord> = {
  // A folder holds other packs' documents too, so one another pack seeded is seeded into, not copied
  container: true,

  find(record, { parentId }) {
    return namedIn(findWhere(EARS.Entity.Collection, 'name', record.name), EARS.RelKind.PARENT_OF, parentId);
  },

  create(record, { parentId }) {
    return repository.libraryCommands.createCollection(record.name, record.description, parentId, undefined, record.sourceHash).id;
  },

  /** A description the record no longer sets is emptied */
  update(id, record, { clearedFields }) {
    const description = record.description ?? (clearedFields.includes('description') ? '' : undefined);
    repository.libraryCommands.updateCollection(id, record.name, description, record.sourceHash);
  },

  remove(id) {
    repository.libraryCommands.deleteCollection(id);
  },
};
