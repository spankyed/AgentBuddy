import { mergePlugins } from '@/shared/event-helpers';

export { bus } from "@/actors/backend";

export { agent } from "@/actors/agent/state";
import { agent, agentState, AgentPluginEvents } from "@/actors/agent/state";

export default {
  [agent]: agentState
} as const;

export const events = mergePlugins(
  AgentPluginEvents,
);

export { backendState } from "@/actors/backend";