// An action's body and a prompt's template are compiled by esbuild at build time (`compileSourceDir`), stored on the
// record as `actionFn`/`templateFn`, and run by the app. A body that compiled to nothing, or to something that
// doesn't parse, is silent: the content imports, the row looks right, and the action fails when a flow reaches it.
//
// The content-parity golden used to cover this by accident, digesting the whole row — which also meant every edit to
// any source moved 75 rows, so it fired constantly on changes that were fine. This checks the property that edit
// cannot change: there is a body, and it parses. Editing what a body *does* leaves it alone; emitting an empty or
// truncated one fails it. `tests/content/CLAUDE.md` has the whole split of what the golden records.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

/** Where `abuddy build` writes this pack's compiled content */
const DIST = path.join(path.resolve(import.meta.dirname, '../..'), 'dist', 'runtime', 'content');

/** Parses a body without running it; `AsyncFunction` so `await` inside one is allowed */
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (...args: string[]) => unknown;

const records = (file: string): Record<string, unknown>[] =>
  JSON.parse(fs.readFileSync(path.join(DIST, file), 'utf-8')).records;

describe.each([
  { what: 'actions', file: 'actions.content.json', body: 'actionFn', params: ['params', 'services'] },
  { what: 'prompts', file: 'prompts.content.json', body: 'templateFn', params: ['inputs'] },
])('compiled $what', ({ what, file, body, params }) => {
  const all = records(file);

  it('are in the compiled content at all, so the checks below are reading something', () => {
    expect(all.length, `no ${what} in dist/${file} — run npm run compile`).toBeGreaterThan(0);
  });

  it(`each carry a non-empty ${body}`, () => {
    const empty = all.filter((r) => typeof r[body] !== 'string' || (r[body] as string).trim() === '');
    expect(empty.map((r) => r.label)).toEqual([]);
  });

  // The other half of what the content-parity golden used to cover by digesting the row: that every record carries a
  // hash for change tracking to run on. notes-change-tracking.spec.ts asserts the same of every written note; the
  // rule a missing hash triggers is the applier's, covered once in @abuddy/sdk's applier.spec.ts.
  it('each carry a contentHash of the compiler\'s shape', () => {
    const wrong = all.filter((r) => typeof r.contentHash !== 'string' || !/^[0-9a-f]{16}$/.test(r.contentHash as string));
    expect(wrong.map((r) => `${r.label as string}: ${String(r.contentHash)}`)).toEqual([]);
  });

  it('each parse', () => {
    const broken = all.flatMap((r) => {
      try {
        new AsyncFunction(...params, r[body] as string);
        return [];
      } catch (error) {
        return [`${r.label as string}: ${(error as Error).message}`];
      }
    });
    expect(broken).toEqual([]);
  });
});
