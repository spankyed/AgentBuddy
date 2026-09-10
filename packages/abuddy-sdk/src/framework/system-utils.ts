import type { SystemSpec } from './define-system';
import type { PackSystemDef } from './pack-registration';

export interface SystemEntry {
  spec: SystemSpec<any, any, any, any>;
  machine: any;
}

export function toPackSystemDefs(entries: SystemEntry[]): PackSystemDef[] {
  return entries.map(({ spec, machine }) => ({
    id: spec.id,
    machine,
    events: new Set<string>(machine.events),
  }));
}
