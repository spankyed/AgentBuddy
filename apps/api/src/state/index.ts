import { mergePlugins } from '@/shared/type-helpers';

export { bus } from "@/state/backend";

export { agent } from "@plugins/agent/state";
import { agentState, AgentPluginEvents } from "@plugins/agent/state";

export default [
  agentState,
]

export const events = mergePlugins(
  AgentPluginEvents,
);

export { backendState } from "@/state/backend";