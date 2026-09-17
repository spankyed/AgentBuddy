// The lookups the backend's and the renderer's registries both keep of what registered packs contributed, each
// owned by the registry that creates it (createPackRegistry, createFePackRegistry)
import { mergeStepDefinitions, type StepDefinition } from '@abuddy/sdk/steps';

/** Definitions by type: a later registration of a type replaces the earlier one, or, with `merge`, combines with it */
export function createDefinitionStore<T extends { type: string }>(merge: (existing: T, def: T) => T = (_, def) => def) {
  const byType = new Map<string, T>();
  return {
    register(def: T): void {
      const existing = byType.get(def.type);
      byType.set(def.type, existing ? merge(existing, def) : def);
    },
    unregister(type: string): void {
      byType.delete(type);
    },
    get: (type: string): T | undefined => byType.get(type),
    all: (): T[] => [...byType.values()],
  };
}

/** Step definitions, a type's build, runtime and frontend facets combining across registrations */
export function createStepStore() {
  return createDefinitionStore<StepDefinition>(mergeStepDefinitions);
}

/** Role → id of the system or plugin that plays it */
export function createDesignationStore() {
  const roles = new Map<string, string>();
  return {
    register(designations: Record<string, string>): void {
      for (const [role, id] of Object.entries(designations)) roles.set(role, id);
    },
    unregister(designations: Record<string, string>): void {
      for (const role of Object.keys(designations)) roles.delete(role);
    },
    get: (role: string): string | undefined => roles.get(role),
    has: (role: string): boolean => roles.has(role),
  };
}
