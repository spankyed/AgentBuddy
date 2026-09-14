// The runtime a pack's unit tests run against: the EARS engine in memory, without the app.
// @abuddy/testing's harness drives it; it lives in the SDK so tests share the pack's SDK instance
// (its query, repository and seed-hook registries) instead of a copy.
import { initEARSRuntime, type Logger } from '../ears/runtime.ts';
import { clearMemory } from '../ears/attribute-storage.ts';
import { registerRepository } from '../ears/repository.ts';
import { registerHostModule, getHostModule } from '../runtime/host.ts';
import { seedHookRegistry, type SeedHooks } from '../seed/hooks.ts';
import { SDK_ENTITIES } from '../types/sdk-entities.ts';

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

function hostModuleRegistered(key: string): boolean {
  try {
    getHostModule(key);
    return true;
  } catch {
    return false;
  }
}

function consoleLogger(source?: string): Logger {
  const prefix = source ? `[${source}]` : '[test]';
  return {
    debug: (...args: unknown[]) => console.debug(prefix, ...args),
    info: (...args: unknown[]) => console.info(prefix, ...args),
    warn: (...args: unknown[]) => console.warn(prefix, ...args),
    error: (...args: unknown[]) => console.error(prefix, ...args),
  };
}

/**
 * Starts the in-memory EARS runtime: entity types are the SDK's plus `entityTypes`, writes aren't
 * persisted, and a console logger backs `createLogger` unless the host registered one. Safe to call
 * again; entity types accumulate.
 */
export function startTestRuntime(options: { entityTypes?: readonly string[] } = {}): void {
  for (const type of options.entityTypes ?? []) entityTypes.add(type);
  if (started) return;
  started = true;
  initEARSRuntime({ isEntityType: (value: string) => entityTypes.has(value) });
  if (!hostModuleRegistered('logger')) registerHostModule('logger', { createLogger: consoleLogger });
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
