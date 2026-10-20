// The lookups the backend's and the renderer's registries both keep of what registered packs contributed, each
// owned by the registry that creates it (createPackRegistry, createFePackRegistry)
import { splitRef, type FeatureRef } from '@apackdev/sdk/ids';

/** One active pack owns a step wire; candidate tables are rebuilt for each registry change. */
export function createOwnedStepStore<V>() {
  const values = new Map<string, V>();
  const owners = new Map<string, string>();
  return {
    set(type: string, value: V, owner: string): void {
      const previous = owners.get(type);
      if (previous !== undefined) throw new Error(`Step "${type}" is already owned by pack "${previous}"; pack "${owner}" cannot register it again`);
      owners.set(type, owner);
      values.set(type, value);
    },
    get: (type: string): V | undefined => values.get(type),
    all: (): V[] => [...values.values()],
    entries: (): ReadonlyMap<string, V> => values,
  };
}

/** Role → id of the system or plugin that plays it; one feature plays a role, so a taken role is refused */
export function createDesignationStore() {
  const roles = new Map<string, FeatureRef>();
  return {
    /** Registers every role or none: throws naming both packs when one is already played */
    register(designations: Record<string, FeatureRef>): void {
      for (const [role, ref] of Object.entries(designations)) {
        const held = roles.get(role);
        if (held) throw new Error(`Designation collision: role "${role}" — pack "${splitRef(ref)?.packId}" vs "${splitRef(held)?.packId}"`);
      }
      for (const [role, ref] of Object.entries(designations)) roles.set(role, ref);
    },
    get: (role: string): FeatureRef | undefined => roles.get(role),
    has: (role: string): boolean => roles.has(role),
  };
}
