// The lookups the backend's and the renderer's registries both keep of what registered packs contributed, each
// owned by the registry that creates it (createPackRegistry, createFePackRegistry)
import type { FeatureRef } from '@abuddy/sdk/ids';
import { _mergeStepDefinitions, type StepDefinition } from '@abuddy/sdk/steps';

/**
 * Values packs contribute per key, folded in registration order.
 *
 * Each contribution is kept with the pack that made it, so removing a pack re-folds what is left rather
 * than dropping the key. Two packs may hold one key between them — a step's build and frontend facets
 * routinely arrive from different packs, and an app-extension slot or a DSL type name is simply taken by
 * whoever registered last — so dropping the key when one of them unregisters takes the other's
 * contribution with it, until the app restarts. Reload is where that shows, being a teardown and a
 * registration.
 *
 * `fold` defaults to last-wins. Pass one that combines when a key is meant to be shared.
 */
export function createOwnedStore<V>(fold: (existing: V, next: V) => V = (_, next) => next) {
  /** Each key's contributions, in registration order: the resolved value is a fold over them */
  const contributions = new Map<string, Array<{ owner: string; value: V }>>();
  const resolved = new Map<string, V>();

  function refold(key: string): void {
    const held = contributions.get(key);
    if (!held?.length) {
      contributions.delete(key);
      resolved.delete(key);
      return;
    }
    resolved.set(key, held.map((c) => c.value).reduce((existing, value) => fold(existing, value)));
  }

  return {
    set(key: string, value: V, owner: string): void {
      contributions.set(key, [...(contributions.get(key) ?? []), { owner, value }]);
      refold(key);
    },
    remove(key: string, owner: string): void {
      const held = contributions.get(key);
      if (!held) return;
      contributions.set(key, held.filter((c) => c.owner !== owner));
      refold(key);
    },
    get: (key: string): V | undefined => resolved.get(key),
    all: (): V[] => [...resolved.values()],
    entries: (): ReadonlyMap<string, V> => resolved,
  };
}

/** Definitions by type, over `createOwnedStore`: a type's contributions fold with `merge`, last-wins by default */
export function createDefinitionStore<T extends { type: string }>(merge: (existing: T, def: T) => T = (_, def) => def) {
  const store = createOwnedStore<T>(merge);
  return {
    register: (def: T, owner: string): void => store.set(def.type, def, owner),
    unregister: (type: string, owner: string): void => store.remove(type, owner),
    get: store.get,
    all: store.all,
  };
}

/** Step definitions, a type's build, runtime and frontend facets combining across registrations */
export function createStepStore() {
  return createDefinitionStore<StepDefinition>(_mergeStepDefinitions);
}

/** Role → id of the system or plugin that plays it */
export function createDesignationStore() {
  const roles = new Map<string, FeatureRef>();
  return {
    register(designations: Record<string, FeatureRef>): void {
      for (const [role, id] of Object.entries(designations)) roles.set(role, id);
    },
    unregister(designations: Record<string, FeatureRef>): void {
      for (const role of Object.keys(designations)) roles.delete(role);
    },
    get: (role: string): FeatureRef | undefined => roles.get(role),
    has: (role: string): boolean => roles.has(role),
  };
}

/**
 * The way back out of a registration, collected as it happens.
 *
 * Both registries add a pack's contributions one at a time and have to take back exactly what got in — when
 * a later contribution throws, and again when the pack unregisters. Recording each undo where the thing is
 * added is what keeps those two honest: a new kind of contribution can't be added to one path and forgotten
 * in the other, because there is only one path.
 */
export function createUndoLog() {
  const undos: Array<() => void> = [];
  return {
    /** Records how to take back the thing just added */
    record: (undo: () => void): void => void undos.push(undo),
    /**
     * Takes back everything recorded, most recent first, and forgets it — so a second call takes nothing
     * back twice. Every undo runs whatever the ones before it did: a contribution that can't be taken back
     * out is a leak, and stopping would add the rest of them to it. Returns what failed, for the caller to
     * report; a rollback has nowhere to report to and ignores it.
     */
    undoAll: (): string[] => {
      const failures: string[] = [];
      for (const undo of undos.splice(0).reverse()) {
        try {
          undo();
        } catch (err) {
          failures.push(err instanceof Error ? err.message : String(err));
        }
      }
      return failures;
    },
  };
}

/** A registration's undos, as the registry that made it holds them */
export type UndoLog = ReturnType<typeof createUndoLog>;
