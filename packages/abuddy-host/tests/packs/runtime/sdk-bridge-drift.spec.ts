import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { getBridgedSdkSpecifiers } from '../../../src/packs/runtime/bridge.ts';
import { APP_UNBRIDGED, renderSharedModules } from '../../../src/build/shared-modules.ts';
import { APP_ONLY_EXPORTS, SHARED_INSTANCE_PACKAGES } from '../../../src/build/shared-deps.ts';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
/** Packages whose exports the bridge must account for: the shared-instance packages, which pack code requires, and the host, which it never does */
const PACKAGE_DIRS: Record<string, string> = {
  '@abuddy/sdk': path.join(REPO_ROOT, 'packages', 'abuddy-sdk'),
  '@abuddy/ears': path.join(REPO_ROOT, 'packages', 'abuddy-ears'),
  '@abuddy/host': path.join(REPO_ROOT, 'packages', 'abuddy-host'),
};
const SHARED_MODULES_FILE = path.join(REPO_ROOT, 'packages', 'abuddy-host', 'src', 'packs', 'runtime', 'shared-modules.ts');
const RUNTIME_ENTRY = path.join(REPO_ROOT, 'packages', 'default-setup', 'dist', 'runtime', 'index.cjs');

/**
 * Subpaths that can't fail when an unbridged copy loads under plain Node:
 * zero imports and no module-level state. The leaf test below proves it, so an
 * import added later fails CI instead of silently breaking pack loading.
 */
const UNBRIDGED_LEAVES = new Map<string, string>([
  // None: an installed pack has no node_modules, so even leaf modules are bridged
]);

/**
 * Subpaths unbridged by policy: pack runtime code never requires them. These
 * CAN fail under plain Node (relative imports), so their safety rests on the policy
 * holding — the built-runtime test checks the built pack never requires them.
 */
const UNBRIDGED_BY_POLICY = new Map<string, string>([
  // Shared-instance exports the bridge leaves out (the Seed DSL, test tooling), with their reasons
  ...Object.entries(APP_UNBRIDGED),
  // Shared-instance exports only the app's composition root loads (the LMDB store)
  ...Object.entries(APP_ONLY_EXPORTS),
  // Redaction's host side: only the secrets store registers the values logs must mask, and a pack must not
  // The bound runtimes and unbinding: a pack could otherwise unbind the app or reach its raw services
  ['@abuddy/sdk/runtime/internals', 'host-only — a pack could otherwise unbind the app or take over its services'],
  // Build-time only: consumed by vite configs and the abuddy CLI, never by a
  // loaded pack's runtime code.
  ['@abuddy/host/build/shared-deps', 'build-time only'],
  ['@abuddy/host/build/discover', 'build-time only'],
  ['@abuddy/host/build/source-resolution', 'host tooling only (CLI, fixture, API boot)'],
  ['@abuddy/host/build/packages-built', 'checkout build tooling: the freshness rule behind npm run packages:ensure'],
  // The user's API keys with their values: only the API and host services use it, packs get services.secrets (no values)
  ['@abuddy/host/secrets', 'host store of API key values, never handed to packs'],
  // The app's HostRuntime, which the API binds; packs reach its services through services (appData, traceStore, inference, secrets)
  ['@abuddy/host/services', 'host implementations of SDK services, bound by the API'],
  // The app's migrations runners: the API's boot and appData.reset() run them; packs declare migrations, never run them
  ['@abuddy/host/migrations', 'the app migrations runners, run by the host'],
  // The app's own state (AppState): the host alone reads and writes it; packs learn of onboarding through services.appData
  ['@abuddy/host/app-state', "the app's state, read and written only by the host"],
  // The bus core: the API composes its bus from it, and the pack test harness runs it; packs don't require it
  ['@abuddy/host/bus', 'host bus core, composed by the API and the test harness'],
  // The pack runtime itself: the app loads packs with it; pack code never requires it
  ['@abuddy/host/packs/runtime', 'the pack loader and lifecycle, run by the app'],
  // Pack discovery, registration, install and bundles: the app and the CLI use them; packs never require them
  ['@abuddy/host/packs', 'installed packs, installer and pack layout, used by the app and the CLI'],
  // The app's database opened outside the app: the API's composition and abuddy db use it; packs get the engine the app installs
  ['@abuddy/host/database', "the app's database opened by the host and abuddy db"],
  // Backups: packs reach export and import through services.appData
  ['@abuddy/host/backup', 'host backups, reached by packs through services.appData'],
  // The abuddy dev server marker: the CLI writes it and Electron main's pack:// handler reads it; packs never require it
  ['@abuddy/host/packs/dev-server', 'dev server marker for the CLI and the pack:// handler'],
  // The app's log files: Electron main and the API append to them; a pack logs through createLogger, which
  // reaches the same files as a log event, redacted and capped like everything else the app writes
  ['@abuddy/host/logs', "the app's log files, appended to by main and the API"],
  // Metadata: tooling reads them, code never requires them.
  ['@abuddy/sdk/package.json', 'package metadata, not code'],
  ['@abuddy/ears/package.json', 'package metadata, not code'],
  ['@abuddy/sdk/abuddy.schema.json', 'manifest JSON schema, not code'],
]);

