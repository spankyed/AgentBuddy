import { findRelations } from '@apackdev/sdk/ears';
import { write, query } from '#generated/ears.ts';
import { EARS } from '#generated/ears.ts';

import { parseReferenceHref } from '@apackdev/sdk/framework';
import { NOTE_TYPE_TO_REFERENCE_TYPE } from '../../reference-types.ts';

import { REFERENCES } from '../types.ts';

/**
 * Extract canonical note, task and task-list targets from internal Markdown references.
 */
export function parseNoteLinks(content: string): EARS.EntityId[] {
  const pattern = /\[(?:\\.|[^\]\\])*\]\((apack-ref:\/\/[^)\s]+)\)/g;
  const ids = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    const target = parseReferenceHref(match[1]);
    if (target && Object.values(NOTE_TYPE_TO_REFERENCE_TYPE).includes(target.type)) ids.add(target.id);
  }
  return [...ids] as EARS.EntityId[];
}

/**
 * A note's REFERENCES are an index derived from its text: one relation per note its links name that exists. They
 * are never the only record of a link — the text is — so rebuilding them from the text loses nothing, and a link
 * to a note that doesn't exist (yet) is simply not indexed until it does (`resolveReferencesTo`).
 */
export function syncReferences(sourceId: EARS.EntityId, content: string): void {
  const wanted = new Set(parseNoteLinks(content).filter((id) => id !== sourceId && query.ids(id).exists()));
  // Every REFERENCES relation the note has, one to a note that is gone included, so a stale one is removed too
  const current = new Set(findRelations({ sourceEntity: sourceId, relationType: REFERENCES }).map((r) => r.targetEntity as EARS.EntityId));

  for (const targetId of wanted) {
    if (!current.has(targetId)) write(sourceId).link(REFERENCES, targetId, { replace: true });
  }
  for (const targetId of current) {
    if (!wanted.has(targetId)) write(sourceId).unlink(REFERENCES, targetId);
  }
}

/** Indexes the links other notes' text already makes to a note that has just been created */
export function resolveReferencesTo(noteId: EARS.EntityId): void {
  for (const note of query(EARS.Entity.Note).where('content', (content: unknown) => typeof content === 'string' && content.includes(noteId)).pick(['content'])) {
    syncReferences(note.id as EARS.EntityId, note.content as string);
  }
}
