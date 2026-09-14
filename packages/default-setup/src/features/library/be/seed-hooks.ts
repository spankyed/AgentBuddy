// How library rows are seeded, for any pack that seeds Collection or Document rows: through
// libraryCommands, so seeded documents get shortCodes and display order, and collections nest with
// PARENT_OF and hold documents with contains, like rows created in the app. Rows match by name
// across the whole library.
import type { SeedHooks, SeedRecord } from '@abuddy/sdk/seed';
import { EARS, findWhere } from '@/__generated__/ears';
import { repository } from '@/__generated__/repository';
import type { ContentSection } from './types';

export interface DocumentSeedRecord extends SeedRecord {
  name: string;
  content: ContentSection[];
  tags?: string[];
}

export interface CollectionSeedRecord extends SeedRecord {
  name: string;
  description?: string;
}

export const documentSeedHooks: SeedHooks<DocumentSeedRecord> = {
  find(record) {
    const match = findWhere(EARS.Entity.Document, 'name', record.name)[0];
    return match && { id: match.id, sourceHash: match.sourceHash };
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
  find(record) {
    const match = findWhere(EARS.Entity.Collection, 'name', record.name)[0];
    return match && { id: match.id, sourceHash: match.sourceHash };
  },

  create(record, { parentId }) {
    return repository.libraryCommands.createCollection(record.name, record.description, parentId, undefined, record.sourceHash).id;
  },

  update(id, record) {
    repository.libraryCommands.updateCollection(id, record.name, record.description, record.sourceHash);
  },

  remove(id) {
    repository.libraryCommands.deleteCollection(id);
  },
};
