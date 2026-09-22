import type { AnyStateMachine } from 'xstate';
import type { SystemSpec } from './define-system.ts';
import type { PackFeatureSystem } from './pack-registration.ts';

export interface SystemEntry {
  /** The system's events, from `defineSystem`, which the build reads the types it generates from */
  spec: Pick<SystemSpec<{ type: string }, { type: string }>, '_incoming' | '_outgoing'>;
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
