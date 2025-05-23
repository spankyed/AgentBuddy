import { mergeSystems } from '@/shared/utils/event-helpers';

export { bus } from "@/systems/_bus/backend";

export { agent } from "@/systems/agent/system";
import { agent, agentSystem, AgentSystemEvents } from "@/systems/agent/system";
import { brain, brainSystem, BrainSystemEvents } from '@/systems/brain/system';

export default {
  [agent]: agentSystem,
  [brain]: brainSystem,
} as const;

export const events = mergeSystems(
  AgentSystemEvents,
  BrainSystemEvents
);

export { backendSystem } from "@/systems/_bus/backend";