// What both registries take a pack's contributions back out with. Its rules are the ones the register
// rollback and the unregister path used to state differently from each other.
import { describe, expect, it } from 'vitest';
import { createUndoLog } from '../../src/packs/extensions.ts';

describe('the undo log a registration collects', () => {
  it('takes things back in the reverse of the order they went in', () => {
    const order: string[] = [];
    const undos = createUndoLog();
    undos.record(() => order.push('first'));
    undos.record(() => order.push('second'));

    expect(undos.undoAll()).toEqual([]);

    expect(order).toEqual(['second', 'first']);
  });

  // The rollback runs it, and so does the unregister that follows a registration that survived. Neither
  // knows about the other, so taking something back twice has to be the log's problem, not theirs.
  it('forgets what it took back, so a second call takes nothing back twice', () => {
    const order: string[] = [];
    const undos = createUndoLog();
    undos.record(() => order.push('once'));

    undos.undoAll();
    undos.undoAll();

    expect(order).toEqual(['once']);
  });

  // A contribution that can't be taken back out is a leak; stopping would add the rest of them to it
  it('runs every undo whatever the ones before it did, and says which failed', () => {
    const order: string[] = [];
    const undos = createUndoLog();
    undos.record(() => order.push('under it'));
    undos.record(() => { throw new Error('this one is stuck'); });
    undos.record(() => order.push('over it'));

    const failures = undos.undoAll();

    expect(order, 'an undo that threw stopped the ones under it').toEqual(['over it', 'under it']);
    expect(failures).toEqual(['this one is stuck']);
  });
});
