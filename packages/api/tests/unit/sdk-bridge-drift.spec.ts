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
 * SDK subpaths that can't fail when an unbridged copy loads under plain Node:
 * zero imports and no module-level state. The leaf test below proves it, so an
 * import added later fails CI instead of silently breaking pack loading.
 */
const UNBRIDGED_LEAVES = new Map<string, string>([
  ['@abuddy/sdk/cron', 'self-contained leaf, no imports, no state'],
  ['@abuddy/sdk/utils/compare-versions', 'self-contained leaf, no imports, no state'],
]);

/**
 * SDK subpaths unbridged by policy: pack runtime code never requires them. These
 * CAN fail under plain Node (relative imports), so their safety rests on the policy
 * holding — the dev-entry test checks the built pack never requires them.
 */
const UNBRIDGED_BY_POLICY = new Map<string, string>([
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
  // Metadata: tooling reads the SDK version from it, code never requires it.
  ['@abuddy/sdk/package.json', 'package metadata, not code'],
]);

const UNBRIDGED_BY_DESIGN = new Map([...UNBRIDGED_LEAVES, ...UNBRIDGED_BY_POLICY]);

/** Renderer-only subpaths reach pack FE code through Vite + window.__abuddy, never the CJS bridge. */
function isFeSpecifier(s: string): boolean {
  return s === '@abuddy/sdk/fe' || s.startsWith('@abuddy/sdk/fe/');
}

function sdkExportsMap(): Record<string, string> {
  return JSON.parse(fs.readFileSync(SDK_PKG_JSON, 'utf8')).exports;
}

function toSpecifier(key: string): string {
  return key === '.' ? '@abuddy/sdk' : `@abuddy/sdk/${key.slice(2)}`;
}

function concreteSdkExports(): string[] {
  return Object.keys(sdkExportsMap())
    // Wildcards can't be enumerated; the test below keeps them renderer-only
    .filter((k) => !k.includes('*'))
    .map(toSpecifier)
    .filter((s) => !isFeSpecifier(s));
}

describe('SDK bridge drift', () => {
  it('only has wildcard exports for renderer-only subpaths', () => {
    const nonFeWildcards = Object.keys(sdkExportsMap())
      .filter((k) => k.includes('*'))
      .filter((k) => !isFeSpecifier(toSpecifier(k)));

    expect(nonFeWildcards, [
      'Wildcard @abuddy/sdk exports outside ./fe/* can reach pack runtime code, but this guard',
      "can't enumerate them to check the bridge. Export each subpath explicitly instead.",
    ].join(' ')).toEqual([]);
  });

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
      (s) => !exported.has(s) && !isFeSpecifier(s),
    );

    expect(stale, 'SDK_BRIDGE references specifiers absent from the SDK exports map').toEqual([]);
  });

  // dist/ is gitignored, so this only runs after default-setup has been built. CI builds it
  // and sets REQUIRE_DEV_ENTRY, since the policy-only entries above rely on this check.
  it('bridges every SDK specifier the built dev entry actually imports', () => {
    if (!fs.existsSync(DEV_ENTRY)) {
      if (process.env.REQUIRE_DEV_ENTRY) throw new Error(`${DEV_ENTRY} is required (REQUIRE_DEV_ENTRY) but not built`);
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
      .filter((s) => !isFeSpecifier(s) && !bridged.has(s) && !UNBRIDGED_LEAVES.has(s))
      .sort();

    expect(missing, 'dev-entry.cjs requires SDK subpaths that are not bridged').toEqual([]);
  });

  it('has no unbridged-by-design entry for a specifier the SDK no longer exports', () => {
    const exported = new Set(Object.keys(sdkExportsMap()).map(toSpecifier));
    const stale = [...UNBRIDGED_BY_DESIGN.keys()].filter((s) => !exported.has(s));
    expect(stale, 'UNBRIDGED_BY_DESIGN lists specifiers absent from the SDK exports map').toEqual([]);
  });

  it('keeps unbridged leaf modules free of imports', () => {
    const exportsMap = sdkExportsMap();
    const withImports = [...UNBRIDGED_LEAVES.keys()].filter((specifier) => {
      const key = specifier === '@abuddy/sdk' ? '.' : `./${specifier.slice('@abuddy/sdk/'.length)}`;
      const source = fs.readFileSync(path.join(path.dirname(SDK_PKG_JSON), exportsMap[key]), 'utf8');
      return /^\s*import\s|^\s*export\s[^\n]*\sfrom\s|\brequire\(|\bimport\(/m.test(source);
    });
    expect(withImports, 'These leaves gained imports; bridge them in SDK_BRIDGE and move them out of UNBRIDGED_LEAVES').toEqual([]);
  });
});
