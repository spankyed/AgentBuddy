import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { freshnessSweep, INPUTS_CHANGED, stampedRun, unitStaleReason, type BuildUnit } from '@abuddy/host/build/packages-built';
import { CHAIN_STEPS, conflictsOf, dependsOn } from '../../../scripts/lib/chain-steps.ts';

/**
 * The chain's dispatch decisions share one reading of the tree, and `forget` is the whole reason they can.
 *
 * A shared reading answers as of its first look, so a step whose inputs another step has just written would
 * be called fresh and skipped — work silently not done, reported green. What makes it sound is that the
 * writer is always known: every step declares what it writes, the chain forgets exactly those paths as each
 * step finishes, and the next decision re-reads them.
 *
 * So two things have to hold, and neither is obvious enough to assume. `forget` must actually forget — by
 * prefix, since what is memoised are the files under a declared directory and the listing of it, not the
 * directory key. And nothing may read, concurrently, where another step writes without declaring a product:
 * a transient write is covered by a mutex rather than by an edge, so the cases below check the mutex.
 */
const dirs: string[] = [];
const tempTree = (content: string): { root: string; unit: BuildUnit; stamp: string } => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sweep-forget-'));
  dirs.push(root);
  fs.mkdirSync(path.join(root, 'in', 'nested'), { recursive: true });
  fs.writeFileSync(path.join(root, 'in', 'nested', 'a.ts'), content);
  return { root, unit: { inputs: [path.join(root, 'in')], outputs: [], excludes: [] }, stamp: path.join(root, 'stamp.json') };
};
const rewrite = (root: string, content: string): void =>
  fs.writeFileSync(path.join(root, 'in', 'nested', 'a.ts'), content);
afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

describe('a shared reading forgets what a step writes', () => {
  /**
   * A real stamp over a real tree, which is what makes these cases mean anything: without one every
   * answer is "no stamp", and comparing that to itself passes whatever `forget` does.
   */
  const recorded = async (content: string) => {
    const tree = tempTree(content);
    await stampedRun('probe', tree.unit, tree.stamp, () => {});
    expect(unitStaleReason(tree.unit, tree.stamp), 'the stamp does not match the tree it was taken over')
      .toBeNull();
    return tree;
  };

  it('holds its first reading after the tree moves, which is the hazard', async () => {
    const { root, unit, stamp } = await recorded('first');
    const sweep = freshnessSweep();
    expect(sweep.staleReason(unit, stamp), 'fresh before the write').toBeNull();

    rewrite(root, 'second');
    expect(unitStaleReason(unit, stamp), 'a reading of its own would see the write').toBe(INPUTS_CHANGED);
    expect(sweep.staleReason(unit, stamp), 'a sweep that re-read the tree would not be a sweep').toBeNull();
  });

  it('answers as a fresh reading does once it has forgotten the path', async () => {
    const { root, unit, stamp } = await recorded('first');
    const sweep = freshnessSweep();
    sweep.staleReason(unit, stamp);
    rewrite(root, 'second');

    sweep.forget([path.join(root, 'in')]);
    expect(sweep.staleReason(unit, stamp), 'after forgetting, the write must be visible').toBe(INPUTS_CHANGED);
  });

  /**
   * By prefix, which is the part that is easy to get wrong: what a sweep memoises are the files under a
   * declared directory and the listing of it, so forgetting only the key it was handed leaves every file
   * inside it stale in the maps. The file here is two levels down for exactly that reason.
   */
  it('forgets the files under the path, not only the path', async () => {
    const { root, unit, stamp } = await recorded('first');
    const sweep = freshnessSweep();
    sweep.staleReason(unit, stamp);
    rewrite(root, 'second');

    sweep.forget([root]);
    expect(sweep.staleReason(unit, stamp), 'a file two levels down survived a forget of the root')
      .toBe(INPUTS_CHANGED);
  });

  // A path the sweep never read is not one it has to forget
  it('leaves alone what it was not asked about', () => {
    expect(() => freshnessSweep().forget(['/nowhere/at/all'])).not.toThrow();
  });
});

/**
 * And the one declaration the sharing rests on that is *not* definitional.
 *
 * A reader of a step's `outputs` is ordered after it by construction — `dependsOn` is that relation. A
 * reader of its `alsoWrites` is not: a transient write produces nothing, so it creates a mutex rather than
 * an edge, and the mutex is what stops a reader observing the tree mid-write. If that ever stopped holding,
 * a shared reading could take in a tarball that is about to be deleted.
 */
describe('nothing reads where a step writes without producing', () => {
  const inside = (child: string, parent: string): boolean => child === parent || child.startsWith(`${parent}/`);
  const overlaps = (a: readonly string[], b: readonly string[]): boolean =>
    a.some((x) => b.some((y) => inside(x, y) || inside(y, x)));

  it('finds a step that writes transiently, so this is not a check over nothing', () => {
    expect(CHAIN_STEPS.filter((step) => (step.alsoWrites ?? []).length > 0).map((step) => step.name))
      .not.toEqual([]);
  });

  it('keeps every such writer apart from everything that reads there', () => {
    const after = (name: string, seen = new Set<string>()): Set<string> => {
      for (const need of dependsOn(CHAIN_STEPS.find((s) => s.name === name)!)) {
        if (!seen.has(need)) { seen.add(need); after(need, seen); }
      }
      return seen;
    };
    const exposed = CHAIN_STEPS.flatMap((writer) => CHAIN_STEPS
      .filter((reader) => reader.name !== writer.name && overlaps(writer.alsoWrites ?? [], reader.inputs))
      .filter((reader) => !conflictsOf(writer).includes(reader.name)
        && !conflictsOf(reader).includes(writer.name)
        && !after(reader.name).has(writer.name) && !after(writer.name).has(reader.name))
      .map((reader) => `${reader.name} reads where ${writer.name} writes transiently, and nothing orders or excludes the pair`));
    expect(exposed, 'a shared reading could take in a write that is about to be undone').toEqual([]);
  });
});
