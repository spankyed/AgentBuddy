/**
 * The pre-merge chain's steps and what each is allowed to read. Separate from `scripts/chain.ts` because
 * that module runs the chain when imported, and `check-test-tiers.ts` needs the table without running it.
 *
 *   1 pure      its own package's source, the in-memory runtime, fakes. No build output, no app.
 *   2 contract  the built @abuddy packages and a pack's build output. Not the app.
 *   3 app       the built app.
 *
 * A tier-1 or tier-2 step that launches the app is the coupling this taxonomy exists to catch: it welds a
 * fast check to a slow one, and the pair can then be neither cached nor reordered. `check:tiers` fails on
 * one. The reasoning and the measurements are in `docs/goals/goal-test-tiers.md`.
 */
export type Tier = 1 | 2 | 3;

export interface ChainStep {
  /** The npm script, as `npm run <name>` (or `npm test` for the E2E suite) */
  readonly name: string;
  readonly tier: Tier;
}

/**
 * In dependency order. `compile` stays ahead of `build` and is not redundant with it: `build -ws` gives no
 * ordering guarantee, since no workspace declares a dependency on `@app/default-setup`, and the renderer's
 * build reads the generated pack entry that `compile` writes.
 *
 * `test:external-pack` is split: its contract half runs here in tier 2, before `build`, because validating,
 * building and typechecking a pack and running its harness specs needs no app — proved by running it with
 * `packages/renderer/dist` moved aside. Its Playwright half stays tier 3.
 *
 * `test:packaged-authoring` is still tier 3 whole. It is a linear scenario rather than two halves: step 8
 * needs the archive step 6 produced and step 9 reads the data step 8's app seeded, so it takes a mode rather
 * than a split (Phase 2 of the goal).
 */
export const CHAIN_STEPS: readonly ChainStep[] = [
  { name: 'packages:ensure', tier: 2 },
  { name: 'compile', tier: 2 },
  { name: 'test:external-pack:contract', tier: 2 },
  { name: 'typecheck', tier: 1 },
  { name: 'test:unit', tier: 1 },
  { name: 'build', tier: 3 },
  { name: 'test:external-pack:app', tier: 3 },
  { name: 'test', tier: 3 }, // the E2E suite
  { name: 'test:packaged-authoring', tier: 3 },
];
