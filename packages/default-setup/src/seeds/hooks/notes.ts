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

/** Flags and saved order noteCommands.create doesn't take */
function applyExtras(id: EARS.EntityId, record: NoteSeedRecord): void {
  const flags: { favorite?: boolean; hideCompletedChildren?: boolean } = {};
  if (record.favorite) flags.favorite = true;
  if (record.hideCompletedChildren) flags.hideCompletedChildren = true;
  if (Object.keys(flags).length > 0) repository.noteCommands.update(id, flags);
  if (record.savedDisplayOrder != null) repository.noteCommands.update(id, { savedDisplayOrder: record.savedDisplayOrder });
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
    const note = repository.noteCommands.create({
      title: record.title,
      content: record.content || '',
      icon: record.icon,
      parentId,
      noteType: record.noteType,
      completed: record.completed ?? false,
      displayOrder: record.displayOrder ?? index,
    });
    applyExtras(note.id, record);
    return note.id;
  },

  update(id, record, { index }) {
    repository.noteCommands.update(id, {
      content: record.content || '',
      icon: record.icon,
      completed: record.completed ?? false,
      displayOrder: record.displayOrder ?? index,
    });
    applyExtras(id, record);
  },

  remove(id) {
    repository.noteCommands.delete(id);
  },
};
