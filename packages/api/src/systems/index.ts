import { mergeSystems } from '@/core/helpers/event-helpers';

export { bus } from "@/systems/backend";

import { agent, agentSystem, AgentSystemEvents } from "@/systems/agent/system";
import { brain, brainSystem, BrainSystemEvents } from '@/systems/brain/system';
import { threads, threadsSystem, ThreadsSystemEvents } from '@/systems/threads/system';
import { flows, flowsSystem, FlowsSystemEvents } from '@/systems/flows/system';
import { database, databaseSystem, DatabaseSystemEvents } from '@/systems/database/system';
import { logs, logsSystem, LogsSystemEvents } from '@/systems/logs/system';
import { prompts, promptsSystem, PromptsSystemEvents } from '@/systems/prompts/system';
import { settings, settingsSystem, SettingsSystemEvents } from '@/systems/settings/system';
import { actions, actionsSystem, ActionsSystemEvents } from '@/systems/actions/system';
import { library, librarySystem, LibrarySystemEvents } from '@/systems/library/system';
import { id as code, systemMachine as codeSystem, incomingSystemEvents as CodeSystemEvents } from '@/systems/code/system';

export default {
  [settings]: settingsSystem,
  [agent]: agentSystem,
  [brain]: brainSystem,
  [threads]: threadsSystem,
  [flows]: flowsSystem,
  [database]: databaseSystem,
  [prompts]: promptsSystem,
  [actions]: actionsSystem,
  [library]: librarySystem,
  [code]: codeSystem,
  // [logs]: logsSystem,
} as const;

export const events = mergeSystems(
  SettingsSystemEvents,
  AgentSystemEvents,
  BrainSystemEvents,
  ThreadsSystemEvents,
  FlowsSystemEvents,
  DatabaseSystemEvents,
  LogsSystemEvents,
  PromptsSystemEvents,
  ActionsSystemEvents,
  LibrarySystemEvents,
  CodeSystemEvents
);

export { backendSystem } from "@/systems/backend";