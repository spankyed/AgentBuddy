import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BUILD_UNITS, CHECKOUT_MARKER, fingerprintInputs, fingerprintUnit, STAMP_VERSION, staleMessage, stampFile,
  stampedBuild, unitStaleReason, withBuildLock, type BuildIntent, type BuildUnit,
} from '@abuddy/host/build/packages-built';
import { PACKED_PACKAGES, REPO_ROOT } from '../helpers/published-packages';

/**
 * The freshness rule behind `npm test -w @abuddy/cli`'s pretest (@abuddy/host/build/packages-built):
 * a success stamp holding a content fingerprint of the build's inputs, so output that no successful
 * build produced never reads as built. Everything here runs on temporary fixtures — a spec must
 * never build the repo's packages (that is the pretest's job, in its own process).
 */

const temps: string[] = [];
function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-freshness-'));
  temps.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** A watched source tree plus its output tree, as a build unit sees them */
/** A temp package to build: its sources, its output tree, and the unit that ties them together */
interface Fixture {
  readonly root: string;
  readonly src: string;
  readonly out: string;
  readonly unit: BuildUnit;
}

function fixture(): Fixture {
  const root = tempDir();
  const src = path.join(root, 'src');
  const out = path.join(root, 'dist');
  fs.mkdirSync(path.join(src, 'nested'), { recursive: true });
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(src, 'a.ts'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(src, 'nested', 'b.ts'), 'export const b = 2;\n');
  fs.writeFileSync(path.join(root, 'package.json'), '{}\n');
  fs.writeFileSync(path.join(out, 'a.js'), 'export const a = 1;\n');
  return { root, src, out, unit: { inputs: [src, path.join(root, 'package.json')], outputs: [out] } };
}

/** What a successful build of the fixture writes */
function stampFor(f: Fixture): string {
  const stamp = path.join(f.root, 'stamp.json');
  fs.writeFileSync(stamp, JSON.stringify({ version: STAMP_VERSION, fingerprint: fingerprintUnit(f.unit) }));
  return stamp;
}

