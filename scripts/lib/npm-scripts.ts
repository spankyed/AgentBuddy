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
 * A step that delegates — `npm run build -w @app/default-setup`, which `compile` does — is inspected as
 * nothing at all without this:
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

/**
 * An `npm run <script>` call and the tail that may carry workspace flags, **bounded at a command
 * separator**.
 *
 * The tail stops at `&`, `|` or `;` because a shell line holds several commands, and a pattern that ran to
 * the newline attributed one command's workspace to another's script name. `compile` is the worked case:
 * `npm run packages:ensure && npm run build -w @app/default-setup && …` reported
 * `@app/default-setup:packages:ensure` — a script that exists nowhere — while missing
 * `@app/default-setup:build`, the expensive thing it actually runs, and never walking root
 * `packages:ensure` at all. Both halves reach a cache key (`commandText` reads `invoked`), so the key named
 * work the step does not do and omitted work it does.
 *
 * Every flag in the tail is read, not the first: `typecheck:cli` names two workspaces and only
 * `@abuddy/cli` was seen.
 */
const NPM_CALL = /npm\s+(?:run\s+)?([\w:-]+)([^\n&|;]*)/g;
const WORKSPACE_FLAG = /(?:--workspace[= ]|-w\s+)(\S+)/g;

export interface Reached {
  /** Every script's text and every followed file's, concatenated — what a marker is searched for in */
  readonly text: string;
  /**
   * The repo files this script reaches, repo-relative: what it names and what those name in turn.
   *
   * A step that declares its inputs has to declare these, or an edit to one changes what the step accepts
   * while its stamp says nothing moved.
   *
   * The shape to watch for is a step that delegates to a workspace script which names a repo file: the step's
   * own text mentions neither, so nothing connects the file to the step that reads it. That is what asked for
   * this field — `compile` running a pack's `facade:check`, whose script was a repo script (it is a CLI
   * command now) that went undeclared for a commit.
   */
  readonly files: ReadonlySet<string>;
  /**
   * The scripts this one invokes, itself included: a root script as `<name>`, a workspace's as
   * `<workspace>:<name>`.
   *
   * Separate from `text` because a script *named* in prose is not a script run. `check-import-specifiers.ts`
   * mentions `api:check` in a message it prints, and a reachability check that searched the text would read
   * that as the chain running it.
   *
   * **One level, from the script's own text, and deliberately not from the files it runs.** Following `npm run`
   * out of a file's contents was tried and reverted: a text scan cannot tell a command from a mention, and
   * `test-external-pack-app.sh` then "invoked" the contract script it documents itself as not running. A loose
   * `files` set over-declares inputs, which is safe; a loose `invoked` set says a check runs when nothing runs
   * it, which is the failure the caller exists to catch. A script that moves its commands into a module
   * exports them instead — `scripts/typecheck.ts` does, as `TYPECHECK_LEGS`.
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
  const files = new Set<string>();

  const walk = (name: string): string => {
    if (seen.has(name)) return '';
    seen.add(name);
    invoked.add(name);
    let text = all[name] ?? '';
    // One pass over the calls this script makes, since each one's own tail says whether it names a
    // workspace: where it does the script is that workspace's, and where it does not it is the root's.
    // Two passes with a position check is what let one command's flag be read as another's.
    // Safe to append to `text` while iterating: `matchAll` binds the string value at the call, so the
    // iterator is over the body as it was and what the walk appends is scanned by that walk's own pass
    for (const [, called, tail] of text.matchAll(NPM_CALL)) {
      const workspaces = [...(tail ?? '').matchAll(WORKSPACE_FLAG)].map(([, workspace]) => workspace!);
      if (workspaces.length === 0) {
        text += `\n${walk(called!)}`;
        continue;
      }
      for (const workspace of workspaces) {
        const key = `${workspace}:${called!}`;
        if (seen.has(key)) continue;
        seen.add(key);
        invoked.add(key);
        text += `\n${workspaceScripts(workspace)?.[called!] ?? ''}`;
      }
    }
    for (const file of text.matchAll(/(?:bash |sh |tsx |node )?((?:tests|scripts)\/[\w./-]+\.(?:sh|ts|mjs))/g)) {
      const named = file[1]!;
      if (skip !== undefined && (named === skip || named.endsWith(skip))) continue;
      const abs = path.join(REPO_ROOT, named);
      if (!seen.has(abs) && fs.existsSync(abs)) {
        seen.add(abs);
        files.add(path.relative(REPO_ROOT, abs));
        text += `\n${withoutComments(fs.readFileSync(abs, 'utf-8'), abs.endsWith('.sh'))}`;
      }
    }
    return text;
  };

  return { text: walk(script), files, invoked };
}

/**
 * What a step's command *is*, as a string a cache key can hold: every script it invokes, by name and body.
 *
 * A step is run as `npm run <name>`, so its command lives in a manifest rather than in a file, and the
 * chain's fingerprint hashes paths and bytes. Until this existed the only way to put a command in a key
 * was to hash the whole of `package.json` into every step — which is why editing one script invalidated
 * all of them.
 *
 * **Not `reachableText(...).text`.** That concatenates the contents of every `scripts/**` file a command
 * names, and those are already declared inputs hashed file by file. Keying on it would hash them twice
 * and move a step's key when a comment in one of them moved. `invoked` is the set of scripts and nothing
 * else, which is the part a manifest holds and the file walk does not.
 *
 * **The risk this carries.** It makes a cache key depend on a text walk of shell, and the two failure
 * modes are not alike: a wrong *scan* reports a finding someone reads, a wrong *key* is silent. So what is
 * hashed is the command text **and**, separately, the files that text names as declared inputs — never a
 * parse of what the command means. `chain-inputs.spec.ts` holds both halves: that a change to a script's
 * text moves the step's fingerprint, and that every file a command names is declared.
 *
 * The name is included beside the body so a script renamed to one with identical text still moves the key.
 */
export function commandText(script: string, all: Record<string, string>): string {
  const bodyOf = (key: string): string => {
    // A root script first: its own name may contain the colon that otherwise separates a workspace
    if (key in all) return all[key];
    const at = key.indexOf(':');
    if (at === -1) return '';
    return workspaceScripts(key.slice(0, at))?.[key.slice(at + 1)] ?? '';
  };
  return [...reachableText(script, all).invoked]
    .sort()
    .map((key) => `${key}\0${bodyOf(key)}`)
    .join('\n');
}
