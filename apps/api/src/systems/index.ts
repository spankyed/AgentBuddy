import { mergePlugins } from '@/shared/event-helpers';

export { bus } from "@/systems/backend";

export { agent } from "@/systems/agent/system";
import { agent, agentSystem, AgentPluginEvents } from "@/systems/agent/system";

export default {
  [agent]: agentSystem,
} as const;

export const events = mergePlugins(
  AgentPluginEvents,
);

export { backendSystem } from "@/systems/backend";