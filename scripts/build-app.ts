#!/usr/bin/env node
/**
 * `npm run build:app`: the four builds that produce the app, run at once.
 *
 *   npm run build:app                # all of them
 *   npm run build:app -- --cores 1   # one at a time, for a measurement or a confusing failure
 *
 * WHY THIS IS NOT `npm run build -w a -w b -w c` ANY MORE
 *
 * npm runs `-w` flags **in series**, and the four builds are independent, so the step spent its time one
 * bundler at a time. Measured 2026-10-06 on a ten-core box: **26.9s serially (median of 3, 26.8-27.8s)**
 * against a floor of 16.0s, which is `@app/renderer`'s vite build and what the run is now bounded by.
 *
 * It is worth doing because of *where* the step sits rather than what it costs: `build:app` is on the
 * chain's critical path (`packages:ensure -> compile -> build:app -> test:packaged-authoring`) and is the
 * whole cost of a one-package edit. `api-check.ts` made the same change for the same reason and records
 * the same shape of measurement.
 *
 * WHAT THE FOUR BUILDS OWE EACH OTHER: NOTHING
 *
 * Each resolves workspace code through the `@abuddy/source` condition to **source** — the renderer's
 * `resolve.conditions`, the api's `esbuildOptions.conditions`, main's `ssr.resolve.conditions` — so none
 * reads another's `dist`. Their outputs are the four disjoint directories `APP_OUTPUTS` names, and the one
 * directory two of them share (`node_modules/.cache/tsbuildinfo/`) takes a distinct filename each.
 *
 * **The one real edge is external and must stay that way.** Two of the four — the renderer and the api —
 * read the built-in pack, and they read more of it than the entry `compile` wrote: each traces a generated
 * entry (`src/__generated__/pack-entry-fe.ts`, `pack-entry.ts`) into the pack's own `src`, so the pack's
 * components are compiled into the renderer bundle and its systems into the api's, and the renderer's
 * Tailwind config reads every file under that `src` for class names. `main` and `preload` name no pack at
 * all. The chain orders `compile` ahead of this step and `build:app` declares the pack's sources
 * (`PACK_SOURCES`, `lib/chain-steps.ts`) because of that. Run before `compile` and the api build *throws*
 * `No built-in packs found`, while the renderer fails **quietly** — its `eligiblePacks` filters to `[]` and
 * it emits an empty pack-loader map. Do not add a fallback here: it would convert the loud failure into the
 * quiet one.
 *
 * WHAT THIS OWES THE CHECKS THAT READ IT
 *
 * `check:tiers` scans this file's text for the ways the repo launches the app, and comments are stripped
 * while **string literals are not** — so a log line or an error message naming `playwright test`,
 * `abuddy test` or `_electron.launch` would fail that check for `build:app`. `chain-graph.spec.ts` derives
 * a step's timeout rung from the same text, so an `npm install` in it would imply `scenario` against the
 * declared `suite`. The commands themselves live in `lib/app-build-legs.ts`, which says why.
 */
import { boundedSpawn } from './lib/bounded-spawn.ts';
import { APP_BUILD_LEGS, BUILD_TIMEOUT } from './lib/app-build-legs.ts';
import { schedule } from './lib/chain-schedule.ts';
import { box, MEASURED_ON } from './lib/core-budget.ts';
import { exitOnEpipe } from './lib/exit-on-epipe.ts';
import { asCount, parseFlags } from './lib/measure.ts';
import { TIMEOUT_MS, timedOutBecause } from './lib/step-timeouts.ts';

exitOnEpipe();

/**
 * What of the machine the builds may take: all of it, because the chain admits this step against the rest
 * of the budget and nothing inside it needs holding back.
 *
 * No leg declares a weight, so each counts as one and a budget of the box runs all four — which is why
 * this shares the chain's scheduler and its one unit rather than counting legs of its own. `box()` rather
 * than `os.cpus().length`, which reads the host's cores where this wants a container's quota.
 */
const budgetFrom = (cores: string | undefined): number =>
  asCount(cores, 'cores') ?? Math.max(2, box());

const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

interface Outcome { readonly ms: number; readonly code: number; readonly output: string; readonly timedOut?: true }

const done = new Map<string, Outcome>();

const result = await schedule({
  // No edges: the four are independent, and the one ordering constraint they share is the chain's, which
  // put `compile` ahead of this whole step. `lib/app-build-legs.ts` has the evidence for both halves.
  steps: APP_BUILD_LEGS.map((leg) => ({ ...leg, dependsOn: [] })),
  budget: budgetFrom(parseFlags(process.argv.slice(2), { values: ['cores'], booleans: [] }).values.cores),
  skip: () => false,
  async run(leg) {
    const [command, ...args] = leg.command.split(' ');
    // Not `leg.seconds`: a deadline from a measurement is a deadline from this machine. The class is
    // `BUILD_TIMEOUT`, declared beside the legs so the chain's copy of this step reads the same one.
    const outcome = await boundedSpawn(command!, args, TIMEOUT_MS[BUILD_TIMEOUT].ms);
    done.set(leg.name, outcome);
    // One line as each finishes, so four concurrent bundlers are not one silence. Completion order, since
    // that is what progress is; the failures below are in declared order, which is what reading wants.
    process.stdout.write(`  ${outcome.code === 0 ? 'ok  ' : 'FAIL'} ${leg.name.padEnd(16)} ${secs(outcome.ms)}\n`);
    return outcome.code === 0;
  },
});

const failed = APP_BUILD_LEGS.filter((leg) => (done.get(leg.name)?.code ?? 0) !== 0);
for (const leg of failed) {
  const outcome = done.get(leg.name)!;
  const why = outcome.timedOut === true
    ? timedOutBecause({
      what: leg.name,
      timeout: BUILD_TIMEOUT,
      measuredOn: MEASURED_ON,
      seconds: leg.seconds,
    })
    : `${leg.name} failed (exit ${outcome.code})`;
  process.stderr.write(`\n${'─'.repeat(72)}\n${why}\n${'─'.repeat(72)}\n${outcome.output}\n`);
}

// A leg that threw is a bug in this runner rather than a failing build, so it is reported separately
for (const { step, error } of result.threw) {
  process.stderr.write(`\n${step}: the runner threw — ${error instanceof Error ? error.message : String(error)}\n`);
}

// `process.exitCode`, never `process.exit()`: this reprints a captured buffer, and exiting abandons
// whatever stdout has still to flush — which is exactly the failing build's output worth reading.
if (failed.length > 0 || result.threw.length > 0) {
  const names = failed.map((leg) => leg.name).join(', ');
  process.stderr.write(`\n❌ ${failed.length} of ${APP_BUILD_LEGS.length} failed: ${names}\n`);
  process.exitCode = 1;
} else if (result.skipped.length + result.started.length < APP_BUILD_LEGS.length) {
  // Dispatch stops after a failure, so this only reads as a scheduler bug
  process.stderr.write(`\n❌ only ${result.started.length} of ${APP_BUILD_LEGS.length} ran, and none failed\n`);
  process.exitCode = 1;
} else {
  console.log('✅ App built');
}