describe('the watched input set', () => {
  it('is exactly the workspaces npm run packages:build builds', () => {
    const script: string = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf-8')).scripts['packages:build'];
    const workspaces = [...script.matchAll(/-w\s+(\S+)/g)].map(([, name]) => name);
    expect(workspaces.length).toBeGreaterThan(0);
    expect(Object.keys(BUILD_UNITS).sort()).toEqual(workspaces.sort());
  });

  it('covers every source the CLI and testing bundles inline, not just the published packages', () => {
    // scripts/bundle-package.ts inlines @abuddy/host into both bundles, and the published-* specs
    // read @abuddy/testing's bundle: editing either left the bundles stale and the suite green.
    // Checked per unit, not over the union: one bundle watching @abuddy/host does not cover the other.
    for (const workspace of ['@abuddy/testing', '@abuddy/cli']) {
      const inputs = new Set(BUILD_UNITS[workspace].inputs);
      for (const input of ['packages/abuddy-host/src', 'packages/abuddy-host/package.json', 'scripts/bundle-package.ts']) {
        expect(inputs, workspace).toContain(path.join(REPO_ROOT, input));
      }
    }
    expect(new Set(BUILD_UNITS['@abuddy/testing'].inputs)).toContain(path.join(REPO_ROOT, 'packages', 'abuddy-testing', 'src'));
    expect(new Set(BUILD_UNITS['@abuddy/cli'].inputs)).toContain(path.join(REPO_ROOT, 'packages', 'abuddy-cli', 'src'));
  });

  it('covers each package build script and the configs it reads', () => {
    for (const [pkg, unit] of [['abuddy-ears', '@abuddy/ears'], ['abuddy-sdk', '@abuddy/sdk'], ['abuddy-ui', '@abuddy/ui']] as const) {
      const inputs = new Set(BUILD_UNITS[unit].inputs);
      for (const input of ['src', 'package.json', 'tsconfig.json', 'tsconfig.package.json']) {
        expect(inputs, `${unit}: ${input}`).toContain(path.join(REPO_ROOT, 'packages', pkg, input));
      }
      // The build script is the repo's, not the package's: a package's own scripts are its other tooling
      expect(inputs, `${unit}: the build script`).toContain(path.join(REPO_ROOT, 'scripts', 'build-package.ts'));
    }
    const ui = new Set(BUILD_UNITS['@abuddy/ui'].inputs);
    expect(ui).toContain(path.join(REPO_ROOT, 'packages', 'abuddy-ui', 'tsdown.config.ts'));
    expect(ui).toContain(path.join(REPO_ROOT, 'scripts', 'build-ui-package.ts'));
    // @abuddy/ui's build reads its exports helper, which stays with the package for exports:update
    expect(ui).toContain(path.join(REPO_ROOT, 'packages', 'abuddy-ui', 'scripts', 'exports.ts'));
  });

  // "No marker" and "not a checkout" are the same observation, and the second is legitimate for every
  // installed pack — so a marker that stops resolving turns the freshness guard off with nothing to see
  it('marks this checkout with a file that is here, so moving the marker fails a test and not a run', () => {
    expect(fs.existsSync(path.join(REPO_ROOT, CHECKOUT_MARKER)), CHECKOUT_MARKER).toBe(true);
  });

  it('names only paths that exist, so a renamed input cannot drop out unnoticed', () => {
    const missing = Object.values(BUILD_UNITS).flatMap((unit) => [...unit.inputs]).filter((input) => !fs.existsSync(input));
    expect(missing).toEqual([]);
  });

  it('is separate from the packages a consumer fixture installs', () => {
    // Widening the watch list must not change what installPublishedPackages() packs
    expect(Object.keys(PACKED_PACKAGES).sort()).toEqual(['ears', 'sdk', 'ui']);
    for (const name of Object.keys(PACKED_PACKAGES)) expect(BUILD_UNITS[`@abuddy/${name}`]).toBeDefined();
  });

  it('gives each workspace its own stamp, outside every output tree', () => {
    const stamps = Object.keys(BUILD_UNITS).map(stampFile);
    expect(new Set(stamps).size).toBe(stamps.length);
    for (const [workspace, unit] of Object.entries(BUILD_UNITS)) {
      for (const output of unit.outputs) expect(stampFile(workspace).startsWith(output)).toBe(false);
    }
  });
});

describe('the stamp protocol', () => {
  it('reads a stamp from another format as never built, so a protocol change rebuilds once', () => {
    const f = fixture();
    const stamp = path.join(f.root, 'stamp.json');
    fs.writeFileSync(stamp, JSON.stringify({ version: STAMP_VERSION - 1, fingerprint: fingerprintUnit(f.unit) }));
    expect(unitStaleReason(f.unit, stamp)).toMatch(/another format/);
  });

  it('reads a stamp with no version the same way, since every stamp this build writes has one', () => {
    const f = fixture();
    const stamp = path.join(f.root, 'stamp.json');
    fs.writeFileSync(stamp, JSON.stringify({ fingerprint: fingerprintUnit(f.unit) }));
    expect(unitStaleReason(f.unit, stamp)).toMatch(/another format/);
  });

  // Hashing only the contents would read a widened input set against the old stamp and call it fresh
  it('is stale when a unit gains a watched path, before anything under it changes', () => {
    const f = fixture();
    const stamp = stampFor(f);
    expect(unitStaleReason(f.unit, stamp)).toBeNull();
    const widened = { inputs: [...f.unit.inputs, path.join(f.root, 'tsdown.config.ts')], outputs: f.unit.outputs };
    expect(unitStaleReason(widened, stamp)).toMatch(/inputs changed/);
  });

  it('is stale when a unit gains an output, which changes what counts as built', () => {
    const f = fixture();
    const stamp = stampFor(f);
    const widened = { inputs: f.unit.inputs, outputs: [...f.unit.outputs, path.join(f.root, 'dist2')] };
    // The missing output is reported first; the point is that the stamp no longer matches either
    expect(unitStaleReason(widened, stamp)).not.toBeNull();
    fs.mkdirSync(path.join(f.root, 'dist2'), { recursive: true });
    expect(unitStaleReason(widened, stamp)).toMatch(/inputs changed/);
  });

  // This module decides whether to build; it cannot change what a build emits
  it('does not watch the code that decides freshness', () => {
    const watched = new Set(Object.values(BUILD_UNITS).flatMap((unit) => [...unit.inputs]));
    for (const rule of ['scripts/ensure-packages-built.ts', 'packages/abuddy-host/src/build/packages-built.ts']) {
      expect(watched, rule).not.toContain(path.join(REPO_ROOT, rule));
    }
    // @abuddy/testing and @abuddy/cli still watch all of abuddy-host/src, which their bundles inline
    for (const workspace of ['@abuddy/testing', '@abuddy/cli']) {
      expect(new Set(BUILD_UNITS[workspace].inputs), workspace).toContain(path.join(REPO_ROOT, 'packages', 'abuddy-host', 'src'));
    }
  });
});

