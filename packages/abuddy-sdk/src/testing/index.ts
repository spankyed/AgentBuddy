// The runtime a pack's unit tests run against: the EARS engine in memory, without the app.
// @abuddy/testing's harness drives it; it lives in the SDK so tests share the pack's SDK instance
// (its query, repository and seed-hook registries) instead of a copy.
import { initEARSRuntime } from '../ears/runtime.ts';
import { clearMemory, dropAttr, getAllEntities } from '../ears/attribute-storage.ts';
import { registerRepository } from '../ears/repository.ts';
import { seedHookRegistry, type SeedHooks } from '../seed/hooks.ts';
import { SDK_ENTITIES } from '../types/sdk-entities.ts';
import type { EARS } from '../types/entities.ts';
import { registerTestHostModules } from './host.ts';

export { testRootEvents, takeSystemErrors, type TestRootEvents } from './host.ts';
export { fakeInference, type FakeInference, type FakeInferenceCall, type FakeInferenceReply } from './fake-inference.ts';

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

const entityTypes = new Set<string>(Object.values(SDK_ENTITIES));
let started = false;

/**
 * Starts the in-memory runtime: EARS with the SDK's entity types plus `entityTypes`, writes not
 * persisted, and in-memory host modules for what systems, services and steps reach (a console logger,
 * `rootEvents` and `sendToPlugin`/`sendToSystem` on `testRootEvents`, recorded system errors, a test
 * version, no-op migrations, `appData` that resets the database, a trace store over it, and an
 * `inference` that fails until a test mocks it), each unless the host registered its own. Safe to call again; entity types accumulate.
 */
export function startTestRuntime(options: { entityTypes?: readonly string[] } = {}): void {
  for (const type of options.entityTypes ?? []) entityTypes.add(type);
  if (started) return;
  started = true;
  initEARSRuntime({ isEntityType: (value: string) => entityTypes.has(value) });
  registerTestHostModules(resetTestData);
}

/** Registers a pack's seed runtime: its entity types, repositories and seed hooks */
export function registerSeedRuntime(runtime: SeedRuntime): void {
  startTestRuntime({ entityTypes: Object.values(runtime.entities) });
  for (const [name, repo] of Object.entries(runtime.repositories)) registerRepository(name, repo);
  for (const [entity, hooks] of Object.entries(runtime.seedHooks)) seedHookRegistry.register(entity, hooks, runtime.id);
}

/** Empties the in-memory database (registrations stay) */
export function resetTestData(): void {
  clearMemory();
}

/** Every entity id in the in-memory database, relation rows included */
export function entityIds(): EARS.EntityId[] {
  return getAllEntities();
}

/** Removes an attribute from a row, as data written before the attribute existed would lack it */
export function dropAttribute(id: EARS.EntityId, kind: string): void {
  dropAttr(id, kind as EARS.AttrKind);
}
