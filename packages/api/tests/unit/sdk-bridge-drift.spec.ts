import { vi } from 'vitest';
import { registerHostModule } from '@abuddy/sdk/runtime';

vi.mock('virtual:built-in-pack-loaders', () => ({
  default: {},
}));

const noop = () => {};
const noopLogger = { debug: noop, info: noop, warn: noop, error: noop };
registerHostModule('logger', {
  createLogger: () => noopLogger,
  LogEvent: {},
});

import * as fs from 'fs';
import * as path from 'path';
import { getBridgedSdkSpecifiers } from '@/packs/pack-loader';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const SDK_PKG_JSON = path.join(REPO_ROOT, 'packages', 'abuddy-sdk', 'package.json');
const DEV_ENTRY = path.join(REPO_ROOT, 'packages', 'default-setup', 'dist', 'dev-entry.cjs');

/**
 * SDK subpaths deliberately NOT bridged, with the reason each is safe.
 *
 * Adding an entry here is a conscious decision that pack code will never
 * `require()` the subpath at runtime — or that the module is self-contained
 * enough to survive Node's type-stripping on its own.
 */
const UNBRIDGED_BY_DESIGN = new Map<string, string>([
  // Seed DSL. Inlined into action function-body strings by esbuild at compile
  // time (see INLINABLE_PACKAGE_IMPORTS in sdk build/compile-utils.ts); the
  // sandbox that runs those strings has no module loader at all.
  ['@abuddy/sdk/actions', 'compile-time only — inlined into seed strings'],

  // Build-time only: consumed by vite configs and the abuddy CLI, never by a
  // loaded pack's runtime code.
  ['@abuddy/sdk/build/shared-deps', 'build-time only'],
  ['@abuddy/sdk/build/discover', 'build-time only'],

  // Test-only, and pulls playwright — must never enter the api bundle.
  ['@abuddy/sdk/testing', 'test-only; would drag playwright into the bundle'],

  // Zero-import leaf modules. Nothing relative to resolve, no module-level
  // state, so an unbridged duplicate is both loadable and harmless.
  // If either ever gains an import, bridge it.
  ['@abuddy/sdk/cron', 'self-contained leaf, no imports, no state'],
  ['@abuddy/sdk/utils/compare-versions', 'self-contained leaf, no imports, no state'],
]);

function concreteSdkExports(): string[] {
  const pkg = JSON.parse(fs.readFileSync(SDK_PKG_JSON, 'utf8'));
  return Object.keys(pkg.exports)
    .filter((k) => !k.includes('*'))
    .map((k) => (k === '.' ? '@abuddy/sdk' : `@abuddy/sdk/${k.slice(2)}`))
    // Renderer-only. These reach pack FE code through Vite + hostDepsPlugin
    // and window.__abuddy, never through the CJS require bridge.
    .filter((s) => !s.startsWith('@abuddy/sdk/fe'));
}

describe('SDK bridge drift', () => {
  it('bridges every non-fe SDK export, or records why not', () => {
    const bridged = new Set(getBridgedSdkSpecifiers());
    const unaccounted = concreteSdkExports().filter(
      (s) => !bridged.has(s) && !UNBRIDGED_BY_DESIGN.has(s),
    );

    expect(unaccounted, [
      'These @abuddy/sdk exports are neither bridged nor listed as',
      'unbridged-by-design. If pack code can require it at runtime, add it to',
      'SDK_BRIDGE in packages/api/src/packs/pack-loader.ts. If it cannot, add',
      'it to UNBRIDGED_BY_DESIGN in this file with the reason.',
    ].join(' ')).toEqual([]);
  });

  it('has no bridge entry for a specifier the SDK no longer exports', () => {
    const exported = new Set(concreteSdkExports());
    const stale = getBridgedSdkSpecifiers().filter(
      (s) => !exported.has(s) && !s.startsWith('@abuddy/sdk/fe'),
    );

    expect(stale, 'SDK_BRIDGE references specifiers absent from the SDK exports map').toEqual([]);
  });

  // dist/ is gitignored, so this only runs after default-setup has been built.
  // The export-map assertions above are the build-independent safety net.
  it('bridges every SDK specifier the built dev entry actually imports', () => {
    if (!fs.existsSync(DEV_ENTRY)) {
      // eslint-disable-next-line no-console
      console.warn(`[sdk-bridge-drift] skipped: ${DEV_ENTRY} not built`);
      return;
    }

    const source = fs.readFileSync(DEV_ENTRY, 'utf8');
    const required = [...source.matchAll(/['"](@abuddy\/sdk(?:\/[a-zA-Z0-9._/-]+)?)['"]/g)]
      .map((m) => m[1]);
    expect(required.length, 'found no @abuddy/sdk specifiers — regex or bundle shape changed')
      .toBeGreaterThan(0);

    const bridged = new Set(getBridgedSdkSpecifiers());
    const missing = [...new Set(required)]
      .filter((s) => !bridged.has(s) && !UNBRIDGED_BY_DESIGN.has(s))
      .sort();

    expect(missing, 'dev-entry.cjs requires SDK subpaths that are not bridged').toEqual([]);
  });
});