describe('the input fingerprint', () => {
  // A unit's own output is never its own input, however broadly its inputs are declared. Two chain steps
  // declare a whole tree and then write into it — `compile` writes `src/__generated__` under the `src` it
  // reads, the fixture-pack check writes each pack's `dist` under the `tests/fixtures` it reads — and both
  // were self-invalidating in waiting: the only thing keeping them cached was those builds happening to be
  // byte-identical, and the pack build already is not (union ordering in its emitted declarations).
  it('ignores a change under the unit\'s own output, and still sees one under its inputs', () => {
    const f = fixture();
    // The output tree sits inside the input tree, which is the shape that caused this
    const nested = path.join(f.src, 'generated');
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(nested, 'emitted.ts'), 'export const emitted = 1;\n');
    const unit = { inputs: f.unit.inputs, outputs: [...f.unit.outputs, nested] };

    const before = fingerprintUnit(unit);
    fs.writeFileSync(path.join(nested, 'emitted.ts'), 'export const emitted = 2;\n');
    expect(fingerprintUnit(unit), 'its own output moved the fingerprint').toBe(before);

    fs.writeFileSync(path.join(f.src, 'a.ts'), 'export const a = 99;\n');
    expect(fingerprintUnit(unit), 'a real input stopped being seen').not.toBe(before);
  });

  it('changes when a watched file changes', () => {
    const f = fixture();
    const before = fingerprintInputs(f.unit.inputs);
    fs.writeFileSync(path.join(f.src, 'a.ts'), 'export const a = 2;\n');
    expect(fingerprintInputs(f.unit.inputs)).not.toBe(before);
  });

  it('changes when a watched file is deleted — which an output-is-newer check never sees', () => {
    const f = fixture();
    const before = fingerprintInputs(f.unit.inputs);
    fs.rmSync(path.join(f.src, 'nested', 'b.ts'));
    expect(fingerprintInputs(f.unit.inputs)).not.toBe(before);
  });

  it('changes when a watched file is added', () => {
    const f = fixture();
    const before = fingerprintInputs(f.unit.inputs);
    fs.writeFileSync(path.join(f.src, 'c.ts'), 'export const c = 3;\n');
    expect(fingerprintInputs(f.unit.inputs)).not.toBe(before);
  });

  it('distinguishes which file holds which content', () => {
    const f = fixture();
    const a = path.join(f.src, 'a.ts');
    const b = path.join(f.src, 'nested', 'b.ts');
    const [aText, bText] = [fs.readFileSync(a, 'utf-8'), fs.readFileSync(b, 'utf-8')];
    const before = fingerprintInputs(f.unit.inputs);
    fs.writeFileSync(a, bText);
    fs.writeFileSync(b, aText);
    expect(fingerprintInputs(f.unit.inputs)).not.toBe(before);
  });

  it('ignores mtimes, which move without an edit and tie on coarse filesystems', () => {
    const f = fixture();
    const before = fingerprintInputs(f.unit.inputs);
    const future = new Date(Date.now() + 60 * 60 * 1000);
    fs.utimesSync(path.join(f.src, 'a.ts'), future, future);
    expect(fingerprintInputs(f.unit.inputs)).toBe(before);
  });

  it('ignores a missing input consistently', () => {
    const f = fixture();
    const absent = path.join(f.root, 'tsdown.config.ts');
    const inputs = [...f.unit.inputs, absent];
    const before = fingerprintInputs(inputs);
    expect(fingerprintInputs(inputs)).toBe(before);
    fs.writeFileSync(absent, 'export default {};\n');
    expect(fingerprintInputs(inputs)).not.toBe(before);
  });

  it('does not throw when a watched file disappears mid-walk', () => {
    // The pretest reported this ENOENT as "npm run packages:build failed" though the build never ran
    const f = fixture();
    const gone = path.join(f.src, 'gone.ts');
    fs.writeFileSync(gone, 'export const gone = true;\n');
    const files = [...f.unit.inputs];
    fs.rmSync(gone);
    expect(() => fingerprintInputs([...files, gone])).not.toThrow();
  });
});

