// The one place an apply decides what to do with one content item. Every writer reads its own entity types
// and hashes its own parts; what each of them does with the answer is this table, so a verdict is reached
// once rather than once per writer.
//
// It is a three-way merge: what we applied last (`applied`), what the pack declares now (`incoming`), and
// what is in the database (`live`). Five fingerprints each answered one corner of that before the applied
// content existed, and the corner none of them covered — *which part* of an item the user changed — is why
// editing one field of a flow froze all thirty of its entities against every later version.
import type { AppliedItem, ImportMode } from '../utils/seed.ts';

/**
 * What an apply decided about one item. Three of them write (`create`, `fast-forward`, `remove`), five
 * leave the database alone, and the five are the whole of what "never overwrite the user" means here.
 */
export type Resolution =
  /** Nothing is there and nothing of ours ever was: write it */
  | 'create'
  /** Ours, and the content moved: write the new version wholesale */
  | 'fast-forward'
  /** Ours, and the entity already holds the content's hash */
  | 'unchanged'
  /** An entity is there that we did not write: the user's, by identity */
  | 'user-owned'
  /** Ours once, and the user has changed a part of it. `parts` names which */
  | 'conflict'
  /** We wrote it and there is no live entity: the user removed it */
  | 'absent-by-deletion'
  /** `keep-existing`: an entity is there, and the mode says to leave whatever is there alone */
  | 'kept'
  /** Another item's container, reused as a parent and left as its own pack wrote it */
  | 'foreign-container'
  /** The content no longer declares it and it is still ours: delete it */
  | 'remove'
  /** The content no longer declares it and the user has edited it: keep it, and say so. `parts` names which */
  | 'removed-but-edited';

/** The entity an item names now, as every writer can describe one */
export interface LiveEntity {
  /** What the last apply wrote it from, as the entity holds it. Absent means we never wrote this entity */
  sourceHash?: unknown;
  /** The user trashed it. It still carries our key, which is the only reason we can tell */
  trashed?: boolean;
  /** Another item's container (another pack's, or another entry of this one) */
  foreignContainer?: boolean;
}

export interface MergeInput {
  /** What the last apply wrote for this item; absent means it never wrote one */
  applied?: AppliedItem;
  /** The hash of the content declaring it now; absent when the item's format records none */
  incoming?: string;
  /** The entity this item names now; absent means none */
  live?: LiveEntity;
  mode?: ImportMode;
  /**
   * The parts of `applied` whose stored value is no longer what we wrote. A callback rather than a list,
   * because reading them means walking the entity the way the writer that wrote it walks one, and because
   * most items are settled by a branch above that never asks.
   */
  drifted: () => string[];
}

export interface Merge {
  resolution: Resolution;
  /** For `conflict` and `removed-but-edited`: the parts whose stored value is no longer what we wrote */
  parts?: string[];
}

/**
 * What to do with an item the content declares.
 *
 * The order is the rule. First the ways an entity is not there or not ours — gone, trashed, another item's
 * container, or carrying no hash of ours at all — and only then the two that need the parts read.
 *
 * **An entity we wrote with no recorded parts is adopted**, which is the one branch that can overwrite
 * something the user typed. There is nothing to compare against — a pack applied before the record existed
 * wrote entities and recorded nothing about them — so the choice is to adopt them once or to freeze every
 * one of them for good, and freezing is how a user who upgrades gets no fix ever again. The write re-stamps
 * the item with its parts, so edits are honoured from the next apply on. This is the rule that replaced a
 * migration doing the same thing to the entities of one release.
 */
export function resolve(input: MergeInput): Merge {
  const { applied, incoming, live, mode } = input;

  if (!live) {
    // `wipe-and-replace` removed the entities itself a moment ago, so every key would read as deleted
    if (applied && mode !== 'wipe-and-replace') return { resolution: 'absent-by-deletion' };
    return { resolution: 'create' };
  }

  if (live.foreignContainer) return { resolution: 'foreign-container' };
  if (live.trashed) return { resolution: 'absent-by-deletion' };
  if (mode === 'keep-existing') return { resolution: 'kept' };
  if (!live.sourceHash) return { resolution: 'user-owned' };
  if (incoming !== undefined && live.sourceHash === incoming) return { resolution: 'unchanged' };
  if (!applied) return { resolution: 'fast-forward' };

  const parts = input.drifted();
  return parts.length > 0 ? { resolution: 'conflict', parts } : { resolution: 'fast-forward' };
}

/**
 * What to do with an item the content **no longer** declares, whose key the applied content still holds.
 *
 * The same rule as everything above: ours to remove while it is still ours, theirs to decide once they have
 * touched it. An entity already gone needs nothing done and its entry is dropped, which is what stops the
 * removal being recomputed on every later apply.
 */
export function resolveRemoval(input: {
  /** Required, unlike `resolve`'s: a removal is only ever about an item the applied content holds */
  applied: AppliedItem;
  live?: LiveEntity;
  drifted: () => string[];
}): Merge {
  if (!input.live) return { resolution: 'remove' };
  if (input.live.foreignContainer) return { resolution: 'foreign-container' };
  const parts = input.drifted();
  return parts.length > 0 ? { resolution: 'removed-but-edited', parts } : { resolution: 'remove' };
}
