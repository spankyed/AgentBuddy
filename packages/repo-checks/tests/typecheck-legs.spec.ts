import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';
import { scopeOf, TYPECHECK_LEGS, type Leg } from '../../../scripts/lib/typecheck-legs.ts';
import { rootScripts } from '../../../scripts/lib/npm-scripts.ts';
import { PACKAGE_DIRS } from '../../../scripts/lib/workspace-deps.ts';
import { population } from '@abuddy/sdk/testing';

/**
 * A leg's scope comes from its script, and a declared one has something the script cannot say.
 *
 * This was the other way round until 2026-10: every leg declared a scope and this file held the
 * declaration to the script. Twelve of the eighteen declarations turned out to be byte-identical to what
 * the script already named — a second record of one fact, which is what the derived chain graph exists to
 * remove. So the parse became the source and the declarations went.
 *
 * What is checked now is the shape of the exception rather than the rule: that nothing declares a list the
 * script would have given anyway, that nothing is left without either, and that a declaration names real
 * workspaces.
 */

/** Whether the leg's own script names any workspace — the thing `scopeOf` reads when nothing is declared */
const scriptNames = (leg: Leg): boolean => {
  const command = rootScripts()[leg.name] ?? '';
  return /--workspace[= ]|(?:^|\s)-w[= ]|(?:tsc -p|cd) packages\//.test(command);
};

describe('a typecheck leg takes its scope from its script', () => {
  it('finds legs, and both kinds, so neither branch below is untested', () => {
    const found = population('typecheck legs', [...TYPECHECK_LEGS], { atLeast: 15 });
    expect(found.filter((leg) => leg.scope === undefined).length, 'no leg derives its scope').toBeGreaterThan(8);
    expect(found.filter((leg) => leg.scope !== undefined).length, 'no leg declares one').toBeGreaterThan(0);
  });

  it('resolves a non-empty scope for every leg', () => {
    const broken = TYPECHECK_LEGS.flatMap((leg) => {
      try {
        const scope = scopeOf(leg);
        return scope === 'repo' || scope.length > 0 ? [] : [`${leg.name} resolves an empty scope`];
      } catch (err) {
        return [`${leg.name}: ${(err as Error).message}`];
      }
    });
    expect(broken, 'a leg with no scope gets empty inputs, so it depends on nothing and never goes stale')
      .toEqual([]);
  });

  /**
   * The rule that keeps the twelve from coming back. A declared *list* is only warranted where the script
   * names nothing — otherwise it is the duplicate this change removed, and it can drift from the script
   * while both look right. `'repo'` is exempt: it is strictly wider than any parse, which is its point.
   */
  it('declares a list only where the script names nothing', () => {
    const redundant = TYPECHECK_LEGS
      .filter((leg) => leg.scope !== undefined && leg.scope !== 'repo' && scriptNames(leg))
      .map((leg) => `${leg.name} declares a scope its own script already names — drop it and let scopeOf read it`);
    expect(redundant).toEqual([]);
  });

  /**
   * The property that makes deriving this no weaker than declaring it.
   *
   * A parse that keeps what it understood and drops the rest narrows the scope silently, and a scope short
   * one workspace is a step that stops re-running when that workspace changes. Nothing is unresolved today,
   * so this is the case that keeps it that way rather than one that fires — and "it happens to resolve" is
   * not the same property as "it cannot quietly fail to".
   */
  it('resolves every workspace its scripts name, rather than keeping what it understood', () => {
    const named = TYPECHECK_LEGS.filter((leg) => leg.scope === undefined);
    expect(named.length, 'no leg derives its scope, so this checks nothing').toBeGreaterThan(8);
    const broken = named.flatMap((leg) => {
      try { scopeOf(leg); return []; } catch (err) { return [(err as Error).message]; }
    });
    expect(broken, 'a mention it cannot resolve must be refused, not dropped').toEqual([]);
  });

  it('refuses a leg whose script names a workspace it cannot resolve', () => {
    const invented: Leg = { name: 'typecheck:bogus', command: 'npm run typecheck --workspace @abuddy/not-a-package', seconds: 1 };
    // The leg's own `command` is not what is read — the root script of that name is, and there is none here,
    // so this is the no-mentions refusal. The resolvable-mention rule is the case above, over the real table.
    expect(() => scopeOf(invented)).toThrow(/names no workspace, so declare a scope/);
  });

  it('refuses a leg whose script names nothing and which declares nothing', () => {
    const invented: Leg = { name: 'typecheck:nothing', command: 'npm run typecheck:nothing', seconds: 1 };
    expect(() => scopeOf(invented)).toThrow(/names no workspace, so declare a scope/);
  });

  it('names only real package directories', () => {
    const unknown = TYPECHECK_LEGS
      .flatMap((leg) => { const s = scopeOf(leg); return s === 'repo' ? [] : s; })
      .filter((dir) => !PACKAGE_DIRS.includes(dir));
    expect([...new Set(unknown)], 'these are not workspaces under packages/').toEqual([]);
  });
});

/**
 * The two figures in `CLAUDE.md`'s `typecheck` entry that this table decides.
 *
 * **Written for a failure this repo keeps having**: a figure that sizes a design outlives its truth, because
 * prose is the only artifact nothing re-derives. Two were found stale in one session — `api:check`'s "55s"
 * four months after it became 13.1s, and this line's "29.3s in 11s" against a measured 63.1s in 18.0s — and
 * each was load-bearing, the first being the whole argument for a proxy that has since been deleted.
 *
 * So the derivable half is derived. The leg count and the sum of the legs' declared `seconds` are this
 * table's, and a leg added, removed or re-costed fails here. The wall time is not checkable — it is a
 * measurement of a machine — and stays a citation with its date, which is the honest treatment for the half
 * that cannot be computed.
 *
 * `chain-table.spec.ts` holds `ci.yml`'s header to `ASSUMED_RUNGS` the same way and for the same reason.
 */
describe("CLAUDE.md's figures for this table", () => {
  /** The `npm run typecheck` entry of the command block, up to the next command — where both figures sit */
  const entry = (() => {
    const lines = fs.readFileSync(path.join(REPO_ROOT, 'CLAUDE.md'), 'utf-8').split('\n');
    const start = lines.findIndex((line) => line.startsWith('npm run typecheck '));
    const after = lines.findIndex((line, at) => at > start && line.startsWith('npm run '));
    return start === -1 ? '' : lines.slice(start, after === -1 ? undefined : after).join(' ');
  })();

  it('is there to read, so the two cases below are not passing over nothing', () => {
    expect(entry, 'the typecheck entry names its legs').toMatch(/legs run at once/);
  });

  it('names the number of legs the table holds', () => {
    expect(entry).toContain(`${TYPECHECK_LEGS.length} legs`);
  });

  it('names the sum of what they declare', () => {
    const declared = TYPECHECK_LEGS.reduce((total, leg) => total + (leg.seconds ?? 0), 0);
    expect(entry).toContain(`${declared.toFixed(1)}s of`);
  });
});
