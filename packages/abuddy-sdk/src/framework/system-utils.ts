import type { AnyStateMachine } from 'xstate';
import type { PackFeatureSystem } from './pack-registration.ts';

export interface SystemEntry {
  /**
   * The spec `defineSystem` returned, so a system module's default export is one thing. Nothing reads the events
   * from it: codegen reads them from the feature's contract (`features[].system.contract`), which is why the entry
   * no longer needs `satisfies` to keep them — there is no inference left to widen.
   */
  spec: { types: unknown; typeOf: unknown };
  machine: AnyStateMachine;
}

/**
 * A feature's system as its pack registers it: the entry the feature's `system.ts` default-exports, accepting its
 * machine's events and those abuddy.json adds (`incoming`).
 */
export function packSystem(entry: SystemEntry, options: { incoming?: readonly string[]; early?: true } = {}): PackFeatureSystem {
  return {
    machine: entry.machine,
    receives: [...new Set([...entry.machine.events, ...(options.incoming ?? [])])],
    ...(options.early ? { early: options.early } : {}),
  };
}
