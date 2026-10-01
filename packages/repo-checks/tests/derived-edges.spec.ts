import { describe, expect, it } from 'vitest';
import { CHAIN_STEPS, conflictsOf, dependsOn } from '../../../scripts/lib/chain-steps.ts';
import { population } from '@abuddy/sdk/testing';

/**
 * The derived graph reproduces the hand-written table it replaces — and this file exists for one commit.
 *
 * `needs` and `exclusive` were written beside `inputs` and `outputs` that already imply them. Deleting
 * them is only safe if the derivation gives the same answer, and "only safe if" is a thing to check rather
 * than to believe: **two earlier attempts at this derivation were wrong and both returned plausible
 * answers** — 3 of 13 edges, then 11 of 13, against a correct 13. From outside, a derivation reproducing 3
 * and one reproducing 13 look the same. Only the comparison tells them apart.
 *
 * So the old table is recorded here as a literal and the derivation is held to it. **Delete this file in
 * the commit after the one that lands it**: it is a snapshot of something that no longer exists, and a
 * snapshot kept past its commit becomes a second record that can disagree with the first — the defect this
 * whole goal is about.
 */

/** The table as it stood at `16c1b02e6`, before the fields were derived away. */
const RECORDED: readonly { step: string; needs: readonly string[] }[] = [
  { step: 'packages:ensure', needs: [] },
  { step: 'packages:check', needs: ['packages:ensure'] },
  { step: 'compile', needs: ['packages:ensure'] },
  { step: 'test:external-pack:contract', needs: ['compile'] },
  { step: 'typecheck', needs: ['compile'] },
  { step: 'test:unit:host', needs: ['compile'] },
  { step: 'test:unit:pack', needs: ['compile'] },
  { step: 'test:integration', needs: ['compile'] },
  { step: 'build:app', needs: ['compile'] },
  { step: 'test:external-pack:app', needs: ['build:app', 'test:external-pack:contract'] },
  { step: 'test:smoke', needs: ['build:app'] },
  { step: 'test', needs: ['build:app', 'test:smoke'] },
  { step: 'test:packaged-authoring', needs: ['build:app'] },
];

/** The steps that carried `exclusive: true`, which was a global mutex rather than a named conflict. */
const WAS_EXCLUSIVE = ['packages:ensure', 'packages:check'];

describe('the derived graph reproduces the table it replaces', () => {
  it('has a table and a derivation to compare, so the cases below are not two empty lists', () => {
    population('recorded steps', [...RECORDED], { atLeast: 13 });
    expect(RECORDED.map(({ step }) => step).sort(), 'the record names different steps than the table holds')
      .toEqual(CHAIN_STEPS.map((step) => step.name).sort());
    expect(CHAIN_STEPS.flatMap((step) => dependsOn(step)).length, 'the derivation finds no edges at all')
      .toBeGreaterThan(8);
  });

  /**
   * One declared `need` is not a data edge: `test` named `test:smoke` because both write `tests/results`.
   * That is a mutex, and the case below is where it is reproduced. Asserting it here instead would have
   * hidden the distinction the whole derivation turns on.
   */
  it('derives every declared need that was a data edge', () => {
    const wrong = RECORDED
      .map(({ step, needs }) => {
        const derived = [...dependsOn(CHAIN_STEPS.find((candidate) => candidate.name === step)!)];
        const asConflict = conflictsOf(CHAIN_STEPS.find((candidate) => candidate.name === step)!);
        const reproduced = [...needs].filter((need) => !derived.includes(need) && !asConflict.includes(need));
        const invented = derived.filter((need) => !needs.includes(need));
        return { step, missing: reproduced, invented };
      })
      .filter(({ missing, invented }) => missing.length > 0 || invented.length > 0)
      .map(({ step, missing, invented }) => `${step}: lost [${missing}], invented [${invented}]`);
    expect(wrong, 'the derivation and the recorded table disagree, so deleting the table changed the graph')
      .toEqual([]);
  });

  it('reproduces the one declared need that was really a mutex', () => {
    expect(conflictsOf(CHAIN_STEPS.find((step) => step.name === 'test')!),
      '`test` named `test:smoke` as a need; both write tests/results, so it is a mutex')
      .toContain('test:smoke');
  });

  /**
   * `exclusive` held every lane, so reproducing it is not "the same names" — it is that nothing which was
   * kept apart may now overlap. `packages:check` conflicts with every other step, because they read the
   * published trees it writes a tarball into; `packages:ensure` conflicts only with that one, and is
   * ordered before everything anyway, which is why its flag was redundant.
   */
  it('keeps every step that was exclusive apart from everything it used to be apart from', () => {
    // Transitively: an edge two hops away orders a pair just as firmly as a direct one, and most of the
    // table reaches `packages:ensure` through `compile`. Asking only about direct edges said ten steps
    // could overlap it, which is the kind of plausible wrong answer this file exists to catch.
    const after = (name: string, seen = new Set<string>()): Set<string> => {
      for (const next of dependsOn(CHAIN_STEPS.find((candidate) => candidate.name === name)!)) {
        if (!seen.has(next)) { seen.add(next); after(next, seen); }
      }
      return seen;
    };
    for (const name of WAS_EXCLUSIVE) {
      const step = CHAIN_STEPS.find((candidate) => candidate.name === name)!;
      const kept = new Set(conflictsOf(step));
      const overlappable = CHAIN_STEPS
        .filter((other) => other.name !== name && !kept.has(other.name)
          && !after(name).has(other.name) && !after(other.name).has(name));

      // Not "nothing may overlap it" — the point of deriving the mutex is that a global one was too broad,
      // and `test` reads none of the trees `packages:check` disturbs. What has to hold is that every pair
      // the derivation frees really is disjoint, re-derived from the raw paths rather than from
      // `conflictsOf`, so this cannot agree with the derivation by construction.
      const writes = [...(step.outputs ?? []), ...(step.alsoWrites ?? [])];
      const touching = overlappable
        .filter((other) => [...other.inputs, ...(other.outputs ?? []), ...(other.alsoWrites ?? [])]
          .some((theirs) => writes.some((ours) => theirs === ours || theirs.startsWith(`${ours}/`) || ours.startsWith(`${theirs}/`))))
        .map((other) => other.name);
      expect(touching, `${name} was exclusive; these share a path with what it writes and could now overlap it`)
        .toEqual([]);
    }
  });
});
