import type { NotesEARS } from './import-notes.ts';
import { SDK_REL_KINDS } from '../types/sdk-entities.ts';

// Notes and library documents are default-setup's entities, which the SDK's notes and library seeders
// write. A pack seeding them doesn't have to depend on default-setup, so its own EARS may not name them.

export const NOTES_NAMES: NotesEARS = {
  Entity: { Note: 'Note' },
  RelKind: { CONTAINS: SDK_REL_KINDS.CONTAINS },
};

export const LIBRARY_NAMES = {
  Entity: { Collection: 'Collection', Document: 'Document' },
};
