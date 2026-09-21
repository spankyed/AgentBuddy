import type { AnyStateMachine } from 'xstate';
import type { SystemSpec } from './define-system.ts';
import type { PackSystemDef } from './pack-registration.ts';
import { resolveName } from '../ids/addressing.ts';

export interface SystemEntry {
  /** The system's identity, from `defineSystem` */
  spec: Pick<SystemSpec<string, { type: string }, { type: string }>, 'id'>;
  machine: AnyStateMachine;
}

/** A pack's systems, each under its address `<packId>/<featureId>`; `defineSystem` gave it the feature id */
export function toPackSystemDefs(entries: SystemEntry[], packId: string): PackSystemDef[] {
  return entries.map(({ spec, machine }) => ({
    id: resolveName(spec.id, { packId }),
    machine,
    events: new Set(machine.events),
  }));
}
