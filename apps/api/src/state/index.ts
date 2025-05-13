import { mergePlugins } from '@/shared/type-helpers';

export { bus } from "@/state/backend";

export { agent } from "@/state/agent/state";
import { agentState, AgentPluginEvents } from "@/state/agent/state";

export default [
  agentState,
]

export const events = mergePlugins(
  AgentPluginEvents,
);

export { backendState } from "@/state/backend";