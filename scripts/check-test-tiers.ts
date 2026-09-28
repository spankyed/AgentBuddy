#!/usr/bin/env node
/**
 * Fails when a tier-1 or tier-2 step in the pre-merge chain can reach the app.
 *
 *   tsx scripts/check-test-tiers.ts        (npm run check:tiers, part of npm run typecheck)
 *
 * The tiers say what a check may read (`scripts/lib/chain-steps.ts`). The one that matters is that tier 1
 * and tier 2 do not need the built app: the moment one does, it has to run after `build`, its real inputs
 * become the whole repo, and it can no longer be cached or reordered. Four attempts at a cheaper chain each
 * died on exactly that, because nothing recorded it (`docs/goals/goal-test-tiers.md`).
 *
 * It reads each step's npm script, follows the scripts and shell files it calls, and looks for the ways this
 * repo launches the app: Playwright, Electron, and `abuddy test`, which is Playwright with a different name.
 * A text scan, not a resolver — it errs towards reporting, and a step that genuinely needs the app is tier 3,
 * which is an answer rather than a failure.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CHAIN_STEPS } from './lib/chain-steps.ts';
import { reachableText, rootScripts } from './lib/npm-scripts.ts';

/**
 * How this repo *launches* the app, not how it mentions it. Compiling an E2E spec imports Playwright's types
 * and starts nothing, so `typecheck` names it and is still tier 1; the markers are invocations only.
 * `abuddy test` is one, because that command is Playwright under another name
 * (`abuddy-cli/src/commands/test.ts` requires a `playwright.config.ts`).
 *
 * `abuddy test --contract` is the exception, and the only one: it runs the pack's vitest and starts no app,
 * which is what the flag is for. The negative lookahead is narrow on purpose — it exempts that one spelling
 * rather than the command, so `abuddy test` anywhere still reads as a launch. Without it,
 * `test-external-pack-contract.sh` failed this check the moment it started calling the CLI instead of
 * invoking vitest by path, which is the guard working rather than the guard being wrong.
 */
const APP_MARKERS = [
  /playwright\s+test\b/,
  /\babuddy["']?\s+test\b(?!\s+--contract)/,
  /\$\{?ABUDDY\}?"?\s+test\b(?!\s+--contract)/,
  /_electron\.launch/,
];

/** This file names the markers it looks for, so scanning it would always match */
const SELF = path.join('scripts', 'check-test-tiers.ts');

function problems(): string[] {
  const all = rootScripts();
  const found: string[] = [];
  for (const { name, tier } of CHAIN_STEPS) {
    if (tier === 3) continue;
    const script = name === 'test' ? 'test' : name;
    if (!(script in all)) { found.push(`${name}: no such npm script`); continue; }
    const { text } = reachableText(script, all, { skip: SELF });
    const hit = APP_MARKERS.find((m) => m.test(text));
    if (hit) found.push(`${name} is tier ${tier} but reaches the app (${String(hit)}). Either it does not need the app, or it is tier 3.`);
  }
  return found;
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  const found = problems();
  if (found.length === 0) {
    console.log(`✅ ${CHAIN_STEPS.filter((s) => s.tier < 3).length} tier-1 and tier-2 chain steps reach no app`);
  } else {
    fs.writeSync(2, `${found.join('\n')}\n`);
    process.exitCode = 1;
  }
}
