import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { apiSurfaceOf, declarationInputs, declarationPackages, declarationStamp, staleReason, stampFile } from '../../../../scripts/api-report-stamp.ts';

/**
 * The cheap staleness gate for the committed API reports (scripts/api-report-stamp.ts), which runs in
 * `npm run typecheck` because the real `api:check` takes 46s. It answers "could the reports have
 * changed?" by fingerprinting the declarations they are generated from.
 *
 * The properties it is worthless without are about what it reads, so that is what these pin:
 * declarations move the fingerprint, compiled JavaScript does not, and within a declaration a doc
 * comment's prose does not while its tags and its presence do. Everything runs on temporary fixtures —
 * a spec must never rebuild the repo's packages.
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

const stamp = (dir: string, value: string = declarationStamp(dir)): void => {
  fs.mkdirSync(path.join(dir, 'etc'), { recursive: true });
  fs.writeFileSync(stampFile(dir), value);
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

  /**
   * What a report is made of, measured against API Extractor rather than assumed: prose cannot change
   * one, a release tag can, and so can a comment appearing or going. Hashing prose made every comment
   * edit in this repo ask for a 46s `api:update` that rewrote nothing but the stamp.
   */
  describe('a doc comment', () => {
    // One package, rewritten between readings: a file's path is part of its fingerprint, so two fixtures
    // in two temp directories would differ whatever their contents
    const fingerprint = (...comments: string[]) => {
      const dir = pkg(tempDir(), '@abuddy/thing', { 'index.d.ts': '' });
      return comments.map((comment) => {
        fs.writeFileSync(path.join(dir, 'dist', 'index.d.ts'), `${comment}\nexport declare function f(): void;\n`);
        return declarationStamp(dir);
      });
    };

    it('does not move the fingerprint when only its prose changes', () => {
      const [before, after] = fingerprint(
        '/**\n * One description.\n * @public\n */',
        '/**\n * A completely different description, longer than the first.\n * @public\n */',
      );
      expect(after).toBe(before);
    });

    it('moves it when a release tag changes, which a report carries', () => {
      const [before, after] = fingerprint('/**\n * Same prose.\n * @public\n */', '/**\n * Same prose.\n * @internal\n */');
      expect(after).not.toBe(before);
    });

    it('moves it when the comment goes, since a report marks an undocumented export', () => {
      const [before, after] = fingerprint('/**\n * Some prose.\n */', '');
      expect(after).not.toBe(before);
    });

    // The normaliser is the one place this gate stops being byte-exact, so what it keeps is spelled out
    it('keeps its tag lines and its markers, and drops the rest', () => {
      expect(apiSurfaceOf('/**\n * Prose here.\n * @public\n * @deprecated - use g instead\n */\nexport declare const a: number;'))
        .toBe('/**@public\n@deprecated - use g instead*/\nexport declare const a: number;');
      expect(apiSurfaceOf('/** Prose only. */\nexport declare const a: number;')).toBe('/***/\nexport declare const a: number;');
      expect(apiSurfaceOf('export declare const a: number;')).toBe('export declare const a: number;');
    });
  });

  describe('staleReason', () => {
    it('passes when the stamp matches the declarations', () => {
      const root = tempDir();
      const dir = pkg(root, '@abuddy/thing', { 'index.d.ts': 'export declare const a: number;' });
      stamp(dir);
      expect(staleReason(dir)).toBeNull();
    });

    it('reports a declaration change, naming what to run', () => {
      const root = tempDir();
      const dir = pkg(root, '@abuddy/thing', { 'index.d.ts': 'export declare const a: number;' });
      stamp(dir);
      fs.writeFileSync(path.join(dir, 'dist', 'index.d.ts'), 'export declare const a: string;');
      expect(staleReason(dir)).toContain('api:update');
    });

    // Unbuilt declarations are a different problem with a different fix, and saying "run api:update"
    // there sends the reader to a command that cannot help.
    // "ui is stale" was most often @abuddy/sdk's declarations moving, and the message couldn't say so
    it("names the dependency whose declarations moved, not just this package", () => {
      const root = tempDir();
      const base = pkg(root, '@abuddy/base', { 'index.d.ts': 'export declare const a: string;' }, ['@abuddy/leaf']);
      const leaf = pkg(root, '@abuddy/leaf', { 'index.d.ts': 'export declare const b: string;' });
      stamp(base);

      fs.writeFileSync(path.join(leaf, 'dist', 'index.d.ts'), 'export declare const b: number;');
      const reason = staleReason(base);
      expect(reason).toContain('@abuddy/leaf');
      expect(reason).not.toContain('@abuddy/base');
      expect(reason).toContain('api:update');
    });

    it("says 'its declarations' when the package's own moved", () => {
      const root = tempDir();
      const base = pkg(root, '@abuddy/base', { 'index.d.ts': 'export declare const a: string;' }, ['@abuddy/leaf']);
      pkg(root, '@abuddy/leaf', { 'index.d.ts': 'export declare const b: string;' });
      stamp(base);

      fs.writeFileSync(path.join(base, 'dist', 'index.d.ts'), 'export declare const a: number;');
      expect(staleReason(base)).toContain('its declarations changed');
    });

    // The old format was one bare hash naming nothing, so it can't say which package moved
    it('treats a stamp from before per-package hashes as one to regenerate', () => {
      const root = tempDir();
      const dir = pkg(root, '@abuddy/solo', { 'index.d.ts': 'export declare const a: string;' });
      stamp(dir, 'deadbeef\n');
      expect(staleReason(dir)).toContain('api:update');
    });

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

describe('the entry set is part of what the stamp records', () => {
  /** Give a fixture package an exports map; only entries declaring `types` get a report */
  const withExports = (dir: string, exports: Record<string, unknown>): void => {
    const manifest = path.join(dir, 'package.json');
    const pkgJson = JSON.parse(fs.readFileSync(manifest, 'utf-8')) as Record<string, unknown>;
    fs.writeFileSync(manifest, JSON.stringify({ ...pkgJson, exports }));
  };

  // A report is one per entry, so adding an entry adds a report that does not exist yet while no
  // declaration moves. The stamp used to say "match" there, and api:check refused — which is the one
  // thing a matching stamp promises cannot happen.
  it('goes stale when an export is added, though no declaration changed', () => {
    const root = tempDir();
    const dir = pkg(root, '@abuddy/one', { 'index.d.ts': 'export declare const a: number;\n' });
    withExports(dir, { '.': { types: './dist/index.d.ts', '@abuddy/source': './src/index.ts' } });
    stamp(dir);
    expect(staleReason(dir)).toBeNull();

    withExports(dir, {
      '.': { types: './dist/index.d.ts', '@abuddy/source': './src/index.ts' },
      './packs': { types: './dist/index.d.ts', '@abuddy/source': './src/index.ts' },
    });
    expect(staleReason(dir)).toMatch(/published entries changed/);
  });

  it('goes stale when an export is removed, so an orphaned report is not left behind', () => {
    const root = tempDir();
    const dir = pkg(root, '@abuddy/one', { 'index.d.ts': 'export declare const a: number;\n' });
    withExports(dir, {
      '.': { types: './dist/index.d.ts', '@abuddy/source': './src/index.ts' },
      './fe': { types: './dist/index.d.ts', '@abuddy/source': './src/index.ts' },
    });
    stamp(dir);

    withExports(dir, { '.': { types: './dist/index.d.ts', '@abuddy/source': './src/index.ts' } });
    expect(staleReason(dir)).toMatch(/published entries changed/);
  });

  // An entry with no `types` gets no report, so it is not an input to one
  it('ignores an export that declares no types', () => {
    const root = tempDir();
    const dir = pkg(root, '@abuddy/one', { 'index.d.ts': 'export declare const a: number;\n' });
    withExports(dir, { '.': { types: './dist/index.d.ts', '@abuddy/source': './src/index.ts' } });
    stamp(dir);

    withExports(dir, {
      '.': { types: './dist/index.d.ts', '@abuddy/source': './src/index.ts' },
      './styles.css': './dist/styles.css',
    });
    expect(staleReason(dir)).toBeNull();
  });
});

describe('the producer is part of what the stamp records', () => {
  // API Extractor and the tsconfig it is pointed at move a report on their own: a path mapping added
  // to the tsconfig, a version whose formatting differs. Neither touches a declaration or an entry.
  it('goes stale when the extractor tsconfig changes', () => {
    const root = tempDir();
    const dir = pkg(root, '@abuddy/one', { 'index.d.ts': 'export declare const a: number;\n' });
    fs.writeFileSync(path.join(dir, 'tsconfig.api-extractor.json'), '{ "compilerOptions": { "strict": true } }');
    stamp(dir);
    expect(staleReason(dir)).toBeNull();

    fs.writeFileSync(path.join(dir, 'tsconfig.api-extractor.json'), '{ "compilerOptions": { "strict": false } }');
    expect(staleReason(dir)).toMatch(/API Extractor or its tsconfig changed/);
  });

  // What a stamp *means* can change without any input changing — apiSurfaceOf, or the rows themselves.
  // A stamp from another format says nothing about the inputs it does not carry.
  it('treats a stamp from another format as stale rather than reading it', () => {
    const root = tempDir();
    const dir = pkg(root, '@abuddy/one', { 'index.d.ts': 'export declare const a: number;\n' });
    stamp(dir, declarationStamp(dir).replace(/#version \d+/, '#version 0'));
    expect(staleReason(dir)).toMatch(/another stamp format/);
  });
});
