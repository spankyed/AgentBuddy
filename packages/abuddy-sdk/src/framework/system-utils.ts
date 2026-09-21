import type { AnyStateMachine } from 'xstate';
import type { SystemSpec } from './define-system.ts';
import type { PackSystemDef } from './pack-registration.ts';
import { qualifiedId } from '../ids/addressing.ts';

export interface SystemEntry {
  /** The system's identity, from `defineSystem` */
  spec: Pick<SystemSpec<string, { type: string }, { type: string }>, 'id'>;
  machine: AnyStateMachine;
}

/**
 * A pack's systems, each under the id it runs as: `<packId>.<featureId>`, the same rule a plugin follows.
 *
 * `defineSystem` names the feature, and this is where that name becomes an address — so a pack's code
 * keeps writing the short name and nothing in it repeats the rule. A spec that already carries the
 * prefix is left alone, which is what lets a registration be qualified once whoever built it.
 */
export function toPackSystemDefs(entries: SystemEntry[], packId: string): PackSystemDef[] {
  return entries.map(({ spec, machine }) => ({
    id: spec.id.startsWith(`${packId}.`) ? spec.id : qualifiedId(packId, spec.id),
    machine,
    events: new Set(machine.events),
  }));
}
