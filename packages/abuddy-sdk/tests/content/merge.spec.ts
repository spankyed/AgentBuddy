// The one table every verdict is reached through. It is a pure function over (applied, incoming, live), so
// this is the whole of the merge rather than a sample of it: a new outcome is a row here, and the two
// writers' specs beside it cover what each of them then does about one.
import { describe, expect, it } from 'vitest';
import { resolve, resolveRemoval, type Resolution } from '../../src/content/merge.ts';
import type { AppliedItem, ImportMode } from '../../src/utils/index.ts';

const ours: AppliedItem = { entityType: 'Memo', contentHash: 'v1', parts: { body: 'aaaa' } };

/** `resolve` with the shape a writer passes it, and a `drifted` that says what the case means it to */
const verdict = (input: {
  applied?: AppliedItem;
  incoming?: string;
  live?: { contentHash?: unknown; trashed?: boolean; foreignContainer?: boolean };
  mode?: ImportMode;
  onUserEdit?: 'fork' | 'offer';
  force?: boolean;
  drifted?: string[];
}): Resolution => resolve({ ...input, drifted: () => input.drifted ?? [] }).resolution;

describe('an item the content declares', () => {
  /**
   * The table, in the order the branches are taken. Every row is a distinct state of the three inputs, and
   * the two `drifted` rows are the pair the whole subsystem exists for: same inputs but for whether a part
   * of the entity still holds what we wrote.
   */
  const cases: Array<[name: string, input: Parameters<typeof verdict>[0], expected: Resolution]> = [
    ['nothing there, nothing of ours written', {}, 'create'],
    ['nothing there, and the last apply wrote it', { applied: ours }, 'absent-by-deletion'],
    ['nothing there, after wipe-and-replace removed it', { applied: ours, mode: 'wipe-and-replace' }, 'create'],
    ['an entity carrying no hash of ours', { live: {} }, 'user-owned'],
    ['an entity carrying no hash of ours, with an entry', { applied: ours, live: {} }, 'user-owned'],
    ['an entity the user trashed', { applied: ours, live: { contentHash: 'v1', trashed: true } }, 'absent-by-deletion'],
    ['another item’s container', { live: { contentHash: 'v1', foreignContainer: true } }, 'foreign-container'],
    ['keep-existing over anything that is there', { applied: ours, incoming: 'v2', live: { contentHash: 'v1' }, mode: 'keep-existing' }, 'kept'],
    ['the entity already holds what the content ships', { applied: ours, incoming: 'v1', live: { contentHash: 'v1' } }, 'unchanged'],
    ['ours, the content moved, nothing drifted', { applied: ours, incoming: 'v2', live: { contentHash: 'v1' }, drifted: [] }, 'fast-forward'],
    ['ours, the content moved, a part drifted', { applied: ours, incoming: 'v2', live: { contentHash: 'v1' }, drifted: ['body'] }, 'conflict'],
    ['ours with no recorded parts: adopted once', { incoming: 'v2', live: { contentHash: 'v1' } }, 'fast-forward'],
    // `force` is the user asking for the pack's version of this one item, so it overrides every branch that
    // exists to protect them — and none of the two that protect somebody else
    ['forced over the user’s edit', { applied: ours, incoming: 'v2', live: { contentHash: 'v1' }, drifted: ['body'], force: true }, 'fast-forward'],
    ['forced over an entity that was never ours', { live: {}, force: true }, 'fast-forward'],
    ['forced over keep-existing', { applied: ours, incoming: 'v2', live: { contentHash: 'v1' }, mode: 'keep-existing', force: true }, 'fast-forward'],
    ['forced over an entity the user trashed', { applied: ours, live: { contentHash: 'v1', trashed: true }, force: true }, 'fast-forward'],
    ['forced, but the entity is another item’s container', { live: { contentHash: 'v1', foreignContainer: true }, force: true }, 'foreign-container'],
    ['forced, with nothing there to overwrite', { applied: ours, incoming: 'v2', force: true }, 'create'],
  ];

  it.each(cases)('%s', (_name, input, expected) => {
    expect(verdict(input)).toBe(expected);
  });

  /** Every outcome the type names is reached by a row above, so the table cannot fall behind the union */
  it('covers every resolution a declared item can reach', () => {
    const unreachable: Resolution[] = ['remove', 'removed-but-edited'];
    const reached = new Set(cases.map(([, , expected]) => expected));
    expect(reached.size, 'a case was added without a new outcome, or the table shrank').toBeGreaterThan(5);
    for (const outcome of unreachable) {
      expect(reached.has(outcome), `${outcome} is a removal's verdict and must not be reachable here`).toBe(false);
    }
  });

  /**
   * **Whether a conflict is a decision to put to the user is a second answer, not a resolution.** The
   * database outcome is the same either way — nothing is written — so what `onUserEdit` and `dismissed`
   * decide is only whether anyone is told.
   */
  it('offers a conflict only where the entry offers and the user has not already declined it', () => {
    const conflicting = { applied: ours, incoming: 'v2', live: { contentHash: 'v1' }, drifted: () => ['body'] };

    expect(resolve(conflicting).offer, 'fork is the default, and says nothing').toBeUndefined();
    expect(resolve({ ...conflicting, onUserEdit: 'fork' }).offer).toBeUndefined();
    expect(resolve({ ...conflicting, onUserEdit: 'offer' }).offer, 'an offering entry').toBe(true);
    expect(resolve({ ...conflicting, onUserEdit: 'offer', applied: { ...ours, dismissed: 'v2' } }).offer,
      'the version they declined').toBeUndefined();
    expect(resolve({ ...conflicting, onUserEdit: 'offer', applied: { ...ours, dismissed: 'v1' } }).offer,
      'and a version they have not seen asks again').toBe(true);
  });

  it('names the parts that differ, and only for a conflict', () => {
    const drifted = () => ['body', 'name'];
    expect(resolve({ applied: ours, incoming: 'v2', live: { contentHash: 'v1' }, drifted }))
      .toEqual({ resolution: 'conflict', parts: ['body', 'name'] });
    expect(resolve({ applied: ours, incoming: 'v1', live: { contentHash: 'v1' }, drifted }).parts).toBeUndefined();
  });

  /**
   * **The branches above a drift check must not ask for one**, because reading the parts means walking the
   * entity: every item of a pack whose content has not moved would pay for a walk that decides nothing.
   */
  it('reads no part for an item settled before the drift check', () => {
    let walked = 0;
    const drifted = () => { walked++; return []; };
    resolve({ applied: ours, incoming: 'v1', live: { contentHash: 'v1' }, drifted });
    resolve({ live: {}, drifted });
    resolve({ applied: ours, drifted });
    expect(walked, 'something above the drift check walked the entity').toBe(0);
  });
});

