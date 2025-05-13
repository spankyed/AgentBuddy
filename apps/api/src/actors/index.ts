import { mergePlugins } from '@/shared/type-helpers';

export { bus } from "@/actors/backend";

export { agent } from "@/actors/agent/state";
import { agentState, AgentPluginEvents } from "@/actors/agent/state";

export default [
  agentState,
]

export const events = mergePlugins(
  AgentPluginEvents,
);

export { backendState } from "@/actors/backend";