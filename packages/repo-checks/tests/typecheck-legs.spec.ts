import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';
import { TYPECHECK_LEGS } from '../../../scripts/lib/typecheck-legs.ts';
import { rootScripts } from '../../../scripts/lib/npm-scripts.ts';
import { PACKAGE_DIRS } from '../../../scripts/lib/workspace-deps.ts';
import { population } from '@abuddy/sdk/testing';

/**
 * A leg's declared scope is held to what its script names.
 *
 * The scope could have been parsed out of the script instead of declared — most legs name their workspace
 * with `--workspace`, and two name a directory with `tsc -p`. It is declared because the scope is a *cache
 * key*: a shell-text parse that gets it wrong produces a wrong key, which is silent, where a wrong
 * declaration caught by this case is loud. Same shape as `needsApp` — declared intent, derived check.
 *
 * **The rule is one-directional: a declaration may be wider than the script, never narrower.** Wider costs
 * cache hits and nothing else; narrower is a leg that does not re-run when something it compiles changes.
 * `'repo'` is the widest there is, which is why a leg that walks the tree says so rather than listing.
 */

/** The workspace directories a leg's script actually names, read from the script rather than the leg. */
function namedBy(command: string): string[] {
  const byWorkspace = [...command.matchAll(/--workspace[= ]([^\s]+)|(?:^|\s)-w[= ]([^\s]+)/g)]
    .map((hit) => hit[1] ?? hit[2]!)
    .map((name) => PACKAGE_DIRS.find((dir) => workspaceName(dir) === name))
    .filter((dir): dir is string => dir !== undefined);
  const byPath = [...command.matchAll(/(?:tsc -p|cd) (packages\/[^\s/]+)/g)].map((hit) => hit[1]!.replace('packages/', ''));
  return [...new Set([...byWorkspace, ...byPath])].sort();
}

/** A workspace's npm name, from its own manifest — so this cannot drift from what `-w` takes. */
function workspaceName(dir: string): string {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, 'packages', dir, 'package.json'), 'utf-8'),
  ) as { name: string };
  return manifest.name;
}

describe('a typecheck leg declares what it checks', () => {
  it('finds legs and scopes, so the rule below is not reading an empty table', () => {
    const found = population('typecheck legs', [...TYPECHECK_LEGS], { atLeast: 15 });
    expect(found.filter((leg) => leg.scope !== 'repo').length, 'every leg says `repo`, so nothing is scoped')
      .toBeGreaterThan(10);
    expect(found.filter((leg) => leg.scope === 'repo').length, 'no leg says `repo`, so that branch is untested')
      .toBeGreaterThan(0);
  });

  it('has a script for every leg, so a renamed one fails here rather than at run time', () => {
    const all = rootScripts();
    expect(TYPECHECK_LEGS.filter((leg) => !(leg.name in all)).map((leg) => leg.name)).toEqual([]);
  });

  it('declares a scope no narrower than its script names', () => {
    const all = rootScripts();
    const narrow = TYPECHECK_LEGS.flatMap((leg) => {
      if (leg.scope === 'repo') return [];
      const named = namedBy(all[leg.name] ?? leg.command);
      const missing = named.filter((dir) => !leg.scope.includes(dir));
      return missing.map((dir) => `${leg.name} compiles ${dir} and does not declare it`);
    });
    expect(narrow, 'a leg that does not declare what it compiles will not re-run when that changes')
      .toEqual([]);
  });

  it('names only real package directories', () => {
    const unknown = TYPECHECK_LEGS.flatMap((leg) => (leg.scope === 'repo' ? [] : leg.scope))
      .filter((dir) => !PACKAGE_DIRS.includes(dir));
    expect([...new Set(unknown)], 'these are not workspaces under packages/').toEqual([]);
  });
});
