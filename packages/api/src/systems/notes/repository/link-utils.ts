import { EARS } from '@/core/types';
import { qx } from '@/core/ears/helpers/query';
import { tx } from '@/core/ears/helpers/transaction';
import { REFERENCES } from '../types';

/**
 * Extract all note:// link target IDs from markdown content.
 */
export function parseNoteLinks(content: string): EARS.EntityId[] {
  const pattern = /\[[^\]]*\]\(note:\/\/([^)]+)\)/g;
  const ids = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    ids.add(match[1]);
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
    qx(sourceId).linksTo(REFERENCES, EARS.Entity.Note, true).ids()
  );

  // Add new references
  for (const targetId of parsed) {
    if (!current.has(targetId)) {
      tx(sourceId).linkOne(REFERENCES, targetId);
    }
  }

  // Remove stale references
  for (const targetId of current) {
    if (!parsed.has(targetId)) {
      tx(sourceId).unlinkIf(REFERENCES, targetId);
    }
  }
}
