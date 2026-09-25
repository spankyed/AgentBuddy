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
  /** What it may read. `check:tiers` enforces that tier 1 and 2 reach no app. */
  readonly tier: Tier;
  /** The steps that must pass first — the edges. The run order is derived from these, not written. */
  readonly needs: readonly string[];
  /** A step whose pass is not reproducible, so it always runs. Only the E2E suite, with its reason. */
  readonly cache?: false;
}

/** Every step, by name, for validating `needs` */
const BY_NAME = new Map<string, ChainStep>();

/**
 * The order to run the steps in, derived from `needs`. Throws on an unknown dependency or a cycle, before
 * anything runs: a graph that is wrong should not be discovered halfway through a six-minute chain.
 */
export function orderedSteps(steps: readonly ChainStep[] = CHAIN_STEPS): readonly ChainStep[] {
  BY_NAME.clear();
  for (const step of steps) {
    if (BY_NAME.has(step.name)) throw new Error(`Two chain steps named ${step.name}`);
    BY_NAME.set(step.name, step);
  }
  for (const step of steps) {
    for (const need of step.needs) {
      if (!BY_NAME.has(need)) throw new Error(`Chain step ${step.name} needs ${need}, which is not a step`);
    }
  }
  const order: ChainStep[] = [];
  const done = new Set<string>();
  const onPath = new Set<string>();
  const visit = (step: ChainStep): void => {
    if (done.has(step.name)) return;
    if (onPath.has(step.name)) throw new Error(`Chain steps form a cycle through ${step.name}`);
    onPath.add(step.name);
    for (const need of step.needs) visit(BY_NAME.get(need)!);
    onPath.delete(step.name);
    done.add(step.name);
    order.push(step);
  };
  for (const step of steps) visit(step);
  return order;
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
  { name: 'packages:ensure', tier: 2, needs: [] },
  // Ahead of build and not redundant with it: build -ws gives no ordering guarantee, since no workspace
  // declares a dependency on @app/default-setup, and the renderer's build reads the pack entry this writes
  { name: 'compile', tier: 2, needs: ['packages:ensure'] },
  // The fixture packs depend on default-setup, so they need its snapshot from compile
  { name: 'test:external-pack:contract', tier: 2, needs: ['compile'] },
  { name: 'typecheck', tier: 1, needs: ['compile'] },
  { name: 'test:unit', tier: 1, needs: ['compile'] },
  // The CLI specs that run a real build, install or child process. Tier 2: they need the built packages,
  // never the app — which is why they can run before `build` rather than behind it.
  { name: 'test:integration', tier: 2, needs: ['packages:ensure'] },
  { name: 'build', tier: 3, needs: ['compile'] },
  { name: 'test:external-pack:app', tier: 3, needs: ['build', 'test:external-pack:contract'] },
  // Never cached: it drives real Electron with real timing and is the likeliest step to be flaky, and a
  // flaky pass cached green hides an intermittent failure indefinitely. 28s is cheap enough to always pay.
  { name: 'test', tier: 3, needs: ['build'], cache: false }, // the E2E suite
  { name: 'test:packaged-authoring', tier: 3, needs: ['build'] },
];
