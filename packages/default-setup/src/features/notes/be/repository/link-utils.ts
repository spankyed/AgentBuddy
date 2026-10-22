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
 * Diff parsed links against current REFERENCES relations and sync.
 */
export function syncReferences(sourceId: EARS.EntityId, content: string): void {
  const parsed = new Set(parseNoteLinks(content));
  parsed.delete(sourceId);
  const current = new Set(
    query.ids(sourceId).linksTo(REFERENCES, EARS.Entity.Note, true).ids()
  );

  // Add new references
  for (const targetId of parsed) {
    if (!current.has(targetId)) {
      write(sourceId).link(REFERENCES, targetId, { replace: true });
    }
  }

  // Remove stale references
  for (const targetId of current) {
    if (!parsed.has(targetId)) {
      write(sourceId).unlink(REFERENCES, targetId);
    }
  }
}
