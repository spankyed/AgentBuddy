import { mergeSystems } from '@/shared/utils/event-helpers';

export { bus } from "@/systems/_backend/backend";

import { agent, agentSystem, AgentSystemEvents } from "@/systems/agent/system";
import { brain, brainSystem, BrainSystemEvents } from '@/systems/brain/system';
import { threads, threadsSystem, ThreadsSystemEvents } from '@/systems/threads/system';
import { flows, flowsSystem, FlowsSystemEvents } from '@/systems/flows/system';

export default {
  [agent]: agentSystem,
  [brain]: brainSystem,
  [threads]: threadsSystem,
  [flows]: flowsSystem,
} as const;

export const events = mergeSystems(
  AgentSystemEvents,
  BrainSystemEvents,
  ThreadsSystemEvents,
  FlowsSystemEvents
);

export { backendSystem } from "@/systems/_backend/backend";