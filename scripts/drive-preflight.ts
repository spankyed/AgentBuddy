/**
 * **Is the app you are about to drive the app you just built?**
 *
 * `drive/`'s whole purpose is looking at what you just changed, and the one thing nothing checked was that
 * you had built it. A stale app is the expensive failure here because it does not look like one: the window
 * opens, the plugins are there, and the behaviour is the *previous* build's. Measured 2026-10-08, that
 * shape cost five `app-integration` failures that read as code defects — the host had moved and
 * `packages/default-setup/dist` had not.
 *
 * **It reads mtimes, and not the chain's stamps, which is the opposite of what it looks like it should do.**
 * The stamps answer a different question: only `npm run chain` writes one, so `unitStaleReason` against a
 * step's stamp reports every tree that has moved since the last *chain* run — which during ordinary
 * development is all of them, however recently `npm run build:app` ran. That version of this check fired
 * immediately after a successful build, which is the failure mode a nudge can least afford.
 *
 * Mtimes are the right instrument *here* for the reason they are the wrong one for a cache key: a rebuild
 * that produced identical bytes bumps them, so this says "fresh" where a content hash would say "unchanged",
 * and an edit reverted to its original text says "stale" where a hash would not. Both errors are harmless in
 * a sentence nobody is gated on, and neither is harmless in a stamp.
 *
 * **What it shares with the chain is the declaration, not the comparison**: the inputs and outputs come from
 * `chain-steps.ts`, so there is no second account of what the app is built from.
 *
 * **A nudge, never a gate.** It exits 0 whatever it finds: driving a deliberately stale app is legitimate —
 * that is how you look at what a change did *to* the previous build — and it stays quiet when it cannot
 * tell, because an output it cannot read is not evidence of staleness.
 */
import * as fs from 'node:fs';
import { inputFiles, repoRelative, skipsFingerprint } from '@abuddy/host/build/packages-built';
import { CHAIN_STEPS } from './lib/chain-steps.ts';
import { unitFor } from './lib/chain-stamps.ts';

/** The steps that produce the app a driving session opens, in the order the chain runs them */
const BUILDS = [
  { step: 'compile', what: "the pack the app ships" },
  { step: 'build:app', what: 'the renderer, main, preload and the API' },
] as const;

interface Edge { readonly file: string; readonly at: number }

/**
 * The most recently touched file under these targets.
 *
 * **Newest on both sides, which is the only pair that works.** For the inputs it is the obvious reading:
 * the latest edit. For the outputs it is *when the build last produced anything*, and the tempting
 * alternative — the oldest output, "has every product been refreshed" — is wrong because a build need not
 * rewrite all of them: `abuddy build` overwrites `dist/defs/` without clearing it, by design, so some of
 * `compile`'s outputs keep their mtime across builds and the oldest one reported the pack stale seconds
 * after a successful build.
 *
 * `prune` skips what a fingerprint skips, which is how a CLAUDE.md edit stays free here too.
 */
function newest(targets: readonly string[], prune = false): Edge | undefined {
  let found: Edge | undefined;
  for (const target of targets) {
    for (const file of inputFiles(target)) {
      if (prune && skipsFingerprint(file)) continue;
      const at = fs.statSync(file, { throwIfNoEntry: false })?.mtimeMs;
      if (at !== undefined && (found === undefined || at > found.at)) found = { file, at };
    }
  }
  return found;
}

/** One line per build whose output predates something it is built from, empty when all of them are current */
export function stalenessWarnings(steps: readonly { step: string; what: string }[] = BUILDS): string[] {
  return steps.flatMap(({ step, what }) => {
    const found = CHAIN_STEPS.find((candidate) => candidate.name === step);
    if (found === undefined) return [];
    const unit = unitFor(found);
    const source = newest(unit.inputs, true);
    const built = newest(unit.outputs);
    // Nothing built, or nothing to compare: not an answer, so not a warning
    if (source === undefined || built === undefined || source.at <= built.at) return [];
    return [`${what}: ${repoRelative(source.file)} is newer than the build — \`npm run ${step}\``];
  });
}

function main(): void {
  const warnings = stalenessWarnings();
  if (warnings.length === 0) return;
  console.warn('\n⚠ The app you are about to drive is older than its sources:');
  for (const warning of warnings) console.warn(`    ${warning}`);
  console.warn('  Driving it anyway shows you the previous build.\n');
}

if (import.meta.filename === process.argv[1]) main();
