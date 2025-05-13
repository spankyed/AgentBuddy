import { mergePlugins } from '@/shared/event-helpers';

export { bus } from "@/systems/backend";

export { agent } from "@/systems/agent/state";
import { agent, agentState, AgentPluginEvents } from "@/systems/agent/state";

export default {
  [agent]: agentState
} as const;

export const events = mergePlugins(
  AgentPluginEvents,
);

export { backendState } from "@/systems/backend";