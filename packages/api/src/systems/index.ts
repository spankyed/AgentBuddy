import { brain, brainSystem, brainDef } from '@/systems/brain/system';
import { threads, threadsSystem, threadsDef } from '@/systems/threads/system';
import { flows, flowsSystem, flowsDef } from '@/systems/flows/system';
import { database, databaseSystem, databaseDef } from '@/systems/database/system';
import { logs, logsSystem, logsDef } from '@/systems/logs/system';
import { prompts, promptsSystem, promptsDef } from '@/systems/prompts/system';
import { settings, settingsSystem, settingsDef } from '@/systems/settings/system';
import { actions, actionsSystem, actionsDef } from '@/systems/actions/system';
import { library, librarySystem, libraryDef } from '@/systems/library/system';
import { codeDef, systemMachine as codeSystem } from '@/systems/code/system';
import { notes, notesSystem, notesDef } from '@/systems/notes/system';
import { browser, browserSystem, browserDef } from '@/systems/browser/system';
import { calendar, calendarSystem, calendarDef } from '@/systems/calendar/system';
import type { ApplicationOutgoingEvents } from '@/core/shared/system-errors';

const code = codeDef.id;

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

export default systems;

// Global event type assembly from all system definitions
const allDefs = [
  settingsDef, brainDef, threadsDef, flowsDef,
  databaseDef, logsDef, promptsDef, actionsDef,
  libraryDef, codeDef, notesDef, browserDef,
  calendarDef,
] as const;

type AllDefs = (typeof allDefs)[number];

export type IncomingSystemEvents = AllDefs['_incoming'];
export type OutgoingSystemEvents = AllDefs['_outgoing'] | ApplicationOutgoingEvents;

// Derive valid event types from each machine's runtime config
export const eventValidationMap: Map<string, Set<string>> = new Map(
  Object.entries(systems).map(([id, machine]) => [id, new Set(machine.events)])
);
eventValidationMap.set(logs, new Set(logsSystem.events));

export { backendSystem } from "@/systems/backend";
