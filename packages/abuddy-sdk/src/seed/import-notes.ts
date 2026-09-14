import { EARS } from '../types/entities.ts';
import type { NoteEntity } from '../types/sdk-entities.ts';
import { hasIdCollision } from '../ears/index.ts';
import { builtinRepository } from '../ears/builtin-repositories.ts';
import { findWhere } from '../ears/query-helpers.ts';
import { qx } from '../ears/query.ts';
import type { ExportedNote, ExportedNotes } from '../build/compilers/compile-notes.ts';

export interface NotesImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

function findExistingNote(title: string, parentId: string | undefined): NoteEntity | undefined {
  const candidates = findWhere<NoteEntity>(EARS.Entity.Note, 'title', title);
  return candidates.find((note) => {
    const parents = qx(note.id).linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Note, false).ids();
    const noteParentId = parents.length > 0 ? parents[0] : undefined;
    return noteParentId === parentId;
  });
}

function applyNoteUpdates(
  noteId: EARS.EntityId,
  opts: { favorite?: boolean; hideCompletedChildren?: boolean; content?: string },
): void {
  const updates: { favorite?: boolean; hideCompletedChildren?: boolean; content?: string } = {};
  if (opts.favorite) updates.favorite = true;
  if (opts.hideCompletedChildren) updates.hideCompletedChildren = true;
  if (opts.content !== undefined) updates.content = opts.content;
  if (Object.keys(updates).length > 0) {
    builtinRepository.noteCommands.update(noteId, updates);
  }
}

export function importNotesFromData(data: ExportedNotes): NotesImportResult {
  const result: NotesImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };
  if (!data?.notes || !Array.isArray(data.notes)) {
    result.errors.push('Invalid import data: expected object with "notes" array');
    return result;
  }
  importNoteNodes(data.notes, undefined, result);
  return result;
}

function importNoteNodes(
  nodes: ExportedNote[],
  parentId: string | undefined,
  result: NotesImportResult,
): void {
  const repo = builtinRepository;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node || !node.type || !node.title) {
      result.errors.push(`Note at index ${i} is missing required fields`);
      result.skipped++;
      continue;
    }

    const existing = findExistingNote(node.title, parentId);
    if (existing) {
      try {
        repo.noteCommands.update(existing.id, {
          content: node.content || '',
          icon: node.icon,
          completed: node.completed ?? false,
          displayOrder: node.displayOrder ?? i,
        });
        applyNoteUpdates(existing.id, {
          favorite: node.favorite,
          hideCompletedChildren: node.hideCompletedChildren,
        });
        if (node.savedDisplayOrder != null) {
          repo.noteCommands.update(existing.id, { savedDisplayOrder: node.savedDisplayOrder });
        }
        result.updated++;

        if (node.children && node.children.length > 0) {
          importNoteNodes(node.children, existing.id, result);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.errors.push(`Failed to update note "${node.title}": ${message}`);
        result.skipped++;
      }
      continue;
    }

    if (node.id && hasIdCollision(node.id as EARS.EntityId)) {
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
        importNoteNodes(node.children, note.id, result);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`Failed to create note "${node.title}": ${message}`);
      result.skipped++;
    }
  }
}
