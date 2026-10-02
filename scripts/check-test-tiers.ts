#!/usr/bin/env node
/**
 * Fails when a step reaches the app without declaring any of its outputs among that step's inputs.
 *
 *   tsx scripts/check-test-tiers.ts        (npm run check:tiers, part of npm run typecheck)
 *
 * A step that does not need the built app must not reach one: the moment it does, it has to run after
 * `build:app`, its real inputs become the whole repo, and it can no longer be cached or reordered. Four
 * attempts at a cheaper chain each died on exactly that, because nothing recorded it
 * (`docs/archive/goals/goal-test-tiers.md`, where the declaration was a three-valued `tier`).
 *
 * **Two questions, because neither answers the other.** The *inputs* check is data: a step declaring
 * `APP_OUTPUTS` reads the app whatever its scripts say. The *scripts* check is text: it reads each step's
 * npm script, follows what it calls, and looks for the ways this repo launches the app — Playwright,
 * Electron, and `abuddy test`, which is Playwright with a different name. A step can launch the app
 * without declaring its outputs as inputs, which is the case the text scan exists for and the inputs
 * check cannot see; and `APP_ENTRY` is why the inputs check alone would be wrong in the other direction,
 * since `packages/dev-mode.js` and `packages/entry-point.mjs` are source that three app-free steps read.
 *
 * The text scan goes when the action graph can answer "does this transitively depend on `build:app`"
 * (`docs/archive/plans/one-action-cache.md`, item 17). Until then it is the half that catches a launch, and the
 * cost of it being a scan is that **a marker inside a string literal reads as an invocation**: one rule's
 * `why` text said `abuddy test` in prose and this refused the step until the sentence was reworded.
 * Comments are stripped; string literals are not, and telling them apart is the resolver this is not.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { APP_OUTPUTS, CHAIN_STEPS, needsApp } from './lib/chain-steps.ts';
import { reachableText, rootScripts } from './lib/npm-scripts.ts';

/**
 * How this repo *launches* the app, not how it mentions it. Compiling an E2E spec imports Playwright's types
 * and starts nothing, so `typecheck` names it and still needs no app; the markers are invocations only.
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
  for (const step of CHAIN_STEPS) {
    const { name } = step;
    // One question, not two. `needsApp` is the declared inputs read back (`chain-steps.ts`), so the two
    // clauses that used to compare it against those inputs were comparing a derivation with its own source
    // and could not fail. What is left is the half no reading of the inputs can answer.
    if (needsApp(step)) continue;
    const script = name === 'test' ? 'test' : name;
    if (!(script in all)) { found.push(`${name}: no such npm script`); continue; }
    const { text } = reachableText(script, all, { skip: SELF });
    const hit = APP_MARKERS.find((m) => m.test(text));
    if (hit) found.push(`${name} reaches the app (${String(hit)}) and declares none of ${APP_OUTPUTS.join(', ')} among its inputs. `
      + 'Either it does not need the app, or it does and must declare what it reads — which is what orders it after build:app.');
  }
  return found;
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  const found = problems();
  if (found.length === 0) {
    console.log(`✅ ${CHAIN_STEPS.filter((s) => !needsApp(s)).length} chain steps reach no app, ${CHAIN_STEPS.filter(needsApp).length} read one`);
  } else {
    fs.writeSync(2, `${found.join('\n')}\n`);
    process.exitCode = 1;
  }
}
