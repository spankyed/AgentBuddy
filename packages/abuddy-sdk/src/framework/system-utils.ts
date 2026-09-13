import type { AnyStateMachine } from 'xstate';
import type { SystemSpec } from './define-system.ts';
import type { PackSystemDef } from './pack-registration.ts';

export interface SystemEntry {
  /** The system's identity, from `defineSystem` */
  spec: Pick<SystemSpec<string, { type: string }, { type: string }>, 'id' | 'designation'>;
  machine: AnyStateMachine;
}

export function toPackSystemDefs(entries: SystemEntry[]): PackSystemDef[] {
  return entries.map(({ spec, machine }) => ({
    id: spec.id,
    machine,
    events: new Set(machine.events),
    designation: spec.designation,
  }));
}
