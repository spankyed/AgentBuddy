import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { getBridgedSdkSpecifiers } from '../../../src/packs/runtime/bridge.ts';
import { APP_UNBRIDGED, renderSharedModules } from '../../../src/build/render-sdk-modules.ts';
import { APP_ONLY_EXPORTS, SHARED_INSTANCE_PACKAGES, sharedInstanceExports } from '../../../src/build/shared-deps.ts';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
/**
 * Packages whose exports the bridge must account for: the shared-instance packages, which pack code requires,
 * and the host, which it never does. Derived from the list that decides the first group rather than spelled
 * beside it — a fourth shared package would otherwise be checked by nothing here, in the spec that exists to
 * notice exactly that kind of gap.
 */
const ACCOUNTED_FOR: readonly string[] = [...SHARED_INSTANCE_PACKAGES, '@abuddy/host'];
const SDK_MODULES_FILE = path.join(REPO_ROOT, 'packages', 'abuddy-host', 'src', 'packs', 'runtime', 'sdk-modules.ts');
const RUNTIME_ENTRY = path.join(REPO_ROOT, 'packages', 'default-setup', 'dist', 'runtime', 'index.cjs');

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
  // The app's settings store: one row with one writer, reached by packs through `services.settings`. A pack
  // loading the store would be a second writer, past the checks and the listeners the first one tells.
  ['@abuddy/host/settings', 'host-only — packs reach the settings through services.settings, which is the one writer'],
  // The key vault: the OS credential store, or a file when there is none. Values reach the backend only
  // through the API's secrets procedures and never over the bus, so a pack that could open the vault would
  // read every key the user has stored. Published as a subpath so the api's spec can mock it by specifier
  // rather than by a path into this package's src/ (`repo-checks/tests/spec-placement.spec.ts`).
  ['@abuddy/host/secrets/vault', 'host-only — a pack that could open the vault would read every stored key'],
  // Build-time only: consumed by vite configs and the abuddy CLI, never by a
  // loaded pack's runtime code.
  ['@abuddy/host/build/shared-deps', 'build-time only'],
  ['@abuddy/host/build/discover', 'build-time only'],
  ['@abuddy/host/build/source-resolution', 'host tooling only (CLI, fixture, API boot)'],
  ['@abuddy/host/build/published-manifest', 'build-time only: what a published tarball may say, for the scripts that stage it and the specs that check it'],
  ['@abuddy/host/build/specifiers', 'build-time only: what a module specifier names, for the scripts that pack the published packages and the packages that check them'],
  ['@abuddy/host/build/subpath-imports', "build-time only: a pack's package.json `imports`, read by the rule "
    + 'below and by the pack rules abuddy build runs'],
  ['@abuddy/host/build/own-module-specifiers', "build-time only: the rule that a pack's own-module specifier "
    + 'names the file that is there, applied by check:specifiers here and by abuddy build to every other pack'],
  ['@abuddy/host/build/packages-built', 'checkout build tooling: the freshness rule behind npm run packages:ensure'],
  // Test machinery: what a spec asserted over, confirmed to be there. It throws rather than asserting, so it
  // needs no test framework — which is also why it must not reach a pack, whose code has no business
  // refusing on the size of something it read.
  // Test machinery, in a runtime package deliberately: these resolve from source, cost nothing to publish
  // (host is private) and are reachable by every spec that builds a pack. @abuddy/testing would not do —
  // it resolves dist, so a rebuild per edit, and the layer rule refuses it in @abuddy/sdk and /ears exactly
  // as it refuses this. Move them to an @app/* package the day a spec in @abuddy/sdk, /ears, /ui or
  // default-setup needs one: the layer rule polices @abuddy/* only, so that is the one home they can reach.
  ['@abuddy/host/testing/population', 'test machinery: the subject guard specs call before asserting over a walk'],
  ['@abuddy/host/testing/pack-fixture', 'test machinery: a complete pack on disk, for specs about the rules that read one'],
  // What a running process published and whether it is still there: the app's own plumbing, which is why
  // it moved out of @abuddy/sdk/env. A pack reaches a running API through the app, never by reading its
  // port file.
  ['@abuddy/host/process-liveness', 'app plumbing: the locks, staging dirs and port file the app itself writes'],
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
  ['@abuddy/host/features', "the app's own features (the pack `host`), registered by the API and the harness"],
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
  // One writer at a time for a file the app and its tooling share: the CLI's codegen and `abuddy db` take it, and
  // the API's boot checks it. Pack code has nothing of the app's to serialise, so it never requires this.
  ['@abuddy/host/exclusive-lock', "the app's single-writer file locks, taken by the host and the CLI"],
  // The app's log files: Electron main and the API append to them; a pack logs through createLogger, which
  // reaches the same files as a log event, redacted and capped like everything else the app writes
  ['@abuddy/host/logs', "the app's log files, appended to by main and the API"],
  // Metadata: tooling reads them, code never requires them.
  ['@abuddy/sdk/package.json', 'package metadata, not code'],
  ['@abuddy/ears/package.json', 'package metadata, not code'],
  ['@abuddy/sdk/abuddy.schema.json', 'manifest JSON schema, not code'],
]);

const UNBRIDGED_BY_DESIGN = new Map(UNBRIDGED_BY_POLICY);

/** Renderer-only subpaths reach pack FE code through Vite + window.__abuddy, never the CJS bridge. */
function isFeSpecifier(s: string): boolean {
  return /^@abuddy\/(sdk|ears|host)\/fe(\/|$)/.test(s);
}

function exportsMap(pkg: string): Record<string, unknown> {
  // The shared-instance packages resolve their own manifest by specifier, which is how every other consumer
  // of their exports map reads it. The host is private and exports no `./package.json`, so nothing can
  // resolve it that way and its manifest is read from the tree — the one package here that differs.
  if (pkg === '@abuddy/host') {
    return (JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'packages', 'abuddy-host', 'package.json'), 'utf8')) as
      { exports: Record<string, unknown> }).exports;
  }
  return sharedInstanceExports(pkg, import.meta.filename);
}


function toSpecifier(pkg: string, key: string): string {
  return key === '.' ? pkg : `${pkg}/${key.slice(2)}`;
}

function allExports(): string[] {
  return ACCOUNTED_FOR.flatMap((pkg) => Object.keys(exportsMap(pkg)).map((key) => toSpecifier(pkg, key)));
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

  it('has an up-to-date sdk-modules.ts', () => {
    expect(fs.readFileSync(SDK_MODULES_FILE, 'utf8'), 'Run npm run sdk-modules:update -w @abuddy/host')
      .toBe(renderSharedModules(SDK_MODULES_FILE));
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
      .filter((s) => !isFeSpecifier(s) && !bridged.has(s))
      .sort();

    expect(missing, 'the built runtime requires subpaths that are not bridged').toEqual([]);
  });

  it('has no unbridged-by-design entry for a specifier the packages no longer export', () => {
    const exported = new Set(allExports());
    const stale = [...UNBRIDGED_BY_DESIGN.keys()].filter((s) => !exported.has(s));
    expect(stale, 'UNBRIDGED_BY_DESIGN lists specifiers absent from the exports maps').toEqual([]);
  });

});