const UNBRIDGED_BY_DESIGN = new Map([...UNBRIDGED_LEAVES, ...UNBRIDGED_BY_POLICY]);

/** Renderer-only subpaths reach pack FE code through Vite + window.__abuddy, never the CJS bridge. */
function isFeSpecifier(s: string): boolean {
  return /^@abuddy\/(sdk|ears|host)\/fe(\/|$)/.test(s);
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
  it('bridges exactly the shared-instance packages', () => {
    const packages = new Set(getBridgedSdkSpecifiers().map((s) => s.split('/').slice(0, 2).join('/')));
    expect([...packages].sort()).toEqual([...SHARED_INSTANCE_PACKAGES].sort());
  });

  it('has an up-to-date shared-modules.ts', () => {
    expect(fs.readFileSync(SHARED_MODULES_FILE, 'utf8'), 'Run npm run shared-modules:update -w @abuddy/host')
      .toBe(renderSharedModules(SHARED_MODULES_FILE));
  });

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
      'These shared-instance or @abuddy/host exports are neither bridged nor listed as',
      'unbridged-by-design. If pack code can require it at runtime, add it to',
      'SDK_BRIDGE in packages/abuddy-host/src/packs/runtime/bridge.ts. If it cannot, add',
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
  // and sets REQUIRE_RUNTIME_ENTRY, since the policy-only entries above rely on this check.
  it('bridges every SDK and host specifier the built runtime actually imports', () => {
    if (!fs.existsSync(RUNTIME_ENTRY)) {
      if (process.env.REQUIRE_RUNTIME_ENTRY) throw new Error(`${RUNTIME_ENTRY} is required (REQUIRE_RUNTIME_ENTRY) but not built`);
      // eslint-disable-next-line no-console
      console.warn(`[sdk-bridge-drift] skipped: ${RUNTIME_ENTRY} not built`);
      return;
    }

    const source = fs.readFileSync(RUNTIME_ENTRY, 'utf8');
    const required = [...source.matchAll(/['"](@abuddy\/(?:sdk|ears|host)(?:\/[a-zA-Z0-9._/-]+)?)['"]/g)]
      .map((m) => m[1]);
    expect(required.length, 'found no @abuddy/sdk specifiers — regex or bundle shape changed')
      .toBeGreaterThan(0);

    const bridged = new Set(getBridgedSdkSpecifiers());
    const missing = [...new Set(required)]
      .filter((s) => !isFeSpecifier(s) && !bridged.has(s) && !UNBRIDGED_LEAVES.has(s))
      .sort();

    expect(missing, 'the built runtime requires subpaths that are not bridged').toEqual([]);
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