describe('an item the content no longer declares', () => {
  it('is removed while it is still ours, and kept once it is not', () => {
    expect(resolveRemoval({ applied: ours, live: { contentHash: 'v1' }, drifted: () => [] }))
      .toEqual({ resolution: 'remove' });
    expect(resolveRemoval({ applied: ours, live: { contentHash: 'v1' }, drifted: () => ['body'] }))
      .toEqual({ resolution: 'removed-but-edited', parts: ['body'] });
  });

  /** An entity already gone needs nothing done, which is what lets its entry be dropped */
  it('is removed when there is no entity left to remove', () => {
    expect(resolveRemoval({ applied: ours, drifted: () => ['body'] })).toEqual({ resolution: 'remove' });
  });

  /** A container holding entities we did not write is not ours to delete, whatever the content says */
  it('is kept when it is a container holding another item’s entities', () => {
    expect(resolveRemoval({ applied: ours, live: { contentHash: 'v1', foreignContainer: true }, drifted: () => [] }))
      .toEqual({ resolution: 'foreign-container' });
  });

  /**
   * **A forked item the user edited is kept without telling anyone**, which is the same rule as a conflict's:
   * the write is identical either way — it stays — and the entry's policy decides only whether the user is
   * given something to decide.
   */
  it('offers the keep only where the entry offers', () => {
    const edited = { applied: ours, live: { contentHash: 'v1' }, drifted: () => ['body'] };
    expect(resolveRemoval(edited).offer, 'fork is the default').toBeUndefined();
    expect(resolveRemoval({ ...edited, onUserEdit: 'offer' }).offer).toBe(true);
    expect(resolveRemoval({ ...edited, onUserEdit: 'offer' }).resolution, 'and it is kept either way').toBe('removed-but-edited');
  });
});
