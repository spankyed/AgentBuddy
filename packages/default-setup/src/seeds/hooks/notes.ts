// How notes are seeded, for any pack that seeds Note rows: through noteCommands, so seeded notes get
// shortCodes, display order and REFERENCES links like notes created in the app.
import type { SeedHooks, SeedRecord } from '@abuddy/sdk/seed';
import { EARS, findWhere, qx } from '@/__generated__/ears';
import { repository } from '@/__generated__/repository';

export interface NoteSeedRecord extends SeedRecord {
  title: string;
  content?: string;
  icon?: string | null;
  noteType?: 'document' | 'tasklist' | 'task';
  completed?: boolean;
  favorite?: boolean;
  hideCompletedChildren?: boolean;
  displayOrder?: number;
  savedDisplayOrder?: number;
}

type NoteUpdates = Parameters<typeof repository.noteCommands.update>[1];
const UPDATE_FIELDS = ['title', 'content', 'icon', 'noteType', 'completed', 'favorite', 'hideCompletedChildren', 'savedDisplayOrder'] as const;
/** What a note created without these fields holds (noteCommands.create's defaults, and unset flags) */
const NOTE_DEFAULTS: NoteUpdates = { content: '', icon: null, noteType: 'document', completed: false, favorite: false, hideCompletedChildren: false };

/** The fields noteCommands.update takes, as the record sets them (fields it doesn't set are left out) */
function recordUpdates(record: NoteSeedRecord, fields: readonly (typeof UPDATE_FIELDS)[number][] = UPDATE_FIELDS): NoteUpdates {
  return Object.fromEntries(fields.filter((field) => record[field] !== undefined).map((field) => [field, record[field]])) as NoteUpdates;
}

export const noteSeedHooks: SeedHooks<NoteSeedRecord> = {
  /** A note with the record's title under the same parent (or at the root) */
  find(record, { parentId }) {
    const match = findWhere(EARS.Entity.Note, 'title', record.title).find((note) => {
      const parents = qx(note.id).linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Note, false).ids();
      return (parents[0] as string | undefined) === parentId;
    });
    return match && { id: match.id, sourceHash: match.sourceHash };
  },

  create(record, { parentId, index }) {
    // noteCommands.create gives the fields a record doesn't set their defaults
    const note = repository.noteCommands.create({
      title: record.title,
      content: record.content,
      icon: record.icon,
      parentId,
      noteType: record.noteType,
      completed: record.completed,
      displayOrder: record.displayOrder ?? index,
    });
    // Fields noteCommands.create doesn't take
    const extras = recordUpdates(record, ['favorite', 'hideCompletedChildren', 'savedDisplayOrder']);
    if (Object.keys(extras).length > 0) repository.noteCommands.update(note.id, extras);
    return note.id;
  },

  /**
   * Writes every field the record sets, so the row holds the values the seeder records for it, and
   * resets the fields its previous seed set that the record no longer does to a new note's
   */
  update(id, record, { index, clearedFields }) {
    const resets = Object.fromEntries(Object.entries(NOTE_DEFAULTS).filter(([field]) => clearedFields.includes(field))) as NoteUpdates;
    repository.noteCommands.update(id, { ...resets, ...recordUpdates(record), displayOrder: record.displayOrder ?? index });
  },

  remove(id) {
    repository.noteCommands.delete(id);
  },
};
