import type { FlowEARS } from '../build/compilers/flow-compiler.ts';
import type { NotesEARS } from './import-notes.ts';

// Flows, notes and library documents are default-setup's entities. A pack seeding them doesn't have
// to depend on default-setup, so its own EARS may not name them.

export const FLOW_NAMES: FlowEARS = {
  Entity: { Flow: 'Flow', Node: 'Node', Action: 'Action', Prompt: 'Prompt' },
  RelKind: { CONTAINS: 'contains', INSTANCE_OF: 'instance_of', TRANSITIONS_TO: 'transitions_to' },
};

export const NOTES_NAMES: NotesEARS = {
  Entity: { Note: 'Note' },
  RelKind: { CONTAINS: 'contains' },
};

export const LIBRARY_NAMES = {
  Entity: { Collection: 'Collection', Document: 'Document' },
};
