import type { PackSystemDef } from '@abuddy/sdk/framework';
import { brain, brainSystem, brainSpec } from '../features/brain/be/system';
import { threads, threadsSystem, threadsSpec } from '../features/threads/be/system';
import { flows, flowsSystem, flowsSpec } from '../features/flows/be/system';
import { database, databaseSystem, databaseSpec } from '../features/database/be/system';
import { logs, logsSystem, logsSpec } from '../features/logs/be/system';
import { prompts, promptsSystem, promptsSpec } from '../features/prompts/be/system';
import { settings, settingsSystem, settingsSpec } from '../features/settings/be/system';
import { actions, actionsSystem, actionsSpec } from '../features/actions/be/system';
import { library, librarySystem, librarySpec } from '../features/library/be/system';
import { code, codeSpec, systemMachine as codeSystem } from '../features/code/be/system';
import { notes, notesSystem, notesSpec } from '../features/notes/be/system';
import { browser, browserSystem, browserSpec } from '../features/browser/be/system';
import { calendar, calendarSystem, calendarSpec } from '../features/calendar/be/system';

const systems = {
  [settings]: settingsSystem,
  [brain]: brainSystem,
  [threads]: threadsSystem,
  [flows]: flowsSystem,
  [database]: databaseSystem,
  [prompts]: promptsSystem,
  [actions]: actionsSystem,
  [library]: librarySystem,
  [code]: codeSystem,
  [notes]: notesSystem,
  [browser]: browserSystem,
  [calendar]: calendarSystem,
} as const;

export const allSpecs = [
  settingsSpec, brainSpec, threadsSpec, flowsSpec,
  databaseSpec, logsSpec, promptsSpec, actionsSpec,
  librarySpec, codeSpec, notesSpec, browserSpec,
  calendarSpec,
] as const;

const specsById = new Map(allSpecs.map(s => [s.id, s]));

export function buildEventValidationMap(): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>(
    Object.entries(systems).map(([id, machine]) => [id, new Set(machine.events)])
  );
  map.set(logs, new Set(logsSystem.events));
  return map;
}

export function buildSystemDefs(): PackSystemDef[] {
  const eventValidation = buildEventValidationMap();
  return Object.entries(systems).map(([id, machine]) => ({
    id,
    machine,
    events: eventValidation.get(id) ?? new Set(),
    designation: specsById.get(id)?.designation,
  }));
}
