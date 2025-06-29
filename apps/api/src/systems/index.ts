import { mergeSystems } from '@/shared/utils/event-helpers';

export { bus } from "@/systems/_backend/backend";

import { agent, agentSystem, AgentSystemEvents } from "@/systems/agent/system";
import { brain, brainSystem, BrainSystemEvents } from '@/systems/brain/system';
import { threads, threadsSystem, ThreadsSystemEvents } from '@/systems/threads/system';
import { flows, flowsSystem, FlowsSystemEvents } from '@/systems/flows/system';
import { database, databaseSystem, DatabaseSystemEvents } from '@/systems/database/system';
import { logs, logsSystem, LogsSystemEvents } from '@/systems/logs/system';
import { prompts, promptsSystem, PromptsSystemEvents } from '@/systems/prompts/system';

export default {
  [agent]: agentSystem,
  [brain]: brainSystem,
  [threads]: threadsSystem,
  [flows]: flowsSystem,
  [database]: databaseSystem,
  [prompts]: promptsSystem,
  // [logs]: logsSystem,
} as const;

export const events = mergeSystems(
  AgentSystemEvents,
  BrainSystemEvents,
  ThreadsSystemEvents,
  FlowsSystemEvents,
  DatabaseSystemEvents,
  LogsSystemEvents,
  PromptsSystemEvents
);

export { backendSystem } from "@/systems/_backend/backend";