// What an npm script actually runs: the text it reaches, and the scripts it invokes on the way.
//
// Two checks ask questions of that: `check:tiers` asks whether a chain step's script reaches the app, and
// `chain-inputs.spec.ts` asks whether anything in the chain runs a given `<artifact>:check`. Both need the same
// walk — a script's own text, the scripts it calls with and without `-w`, and the repo files it names — so it
// lives once. Two walks would be two answers to one question, and the second would be the one nobody checked.
//
// A text scan, not a resolver. It errs towards following too much: what it is used for is asking whether a
// marker or a call is reachable, where a false "yes" is a check that reports something to look at and a false
// "no" is a check that passes for the wrong reason.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';

/**
 * Comments are prose, and prose about a command is not the command — a script explaining why it does *not* run
 * `abuddy test` would otherwise read as running it, which is how that was found. Stripping `#` can take a `#`
 * inside a string with it; that direction is safe for these callers, because what is left is still scanned and
 * what they look for are commands, which do not live inside string literals in these scripts.
 */
export function withoutComments(text: string, shell: boolean): string {
  return shell
    ? text.split('\n').map((l) => l.replace(/(^|\s)#.*$/, '$1')).join('\n')
    : text.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
}

/** The root `package.json`'s scripts, which is what a chain step's name resolves against */
export const rootScripts = (): Record<string, string> =>
  (JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf-8')) as { scripts: Record<string, string> }).scripts;

/**
 * A workspace's scripts, by the name its manifest declares.
 *
 * A step that delegates — `npm run test:integration -w @abuddy/cli` — used to be inspected as nothing at all:
 * the name is not a root script, so there was no text to scan and the step passed vacuously. What is followed
 * is the workspace's *scripts*, which are commands, and not its spec files, which are prose: two of this
 * repo's own specs say "the app configured for abuddy test" in a title, and scanning those would report them.
 */
export const workspaceScripts = (name: string): Record<string, string> | undefined => {
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

export interface Reached {
  /** Every script's text and every followed file's, concatenated — what a marker is searched for in */
  readonly text: string;
  /**
   * The scripts this one invokes, itself included: a root script as `<name>`, a workspace's as
   * `<workspace>:<name>`.
   *
   * Separate from `text` because a script *named* in prose is not a script run. `check-import-specifiers.ts`
   * mentions `api:check` in a message it prints, and a reachability check that searched the text would read
   * that as the chain running it.
   */
  readonly invoked: ReadonlySet<string>;
}

/**
 * The text of a script plus every repo file it names, following `npm run` calls one level at a time.
 *
 * `skip` is a file the caller must not follow into — `check:tiers` names the app markers it looks for, so
 * scanning itself would always match.
 */
export function reachableText(script: string, all: Record<string, string>, { skip }: { skip?: string } = {}): Reached {
  const seen = new Set<string>();
  const invoked = new Set<string>();

  const walk = (name: string): string => {
    if (seen.has(name)) return '';
    seen.add(name);
    invoked.add(name);
    let text = all[name] ?? '';
    for (const called of text.matchAll(/npm run ([\w:-]+)/g)) text += `\n${walk(called[1]!)}`;
    for (const [, called, workspace] of text.matchAll(WORKSPACE_CALL)) {
      const key = `${workspace}:${called}`;
      if (seen.has(key)) continue;
      seen.add(key);
      invoked.add(key);
      text += `\n${workspaceScripts(workspace)?.[called!] ?? ''}`;
    }
    for (const file of text.matchAll(/(?:bash |sh |tsx |node )?((?:tests|scripts)\/[\w./-]+\.(?:sh|ts|mjs))/g)) {
      const named = file[1]!;
      if (skip !== undefined && (named === skip || named.endsWith(skip))) continue;
      const abs = path.join(REPO_ROOT, named);
      if (!seen.has(abs) && fs.existsSync(abs)) {
        seen.add(abs);
        text += `\n${withoutComments(fs.readFileSync(abs, 'utf-8'), abs.endsWith('.sh'))}`;
      }
    }
    return text;
  };

  return { text: walk(script), invoked };
}
