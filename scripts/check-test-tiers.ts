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

const REPO_ROOT = path.resolve(import.meta.dirname, '..');

/**
 * How this repo *launches* the app, not how it mentions it. Compiling an E2E spec imports Playwright's types
 * and starts nothing, so `typecheck` names it and is still tier 1; the markers are invocations only.
 * `abuddy test` is one, because that command is Playwright under another name
 * (`abuddy-cli/src/commands/test.ts` requires a `playwright.config.ts`).
 */
const APP_MARKERS = [
  /playwright\s+test\b/,
  /\babuddy["']?\s+test\b/,
  /\$\{?ABUDDY\}?"?\s+test\b/,
  /_electron\.launch/,
];

/** This file names the markers it looks for, so scanning it would always match */
const SELF = path.join('scripts', 'check-test-tiers.ts');

/**
 * Comments are prose, and prose about launching the app is not launching it — a script explaining why it does
 * *not* run `abuddy test` would otherwise report itself, which is how this was found. Stripping `#` can take a
 * `#` inside a string with it; that direction is safe here, because what is left is still scanned and the
 * markers are commands, which do not live inside string literals in these scripts.
 */
function withoutComments(text: string, shell: boolean): string {
  return shell
    ? text.split('\n').map((l) => l.replace(/(^|\s)#.*$/, '$1')).join('\n')
    : text.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
}

const scripts = (): Record<string, string> =>
  (JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf-8')) as { scripts: Record<string, string> }).scripts;

/**
 * A step that delegates to a workspace — `npm run test:integration -w @abuddy/cli` — used to be inspected
 * as nothing at all: the name is not a root script, so there was no text to scan and the step passed
 * vacuously. What is followed is the workspace's *scripts*, which are commands, and not its spec files,
 * which are prose: two of this repo's own specs say "the app configured for abuddy test" in a title, and
 * scanning those would report them. The markers are commands for that reason.
 *
 * One level. A workspace script that itself runs `npm run x` resolves that against the root's scripts
 * below, which is wrong but harmless — it is text being searched for a marker, not a graph being walked.
 */
const workspaceScripts = (name: string): Record<string, string> | undefined => {
  const packages = path.join(REPO_ROOT, 'packages');
  for (const dir of fs.readdirSync(packages)) {
    const manifest = path.join(packages, dir, 'package.json');
    if (!fs.existsSync(manifest)) continue;
    const pkg = JSON.parse(fs.readFileSync(manifest, 'utf-8')) as { name?: string; scripts?: Record<string, string> };
    if (pkg.name === name) return pkg.scripts ?? {};
  }
  return undefined;
};

/** `npm run <script> -w <ws>`, `npm test --workspace <ws>`: the script named is the workspace's, not the root's */
const WORKSPACE_CALL = /npm\s+(?:run\s+)?([\w:-]+)[^\n]*?(?:--workspace[= ]|-w\s+)(\S+)/g;

/** The text of a script plus every repo file it names, one level of following at a time */
function reachableText(script: string, all: Record<string, string>, seen = new Set<string>()): string {
  if (seen.has(script)) return '';
  seen.add(script);
  let text = all[script] ?? '';
  for (const called of text.matchAll(/npm run ([\w:-]+)/g)) text += `\n${reachableText(called[1], all, seen)}`;
  for (const [, called, workspace] of text.matchAll(WORKSPACE_CALL)) {
    const key = `${workspace}:${called}`;
    if (seen.has(key)) continue;
    seen.add(key);
    text += `\n${workspaceScripts(workspace)?.[called] ?? ''}`;
  }
  for (const file of text.matchAll(/(?:bash |sh |tsx |node )?((?:tests|scripts)\/[\w./-]+\.(?:sh|ts|mjs))/g)) {
    if (file[1].endsWith(SELF) || file[1] === SELF) continue;
    const abs = path.join(REPO_ROOT, file[1]);
    if (!seen.has(abs) && fs.existsSync(abs)) {
      seen.add(abs);
      text += `\n${withoutComments(fs.readFileSync(abs, 'utf-8'), abs.endsWith('.sh'))}`;
    }
  }
  return text;
}

function problems(): string[] {
  const all = scripts();
  const found: string[] = [];
  for (const { name, tier } of CHAIN_STEPS) {
    if (tier === 3) continue;
    const script = name === 'test' ? 'test' : name;
    if (!(script in all)) { found.push(`${name}: no such npm script`); continue; }
    const text = reachableText(script, all);
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
