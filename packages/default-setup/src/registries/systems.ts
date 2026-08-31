import { brain, brainSystem, brainDef } from '../plugins/brain/be/system';
import { threads, threadsSystem, threadsDef } from '../plugins/threads/be/system';
import { flows, flowsSystem, flowsDef } from '../plugins/flows/be/system';
import { database, databaseSystem, databaseDef } from '../plugins/database/be/system';
import { logs, logsSystem, logsDef } from '../plugins/logs/be/system';
import { prompts, promptsSystem, promptsDef } from '../plugins/prompts/be/system';
import { settings, settingsSystem, settingsDef } from '../plugins/settings/be/system';
import { actions, actionsSystem, actionsDef } from '../plugins/actions/be/system';
import { library, librarySystem, libraryDef } from '../plugins/library/be/system';
import { code, codeDef, systemMachine as codeSystem } from '../plugins/code/be/system';
import { notes, notesSystem, notesDef } from '../plugins/notes/be/system';
import { browser, browserSystem, browserDef } from '../plugins/browser/be/system';
import { calendar, calendarSystem, calendarDef } from '../plugins/calendar/be/system';

export const systems = {
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

export const allDefs = [
  settingsDef, brainDef, threadsDef, flowsDef,
  databaseDef, logsDef, promptsDef, actionsDef,
  libraryDef, codeDef, notesDef, browserDef,
  calendarDef,
] as const;

export function buildEventValidationMap(): Map<string, Set<string>> {
  const map: Map<string, Set<string>> = new Map(
    Object.entries(systems).map(([id, machine]) => [id, new Set(machine.events)])
  );
  map.set(logs, new Set(logsSystem.events));
  return map;
}
