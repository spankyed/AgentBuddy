import type { SystemSpec } from './define-system.ts';
import type { PackSystemDef } from './pack-registration.ts';

export interface SystemEntry {
  spec: SystemSpec<any, any, any, any>;
  machine: any;
}

export function toPackSystemDefs(entries: SystemEntry[]): PackSystemDef[] {
  return entries.map(({ spec, machine }) => ({
    id: spec.id,
    machine,
    events: new Set<string>(machine.events),
    designation: spec.designation,
  }));
}
