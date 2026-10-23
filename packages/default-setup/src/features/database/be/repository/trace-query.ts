// The Database surface's run history viewer: the flows that ran, the events each heard, and one node's details,
// read from the run history (`services.runHistory`)
import type { RunTree, TNode, TNodeId } from '@apackdev/sdk/steps';
import { services } from '#generated/services.ts';

/** The flow runs, newest first: a session's root and every subflow it ran */
export function getTraceFlows(limit = 100): TNode[] {
  return services.runHistory.findRuns({ limit });
}

/** One page of the events a flow run heard, newest first, each with the nodes it ran under it */
export function getFlowEvents(flowId: string, offset = 0, limit = 50): { events: RunTree[]; hasMore: boolean } {
  const history = services.runHistory;
  const events = history.findChildren(flowId as TNodeId, { reverse: true }).filter((child) => child.tNodeType === 'event');
  return {
    events: events.slice(offset, offset + limit).map((event) => history.tree(event.id)!),
    hasMore: offset + limit < events.length,
  };
}

/** A node with everything recorded on it, or null when the history holds none */
export function getNodeDetails(nodeId: string): TNode | null {
  return services.runHistory.get(nodeId as TNodeId) ?? null;
}
