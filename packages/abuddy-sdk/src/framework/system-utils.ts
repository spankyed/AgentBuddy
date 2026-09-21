import type { AnyStateMachine } from 'xstate';
import type { SystemSpec } from './define-system.ts';
import type { PackFeatureSystem } from './pack-registration.ts';

export interface SystemEntry {
  /** The system's identity, from `defineSystem` */
  spec: Pick<SystemSpec<string, { type: string }, { type: string }>, 'id'>;
  machine: AnyStateMachine;
}

/**
 * A feature's system as its pack registers it: the entry the feature's `system.ts` default-exports, accepting its
 * machine's events and those abuddy.json adds (`incoming`). Throws when `defineSystem` named another feature, since
 * the system would be sent to by one name and run under another.
 */
export function packSystem(entry: SystemEntry, featureId: string, options: { incoming?: readonly string[]; early?: true } = {}): PackFeatureSystem {
  if (entry.spec.id !== featureId) {
    throw new Error(`The system of feature "${featureId}" is defined as "${entry.spec.id}": defineSystem takes the feature's id`);
  }
  return {
    machine: entry.machine,
    receives: [...new Set([...entry.machine.events, ...(options.incoming ?? [])])],
    ...(options.early ? { early: options.early } : {}),
  };
}
