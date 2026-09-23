import type { SettingsService } from '../services/settings.ts';
// The runtime a pack's unit tests run against: the EARS engine in memory, without the app.
// @abuddy/testing's harness drives it; it lives in the SDK so tests share the pack's SDK instance
// (its query, repository and seed-hook registries) instead of a copy.
import { createEarsEngine, installEngine, type EarsEngine } from '@abuddy/ears';
import type { SeedHooks } from '../seed/hooks.ts';
import { SDK_ENTITIES } from '../types/sdk-entities.ts';
import type { EARS } from '../types/entities.ts';
import type { PackRegistryView } from '../runtime/packs-view.ts';
import { _isHostBound } from '../runtime/host-runtime.ts';
import { testPacks } from './packs.ts';
import { bindTestRuntime, resetTestHostState, type TestOnboarding } from './host.ts';

export { testRootEvents, takeSystemErrors, addTestSecret, type TestRootEvents, type TestOnboarding } from './host.ts';
export { testPacks, type TestPacks } from './packs.ts';
export { fakeInference, type FakeInference, type FakeInferenceCall, type FakeInferenceReplies, type FakeInferenceReply, type FakeTextCall } from './fake-inference.ts';
// A pack's own tests bind a frontend host for the file and forget it again; bindFeHost is the renderer's,
// bound once at boot, and its unbind is host-only
export { startFeTestRuntime, stopFeTestRuntime, type FeTestRuntimeOptions } from './fe-runtime.ts';
export { fakeSettings, type FakeSettings, type FakeSettingsUpdate } from './fake-settings.ts';

/**
 * What a pack's seeding needs outside the app: its entity types and relation kinds, its repositories
 * and its seed hooks. `abuddy generate-entries` writes it as `seedRuntime` in
 * `src/__generated__/seed-runtime.ts`; `abuddy build` bundles it into `build/seed-runtime.mjs` for
 * packs that depend on this one.
 */
export interface SeedRuntime {
  id: string;
  entities: Record<string, string>;
  relKinds: Record<string, string>;
  repositories: Record<string, unknown>;
  seedHooks: Record<string, SeedHooks>;
}

/** What `startTestRuntime` starts the in-memory app with */
export interface TestRuntimeStartOptions {
  /** Entity types beyond the SDK's; later calls add theirs */
  entityTypes?: readonly string[];
  /**
   * The registered packs the SDK's lookups read (the harness passes the registry it creates), under `testPacks`, which
   * tests fill directly; none by default. First call only
   */
  packs?: PackRegistryView;
  /** What `getAppVersion()` returns; `0.0.0-test` by default. First call only */
  appVersion?: string;
  /**
   * Where `appData.hasOnboarded` and `completeOnboarding` keep their state (the harness passes the host's app state);
   * in memory by default. First call only
   */
  onboarding?: TestOnboarding;
  /**
   * Backs `services.settings` (the harness passes the host's settings store, so a test writes settings the way the
   * app does); without one, reading or writing settings says to run on the harness. First call only
   */
  settings?: SettingsService;
}

const entityTypes = new Set<string>(Object.values(SDK_ENTITIES));
let started: Pick<TestRuntimeStartOptions, 'packs' | 'appVersion' | 'onboarding' | 'settings'> | undefined;
let engine: EarsEngine | undefined;

/** A new in-memory engine checking entity types against the test runtime's, and installed */
function installFreshEngine(repositories: Record<string, unknown> = {}): EarsEngine {
  engine = createEarsEngine({ isEntityType: (value: string) => entityTypes.has(value) });
  for (const [name, repo] of Object.entries(repositories)) engine.query.registerRepository(name, repo);
  installEngine(engine.query);
  return engine;
}

/** The test runtime's engine (both faces); throws before `startTestRuntime` */
function testEngine(): EarsEngine {
  if (!engine) throw new Error('No test engine: call startTestRuntime() from @abuddy/sdk/testing first');
  return engine;
}

/**
 * Starts the in-memory runtime: an EARS engine (created and installed) with the SDK's entity types plus `entityTypes`,
 * writes not persisted, and binds
 * an in-memory app (`bindHost`): `testRootEvents` as its bus (so `broadcastToPlugin`, `sendToSystem`, `onIncoming` and
 * log events go there; its log events are printed and its SYSTEM_ERROR events recorded for `takeSystemErrors`),
 * `testPacks` over `packs`, `appVersion`, an `appData` that resets the database and keeps onboarding in `onboarding`, a trace store
 * over it, `secrets` in memory, and an `inference` that fails until a test mocks it. Safe to call again; entity types
 * accumulate, and `packs`, `appVersion` and `onboarding` must be given on the first call.
 */
export function startTestRuntime(options: TestRuntimeStartOptions = {}): void {
  for (const type of options.entityTypes ?? []) entityTypes.add(type);
  if (started) {
    for (const key of ['packs', 'appVersion', 'onboarding'] as const) {
      if (options[key] !== undefined && options[key] !== started[key]) {
        throw new Error(`startTestRuntime already bound the test app without this ${key}: pass ${key} on its first call`);
      }
    }
    // Still bound: nothing to start. Unbound since (a test unbound the host): bound again, as first started
    if (_isHostBound()) return;
  } else {
    started = { packs: options.packs, appVersion: options.appVersion, onboarding: options.onboarding, settings: options.settings };
  }
  installFreshEngine();
  bindTestRuntime({ engine: testEngine, resetData: resetTestData, ...started });
}

/** Registers a pack's seed runtime: its entity types, its repositories (with the engine) and its seed hooks (in `testPacks`) */
export function registerSeedRuntime(runtime: SeedRuntime): void {
  startTestRuntime({ entityTypes: Object.values(runtime.entities) });
  for (const [name, repo] of Object.entries(runtime.repositories)) testEngine().query.registerRepository(name, repo);
  for (const [entity, hooks] of Object.entries(runtime.seedHooks)) testPacks.seedHooks.set(entity, hooks);
}

/**
 * Replaces the in-memory database with a fresh engine (keeping the registered repositories), and empties the
 * stored keys and the onboarding state (registrations stay)
 */
export function resetTestData(): void {
  installFreshEngine(testEngine().admin.repositories());
  resetTestHostState();
}

/** Every entity id in the in-memory database, relation rows included */
export function entityIds(): EARS.EntityId[] {
  return testEngine().query.getAllEntities();
}

/** Removes an attribute from a row, as data written before the attribute existed would lack it */
export function dropAttribute(id: EARS.EntityId, kind: string): void {
  testEngine().admin.dropAttr(id, kind as EARS.AttrKind);
}
