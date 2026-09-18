import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { declarationFingerprint, declarationInputs, declarationPackages, staleReason, stampFile } from '../../../../scripts/api-report-stamp.ts';

/**
 * The cheap staleness gate for the committed API reports (scripts/api-report-stamp.ts), which runs in
 * `npm run typecheck` because the real `api:check` takes 46s. It answers "could the reports have
 * changed?" by fingerprinting the declarations they are generated from.
 *
 * The two properties it is worthless without are about which files it reads, so that is what these
 * pin: declarations move the fingerprint, compiled JavaScript does not. Everything runs on temporary
 * fixtures — a spec must never rebuild the repo's packages.
 */

const temps: string[] = [];
function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-api-stamp-'));
  temps.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** A package with a dist holding the given files, and optional @abuddy dependencies */
function pkg(root: string, name: string, dist: Record<string, string>, deps: string[] = []): string {
  const dir = path.join(root, 'packages', name.replace('@abuddy/', 'abuddy-'));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name, version: '0.0.0', ...(deps.length > 0 && { dependencies: Object.fromEntries(deps.map((d) => [d, '*'])) }),
  }));
  for (const [file, content] of Object.entries(dist)) {
    const full = path.join(dir, 'dist', file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

const stamp = (dir: string, value: string): void => {
  fs.mkdirSync(path.join(dir, 'etc'), { recursive: true });
  fs.writeFileSync(stampFile(dir), `${value}\n`);
};

describe('the API report staleness gate', () => {
  it('reads declarations and ignores compiled output, so a body-only change is not a report change', () => {
    const root = tempDir();
    const dir = pkg(root, '@abuddy/thing', { 'index.d.ts': 'export declare const a: number;', 'index.js': 'const a = 1;' });
    const before = declarationInputs(dir);
    fs.writeFileSync(path.join(dir, 'dist', 'index.js'), 'const a = 2; // a different body');
    expect(declarationInputs(dir)).toEqual(before);
    expect(before.map((f) => path.basename(f))).toEqual(['index.d.ts']);
  });

  // @abuddy/ui's components emit `X.d.vue.ts`, the name TypeScript looks for under node16. A glob of
  // `*.d.ts` misses every one of them, which is most of the reports this gate protects.
  it("reads a component's .d.vue.ts declarations", () => {
    const root = tempDir();
    const dir = pkg(root, '@abuddy/thing', { 'button.d.ts': 'export {};', 'button.d.vue.ts': 'export {};', 'button.js': '' });
    expect(declarationInputs(dir).map((f) => path.basename(f)).sort()).toEqual(['button.d.ts', 'button.d.vue.ts']);
  });

  it('excludes source maps, which embed absolute paths and would differ per machine', () => {
    const root = tempDir();
    const dir = pkg(root, '@abuddy/thing', { 'index.d.ts': 'export {};', 'index.d.ts.map': '{"sources":["/Users/someone/x"]}' });
    expect(declarationInputs(dir).map((f) => path.basename(f))).toEqual(['index.d.ts']);
  });

  // A report names types from the package's dependencies, which is why tsconfig.api-extractor.json
  // resolves those to their built declarations. A change there can change the report.
  it("includes its @abuddy dependencies' declarations, transitively", () => {
    const root = tempDir();
    pkg(root, '@abuddy/base', { 'index.d.ts': 'export declare type B = string;' });
    pkg(root, '@abuddy/mid', { 'index.d.ts': 'export declare type M = number;' }, ['@abuddy/base']);
    const top = pkg(root, '@abuddy/top', { 'index.d.ts': 'export {};' }, ['@abuddy/mid']);
    expect(declarationPackages(top).map((d) => path.basename(d))).toEqual(['abuddy-top', 'abuddy-mid', 'abuddy-base']);
  });

  it('does not loop on a dependency cycle', () => {
    const root = tempDir();
    const a = pkg(root, '@abuddy/a', { 'index.d.ts': 'export {};' }, ['@abuddy/b']);
    pkg(root, '@abuddy/b', { 'index.d.ts': 'export {};' }, ['@abuddy/a']);
    expect(declarationPackages(a).map((d) => path.basename(d))).toEqual(['abuddy-a', 'abuddy-b']);
  });

  describe('staleReason', () => {
    it('passes when the stamp matches the declarations', () => {
      const root = tempDir();
      const dir = pkg(root, '@abuddy/thing', { 'index.d.ts': 'export declare const a: number;' });
      stamp(dir, declarationFingerprint(dir));
      expect(staleReason(dir)).toBeNull();
    });

    it('reports a declaration change, naming what to run', () => {
      const root = tempDir();
      const dir = pkg(root, '@abuddy/thing', { 'index.d.ts': 'export declare const a: number;' });
      stamp(dir, declarationFingerprint(dir));
      fs.writeFileSync(path.join(dir, 'dist', 'index.d.ts'), 'export declare const a: string;');
      expect(staleReason(dir)).toContain('api:update');
    });

    // Unbuilt declarations are a different problem with a different fix, and saying "run api:update"
    // there sends the reader to a command that cannot help.
    it('names the build, not api:update, when nothing is built', () => {
      const root = tempDir();
      const dir = pkg(root, '@abuddy/thing', {});
      expect(staleReason(dir)).toContain('packages:build');
    });

    it('reports a missing stamp rather than throwing', () => {
      const root = tempDir();
      const dir = pkg(root, '@abuddy/thing', { 'index.d.ts': 'export {};' });
      expect(staleReason(dir)).toContain('api:update');
    });
  });
});
