import { repository, hasIdCollision } from '../ears/index';
import { findWhere, qx } from '../ears/internals';
import type { ExportedNote, ExportedNotes } from '../build/compilers/compile-notes';

export interface NotesEARS {
  Entity: Record<string, any>;
  RelKind: Record<string, any>;
}

export interface NotesImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

function findExistingNote(
  title: string,
  parentId: string | undefined,
  ears: NotesEARS,
): any | undefined {
  const candidates = findWhere(ears.Entity.Note, 'title', title);
  return candidates.find((note: any) => {
    const parents = qx(note.id).linksTo(ears.RelKind.CONTAINS, ears.Entity.Note, false).ids();
    const noteParentId = parents.length > 0 ? parents[0] : undefined;
    return noteParentId === parentId;
  });
}

function applyNoteUpdates(
  noteId: string,
  opts: { favorite?: boolean; hideCompletedChildren?: boolean; content?: string },
): void {
  const repo = repository as any;
  const updates: Record<string, any> = {};
  if (opts.favorite) updates.favorite = true;
  if (opts.hideCompletedChildren) updates.hideCompletedChildren = true;
  if (opts.content !== undefined) updates.content = opts.content;
  if (Object.keys(updates).length > 0) {
    repo.noteCommands.update(noteId, updates);
  }
}

export function importNotesFromData(data: ExportedNotes, ears: NotesEARS): NotesImportResult {
  const result: NotesImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };
  if (!data?.notes || !Array.isArray(data.notes)) {
    result.errors.push('Invalid import data: expected object with "notes" array');
    return result;
  }
  importNoteNodes(data.notes, undefined, result, ears);
  return result;
}

function importNoteNodes(
  nodes: ExportedNote[],
  parentId: string | undefined,
  result: NotesImportResult,
  ears: NotesEARS,
): void {
  const repo = repository as any;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node || !node.type || !node.title) {
      result.errors.push(`Note at index ${i} is missing required fields`);
      result.skipped++;
      continue;
    }

    const existing = findExistingNote(node.title, parentId, ears);
    if (existing) {
      try {
        repo.noteCommands.update(existing.id, {
          content: node.content || '',
          icon: node.icon,
          completed: node.completed ?? false,
          displayOrder: node.displayOrder ?? i,
        });
        applyNoteUpdates(existing.id as string, {
          favorite: node.favorite,
          hideCompletedChildren: node.hideCompletedChildren,
        });
        if (node.savedDisplayOrder != null) {
          repo.noteCommands.update(existing.id, { savedDisplayOrder: node.savedDisplayOrder });
        }
        result.updated++;

        if (node.children && node.children.length > 0) {
          importNoteNodes(node.children, existing.id as string, result, ears);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.errors.push(`Failed to update note "${node.title}": ${message}`);
        result.skipped++;
      }
      continue;
    }

    if (node.id && hasIdCollision(node.id as any)) {
      result.errors.push(`Skipped note "${node.title}": entity ID already exists (${node.id})`);
      result.skipped++;
      continue;
    }

    try {
      const note = repo.noteCommands.create({
        title: node.title,
        content: node.content || '',
        icon: node.icon,
        parentId,
        noteType: node.type,
        completed: node.completed ?? false,
        displayOrder: node.displayOrder ?? i,
        id: node.id,
      });
      result.created++;

      applyNoteUpdates(note.id, {
        favorite: node.favorite,
        hideCompletedChildren: node.hideCompletedChildren,
      });
      if (node.savedDisplayOrder != null) {
        repo.noteCommands.update(note.id, { savedDisplayOrder: node.savedDisplayOrder });
      }

      if (node.children && node.children.length > 0) {
        importNoteNodes(node.children, note.id, result, ears);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`Failed to create note "${node.title}": ${message}`);
      result.skipped++;
    }
  }
}
