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
/** Packages whose modules pack code can require at runtime: the SDK, and host modules built-in packs use. */
const PACKAGE_DIRS: Record<string, string> = {
  '@abuddy/sdk': path.join(REPO_ROOT, 'packages', 'abuddy-sdk'),
  '@abuddy/host': path.join(REPO_ROOT, 'packages', 'abuddy-host'),
};
const DEV_ENTRY = path.join(REPO_ROOT, 'packages', 'default-setup', 'dist', 'dev-entry.cjs');

/**
 * Subpaths that can't fail when an unbridged copy loads under plain Node:
 * zero imports and no module-level state. The leaf test below proves it, so an
 * import added later fails CI instead of silently breaking pack loading.
 */
const UNBRIDGED_LEAVES = new Map<string, string>([
  ['@abuddy/sdk/cron', 'self-contained leaf, no imports, no state'],
  ['@abuddy/sdk/utils/compare-versions', 'self-contained leaf, no imports, no state'],
]);

/**
 * Subpaths unbridged by policy: pack runtime code never requires them. These
 * CAN fail under plain Node (relative imports), so their safety rests on the policy
 * holding — the dev-entry test checks the built pack never requires them.
 */
const UNBRIDGED_BY_POLICY = new Map<string, string>([
  // Seed DSL. Inlined into action function-body strings by esbuild at compile
  // time (see INLINABLE_PACKAGE_IMPORTS in sdk build/compile-utils.ts); the
  // sandbox that runs those strings has no module loader at all.
  ['@abuddy/sdk/actions', 'compile-time only — inlined into seed strings'],
  // The engine's host hook; built-in packs reach it through @abuddy/host/ears, which is bridged.
  ['@abuddy/sdk/ears/internals', 're-exported by the bridged @abuddy/host/ears'],
  // Build-time only: consumed by vite configs and the abuddy CLI, never by a
  // loaded pack's runtime code.
  ['@abuddy/host/build/shared-deps', 'build-time only'],
  ['@abuddy/host/build/discover', 'build-time only'],
  // Metadata: tooling reads them, code never requires them.
  ['@abuddy/sdk/package.json', 'package metadata, not code'],
  ['@abuddy/sdk/abuddy.schema.json', 'manifest JSON schema, not code'],
]);

const UNBRIDGED_BY_DESIGN = new Map([...UNBRIDGED_LEAVES, ...UNBRIDGED_BY_POLICY]);

/** Renderer-only subpaths reach pack FE code through Vite + window.__abuddy, never the CJS bridge. */
function isFeSpecifier(s: string): boolean {
  return /^@abuddy\/(sdk|host)\/fe(\/|$)/.test(s);
}

function exportsMap(pkg: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(PACKAGE_DIRS[pkg], 'package.json'), 'utf8')).exports;
}

/** The source file an export resolves to in the monorepo. */
function sourceOf(pkg: string, key: string): string {
  const target = exportsMap(pkg)[key];
  const file = typeof target === 'string' ? target : (target as Record<string, string>)['@abuddy/source'];
  return path.join(PACKAGE_DIRS[pkg], file);
}

function toSpecifier(pkg: string, key: string): string {
  return key === '.' ? pkg : `${pkg}/${key.slice(2)}`;
}

function allExports(): string[] {
  return Object.keys(PACKAGE_DIRS).flatMap((pkg) => Object.keys(exportsMap(pkg)).map((key) => toSpecifier(pkg, key)));
}

function concreteExports(): string[] {
  return allExports()
    // Wildcards can't be enumerated; the test below keeps them renderer-only
    .filter((s) => !s.includes('*'))
    .filter((s) => !isFeSpecifier(s));
}

describe('SDK bridge drift', () => {
  it('only has wildcard exports for renderer-only subpaths', () => {
    const nonFeWildcards = allExports().filter((s) => s.includes('*') && !isFeSpecifier(s));

    expect(nonFeWildcards, [
      'Wildcard exports outside ./fe/* can reach pack runtime code, but this guard',
      "can't enumerate them to check the bridge. Export each subpath explicitly instead.",
    ].join(' ')).toEqual([]);
  });

  it('bridges every non-fe export, or records why not', () => {
    const bridged = new Set(getBridgedSdkSpecifiers());
    const unaccounted = concreteExports().filter(
      (s) => !bridged.has(s) && !UNBRIDGED_BY_DESIGN.has(s),
    );

    expect(unaccounted, [
      'These @abuddy/sdk or @abuddy/host exports are neither bridged nor listed as',
      'unbridged-by-design. If pack code can require it at runtime, add it to',
      'SDK_BRIDGE in packages/api/src/packs/pack-loader.ts. If it cannot, add',
      'it to UNBRIDGED_BY_DESIGN in this file with the reason.',
    ].join(' ')).toEqual([]);
  });

  it('has no bridge entry for a specifier the packages no longer export', () => {
    const exported = new Set(concreteExports());
    const stale = getBridgedSdkSpecifiers().filter(
      (s) => !exported.has(s) && !isFeSpecifier(s),
    );

    expect(stale, 'SDK_BRIDGE references specifiers absent from the exports maps').toEqual([]);
  });

  // dist/ is gitignored, so this only runs after default-setup has been built. CI builds it
  // and sets REQUIRE_DEV_ENTRY, since the policy-only entries above rely on this check.
  it('bridges every SDK and host specifier the built dev entry actually imports', () => {
    if (!fs.existsSync(DEV_ENTRY)) {
      if (process.env.REQUIRE_DEV_ENTRY) throw new Error(`${DEV_ENTRY} is required (REQUIRE_DEV_ENTRY) but not built`);
      // eslint-disable-next-line no-console
      console.warn(`[sdk-bridge-drift] skipped: ${DEV_ENTRY} not built`);
      return;
    }

    const source = fs.readFileSync(DEV_ENTRY, 'utf8');
    const required = [...source.matchAll(/['"](@abuddy\/(?:sdk|host)(?:\/[a-zA-Z0-9._/-]+)?)['"]/g)]
      .map((m) => m[1]);
    expect(required.length, 'found no @abuddy/sdk specifiers — regex or bundle shape changed')
      .toBeGreaterThan(0);

    const bridged = new Set(getBridgedSdkSpecifiers());
    const missing = [...new Set(required)]
      .filter((s) => !isFeSpecifier(s) && !bridged.has(s) && !UNBRIDGED_LEAVES.has(s))
      .sort();

    expect(missing, 'dev-entry.cjs requires subpaths that are not bridged').toEqual([]);
  });

  it('has no unbridged-by-design entry for a specifier the packages no longer export', () => {
    const exported = new Set(allExports());
    const stale = [...UNBRIDGED_BY_DESIGN.keys()].filter((s) => !exported.has(s));
    expect(stale, 'UNBRIDGED_BY_DESIGN lists specifiers absent from the exports maps').toEqual([]);
  });

  it('keeps unbridged leaf modules free of imports', () => {
    const withImports = [...UNBRIDGED_LEAVES.keys()].filter((specifier) => {
      const pkg = Object.keys(PACKAGE_DIRS).find((p) => specifier === p || specifier.startsWith(`${p}/`))!;
      const key = specifier === pkg ? '.' : `./${specifier.slice(pkg.length + 1)}`;
      const source = fs.readFileSync(sourceOf(pkg, key), 'utf8');
      return /^\s*import\s|^\s*export\s[^\n]*\sfrom\s|\brequire\(|\bimport\(/m.test(source);
    });
    expect(withImports, 'These leaves gained imports; bridge them in SDK_BRIDGE and move them out of UNBRIDGED_LEAVES').toEqual([]);
  });
});
