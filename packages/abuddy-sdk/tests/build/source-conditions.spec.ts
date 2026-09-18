import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { PACKAGES_MODE_ENV, sourceConditions } from '../../src/build/source-conditions.ts';

const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'source-conditions-'));
afterAll(() => fs.rmSync(parent, { recursive: true, force: true }));

type Layout = 'source' | 'dist';

/**
 * A pack dir whose node_modules holds the named @abuddy packages. `source` installs a checkout: a
 * directory outside node_modules, symlinked in, carrying the src file the package's
 * `@abuddy/source` export names. `dist` installs a published tarball: a real directory under
 * node_modules with the built file and no src.
 */
function pack(name: string, packages: Partial<Record<'ears' | 'sdk' | 'ui', Layout>>): string {
  const dir = path.join(parent, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, type: 'module' }));
  fs.mkdirSync(path.join(dir, 'node_modules', '@abuddy'), { recursive: true });
  for (const [short, layout] of Object.entries(packages)) {
    const linked = path.join(dir, 'node_modules', '@abuddy', short);
    const pkgDir = layout === 'source' ? path.join(parent, `${name}-checkout`, short) : linked;
    fs.mkdirSync(path.join(pkgDir, layout === 'source' ? 'src' : 'dist'), { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({
      name: `@abuddy/${short}`,
      type: 'module',
      exports: {
        '.': { '@abuddy/source': './src/index.ts', types: './dist/index.d.ts', default: './dist/index.js' },
        './package.json': './package.json',
      },
    }));
    fs.writeFileSync(path.join(pkgDir, layout === 'source' ? 'src/index.ts' : 'dist/index.js'), 'export {};\n');
    if (layout === 'source') fs.symlinkSync(pkgDir, linked, 'dir');
  }
  return dir;
}

describe('sourceConditions', () => {
  describe(`a declared ${PACKAGES_MODE_ENV}`, () => {
    afterEach(() => {
      delete process.env[PACKAGES_MODE_ENV];
    });

    it('is what the build resolves, whatever is installed', () => {
      const published = pack('declared-over-published', { ears: 'dist', sdk: 'dist', ui: 'dist' });
      process.env[PACKAGES_MODE_ENV] = 'source';
      expect(sourceConditions(published)).toEqual(['@abuddy/source']);

      const linked = pack('declared-over-linked', { ears: 'source', sdk: 'source', ui: 'source' });
      process.env[PACKAGES_MODE_ENV] = 'dist';
      expect(sourceConditions(linked)).toEqual([]);
    });

    it('settles an install this would otherwise refuse', () => {
      const mixed = pack('declared-over-mixed', { sdk: 'source', ui: 'dist' });
      expect(() => sourceConditions(mixed)).toThrow(/disagree/);
      process.env[PACKAGES_MODE_ENV] = 'dist';
      expect(sourceConditions(mixed)).toEqual([]);
    });

    it('is what every other decider reads too', () => {
    // The whole point of declaring: with-source.mjs, the CLI's resolve hooks and
    // assertSourceResolution all read this variable, so one run resolves one way
    expect(PACKAGES_MODE_ENV).toBe('ABUDDY_PACKAGES');
  });

  it('refuses a value that names no mode', () => {
      process.env[PACKAGES_MODE_ENV] = 'yes';
      expect(() => sourceConditions(pack('declared-nonsense', { sdk: 'dist' }))).toThrow(/is not a mode/);
    });

    it('is ignored when empty, so an unset variable reads as unset', () => {
      process.env[PACKAGES_MODE_ENV] = '';
      expect(sourceConditions(pack('declared-empty', { sdk: 'source' }))).toEqual(['@abuddy/source']);
    });
  });

  it('resolves source when every @abuddy package is a checkout', () => {
    expect(sourceConditions(pack('all-linked', { ears: 'source', sdk: 'source', ui: 'source' }))).toEqual(['@abuddy/source']);
  });

  it('resolves dist when every @abuddy package is published', () => {
    expect(sourceConditions(pack('all-published', { ears: 'dist', sdk: 'dist', ui: 'dist' }))).toEqual([]);
  });

  it("refuses an install it can't read, rather than reading it as published", () => {
    // Only "not installed here" is an answer; an install whose manifest is unreadable, or which
    // doesn't expose one, must not silently come out as a published package
    const unreadable = pack('unreadable-manifest', { sdk: 'dist' });
    fs.writeFileSync(path.join(unreadable, 'node_modules', '@abuddy', 'sdk', 'package.json'), '{ oops');
    // Node's own resolver parses the manifest, so this surfaces as the resolve failure
    expect(() => sourceConditions(unreadable)).toThrow(/Can't tell how @abuddy\/sdk is installed/);

    const unexposed = pack('unexposed-manifest', { sdk: 'dist' });
    const manifest = path.join(unexposed, 'node_modules', '@abuddy', 'sdk', 'package.json');
    const parsed = JSON.parse(fs.readFileSync(manifest, 'utf-8'));
    delete parsed.exports['./package.json'];
    fs.writeFileSync(manifest, JSON.stringify(parsed));
    expect(() => sourceConditions(unexposed)).toThrow(/Can't tell how @abuddy\/sdk is installed/);
  });

  it('refuses a directory it cannot read an install from, rather than reading it as published', () => {
    expect(() => sourceConditions('')).toThrow(/needs the directory whose install to read/);
    // @ts-expect-error the argument is required: an older caller passing nothing must not read as dist
    expect(() => sourceConditions()).toThrow(/needs the directory whose install to read/);
  });

  it('ignores @abuddy packages the pack does not have installed', () => {
    expect(sourceConditions(pack('sdk-only-linked', { sdk: 'source' }))).toEqual(['@abuddy/source']);
    expect(sourceConditions(pack('sdk-only-published', { sdk: 'dist' }))).toEqual([]);
  });

  it('returns no condition when no @abuddy package resolves', () => {
    expect(sourceConditions(pack('nothing-installed', {}))).toEqual([]);
  });

  // The decision used to be read off @abuddy/sdk alone and applied to every @abuddy package, so a
  // linked SDK turned the condition on for a published @abuddy/ui, whose tarball has no src to
  // resolve — and a published SDK left it off for a linked @abuddy/ui, compiling its stale dist.
  it('fails, naming both sides, when a linked SDK is installed with a published @abuddy/ui', () => {
    const dir = pack('linked-sdk-published-ui', { sdk: 'source', ui: 'dist' });
    expect(() => sourceConditions(dir)).toThrow(/@abuddy\/sdk[\s\S]*@abuddy\/ui/);
    expect(() => sourceConditions(dir)).toThrow(/published \(dist only\)/);
  });

  it('fails, naming both sides, when a published SDK is installed with a linked @abuddy/ui', () => {
    const dir = pack('published-sdk-linked-ui', { sdk: 'dist', ui: 'source' });
    expect(() => sourceConditions(dir)).toThrow(/@abuddy\/ui[\s\S]*@abuddy\/sdk/);
    expect(() => sourceConditions(dir)).toThrow(/from a checkout's source/);
  });

  it('fails when @abuddy/ears disagrees with the SDK', () => {
    expect(() => sourceConditions(pack('mixed-ears', { ears: 'dist', sdk: 'source', ui: 'source' }))).toThrow(/@abuddy\/ears/);
  });
});