describe('the staleness verdict', () => {
  it('is fresh when the stamp matches the inputs', () => {
    const f = fixture();
    expect(unitStaleReason(f.unit, stampFor(f))).toBeNull();
  });

  it('is stale without a stamp, even when the output tree looks complete', () => {
    // A build that failed or was killed after its rmSync leaves exactly this
    const f = fixture();
    expect(unitStaleReason(f.unit, path.join(f.root, 'stamp.json'))).toMatch(/no stamp/);
  });

  it('is stale when the stamp is unreadable or has no fingerprint', () => {
    const f = fixture();
    const stamp = path.join(f.root, 'stamp.json');
    fs.writeFileSync(stamp, '{ not json');
    expect(unitStaleReason(f.unit, stamp)).toMatch(/no stamp/);
    fs.writeFileSync(stamp, '{}');
    expect(unitStaleReason(f.unit, stamp)).toMatch(/no stamp/);
  });

  it('is stale when a source changed, whatever the output mtimes say', () => {
    const f = fixture();
    const stamp = stampFor(f);
    fs.writeFileSync(path.join(f.src, 'a.ts'), 'export const a = 2;\n');
    // The output is untouched and newer than nothing — only the fingerprint can tell
    expect(unitStaleReason(f.unit, stamp)).toMatch(/inputs changed/);
  });

  it('is stale when a source was deleted', () => {
    const f = fixture();
    const stamp = stampFor(f);
    fs.rmSync(path.join(f.src, 'nested', 'b.ts'));
    expect(unitStaleReason(f.unit, stamp)).toMatch(/inputs changed/);
  });

  it('is stale when an output is missing, and says which', () => {
    const f = fixture();
    const stamp = stampFor(f);
    fs.rmSync(f.out, { recursive: true });
    expect(unitStaleReason(f.unit, stamp)).toMatch(/not built \(no /);
  });

  it('stays fresh when something else writes into the output tree', () => {
    // A stray file, .DS_Store or another tool's output used to raise the "built at" baseline
    const f = fixture();
    const stamp = stampFor(f);
    fs.writeFileSync(path.join(f.out, '.DS_Store'), 'junk');
    fs.writeFileSync(path.join(f.out, '__probe.js'), 'probe');
    expect(unitStaleReason(f.unit, stamp)).toBeNull();
  });

  it('stays fresh when a source is dated in the future, so the check cannot loop', () => {
    // An output can never be newer than a future-dated source: the old check rebuilt every run and
    // still reported stale afterwards, telling the user to run what they had just run
    const f = fixture();
    const stamp = stampFor(f);
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    fs.utimesSync(path.join(f.src, 'a.ts'), future, future);
    expect(unitStaleReason(f.unit, stamp)).toBeNull();
  });

  it('ignores dot files and node_modules under a watched directory', () => {
    const f = fixture();
    const stamp = stampFor(f);
    fs.writeFileSync(path.join(f.src, '.DS_Store'), 'junk');
    fs.mkdirSync(path.join(f.src, 'node_modules', 'dep'), { recursive: true });
    fs.writeFileSync(path.join(f.src, 'node_modules', 'dep', 'index.js'), 'module.exports = 1;');
    expect(unitStaleReason(f.unit, stamp)).toBeNull();
  });

  it('reports rather than throws when a source cannot be read', () => {
    const f = fixture();
    const stamp = stampFor(f);
    fs.chmodSync(f.src, 0o000);
    try {
      expect(unitStaleReason(f.unit, stamp)).toMatch(/could not be read/);
    } finally {
      fs.chmodSync(f.src, 0o755);
    }
  });
});

describe('the stale message', () => {
  it('names every stale workspace with its own reason', () => {
    const message = staleMessage([
      { workspace: '@abuddy/sdk', reason: 'its inputs changed since the last successful run' },
      { workspace: '@abuddy/ui', reason: 'no stamp' },
    ]);
    expect(message.split('\n')).toHaveLength(2);
    expect(message).toContain('@abuddy/sdk: its inputs changed');
    expect(message).toContain('@abuddy/ui: no stamp');
  });
});

describe('a stamped build', () => {
  /** stampedBuild against a fixture: its own stamp and lock, never the repo's */
  // Pinned to `command` rather than left to `intentFromEnv()`, so a test reads the same whatever
  // ABUDDY_BUILD_INTENT the run inherited
  const run = (f: Fixture, build: () => void | Promise<void>, intent: BuildIntent = 'command') =>
    stampedBuild('@abuddy/fixture', f.unit, path.join(f.root, 'stamp.json'), build, { lock: path.join(f.root, 'build.lock'), intent });

  it('leaves the unit fresh when the build returns', async () => {
    const f = fixture();
    await run(f, () => fs.writeFileSync(path.join(f.out, 'built.js'), 'ok'));
    expect(unitStaleReason(f.unit, path.join(f.root, 'stamp.json'))).toBeNull();
  });

  it('leaves no stamp when the build throws, however complete its output looks', async () => {
    const f = fixture();
    await run(f, () => {});
    await expect(run(f, () => {
      fs.rmSync(f.out, { recursive: true, force: true }); // as every build starts
      fs.mkdirSync(f.out, { recursive: true });
      fs.writeFileSync(path.join(f.out, 'half.js'), 'partial');
      throw new Error('tsc failed');
    })).rejects.toThrow('tsc failed');
    expect(fs.existsSync(path.join(f.root, 'stamp.json'))).toBe(false);
    expect(unitStaleReason(f.unit, path.join(f.root, 'stamp.json'))).toMatch(/no stamp/);
  });

  it('clears the previous stamp before building, so an interrupted build cannot leave a stale one', async () => {
    const f = fixture();
    await run(f, () => {});
    let stampDuringBuild = true;
    await run(f, () => { stampDuringBuild = fs.existsSync(path.join(f.root, 'stamp.json')); });
    expect(stampDuringBuild).toBe(false);
  });

  it('records the sources as they were before the build, so a mid-build edit stays stale', async () => {
    const f = fixture();
    await run(f, () => fs.writeFileSync(path.join(f.src, 'a.ts'), 'export const a = 99;\n'));
    expect(unitStaleReason(f.unit, path.join(f.root, 'stamp.json'))).toMatch(/inputs changed/);
  });

  it('rebuilds a fresh unit for a command and skips it for a freshness fix', async () => {
    const f = fixture();
    await run(f, () => fs.writeFileSync(path.join(f.out, 'built.js'), 'ok'));
    expect(unitStaleReason(f.unit, path.join(f.root, 'stamp.json'))).toBeNull();

    // The second arrival of two racing freshness fixes: the first built it while this one waited, so
    // there is nothing left to do. A command was asked for a build and gets one.
    let built = false;
    await run(f, () => { built = true; }, 'freshness');
    expect(built, 'a freshness fix rebuilt a unit that was already fresh').toBe(false);

    await run(f, () => { built = true; }, 'command');
    expect(built, 'a command skipped a build it was asked for').toBe(true);
  });

  it('holds the build lock while it runs', async () => {
    const f = fixture();
    const lock = path.join(f.root, 'build.lock');
    await run(f, async () => {
      await expect(withBuildLock('@abuddy/other', () => 'never', lock)).rejects.toThrow(/another package build holds/);
    });
    expect(fs.existsSync(lock)).toBe(false);
  });
});

describe('the build lock', () => {
  const lockFile = () => path.join(tempDir(), 'packages-build.lock');

  it('refuses a second build while one holds it', async () => {
    const file = lockFile();
    await withBuildLock('@abuddy/sdk', async () => {
      await expect(withBuildLock('@abuddy/ui', () => 'never', file)).rejects.toThrow(/another package build holds/);
    }, file);
  });

  it('waits for a live holder when the build is a freshness fix, where a command fails at once', async () => {
    const file = lockFile();
    // This process is the holder, so it is alive for certain and the test cannot race its exit
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ pid: process.pid, label: '@abuddy/other', startedAt: new Date().toISOString() }));

    const started = Date.now();
    await expect(withBuildLock('@abuddy/sdk', () => 'never', file, { intent: 'command' })).rejects.toThrow(/another package build holds/);
    expect(Date.now() - started, 'a command waited instead of failing at once').toBeLessThan(500);

    // The wait is bounded, and says it waited — a holder that never goes is reported, not waited on forever
    const waited = Date.now();
    await expect(withBuildLock('@abuddy/sdk', () => 'never', file, { intent: 'freshness', timeoutMs: 1_000 }))
      .rejects.toThrow(/after waiting 1s/);
    expect(Date.now() - waited, 'a freshness fix gave up without waiting').toBeGreaterThanOrEqual(900);
  }, 30_000);

  it('names the holder', async () => {
    const file = lockFile();
    await withBuildLock('@abuddy/sdk', async () => {
      await expect(withBuildLock('@abuddy/ui', () => 'never', file)).rejects.toThrow(new RegExp(`pid ${process.pid}.*@abuddy/sdk`));
    }, file);
  });

  it('releases it afterwards, including when the build throws', async () => {
    const file = lockFile();
    await expect(withBuildLock('@abuddy/sdk', () => { throw new Error('build failed'); }, file)).rejects.toThrow('build failed');
    expect(fs.existsSync(file)).toBe(false);
    await expect(withBuildLock('@abuddy/ui', () => 'ok', file)).resolves.toBe('ok');
  });

  it('takes over a lock whose process is gone — a killed build must not block the next one', async () => {
    const file = lockFile();
    const dead = spawnSync(process.execPath, ['-e', '']).pid;
    fs.writeFileSync(file, JSON.stringify({ pid: dead, label: '@abuddy/sdk', startedAt: new Date().toISOString() }));
    await expect(withBuildLock('@abuddy/ui', () => 'ok', file)).resolves.toBe('ok');
  });

  it('leaves a lock it no longer owns alone', async () => {
    const file = lockFile();
    const other = JSON.stringify({ pid: process.pid + 1, label: '@abuddy/ui', startedAt: new Date().toISOString() });
    await withBuildLock('@abuddy/sdk', () => fs.writeFileSync(file, other), file);
    expect(fs.readFileSync(file, 'utf-8')).toBe(other);
  });
});
