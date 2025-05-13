import { mergeSystems } from '@/shared/event-helpers';

export { bus } from "@/systems/backend";

export { agent } from "@/systems/agent/system";
import { agent, agentSystem, AgentSystemEvents } from "@/systems/agent/system";

export default {
  [agent]: agentSystem,
} as const;

export const events = mergeSystems(
  AgentSystemEvents,
);

export { backendSystem } from "@/systems/backend";