import type { NodeEntity } from '@/systems/flows/config/types';
import type { ExecutionContext, TNodeEntity } from '@/systems/brain/types';
import { brainDebug } from '../utils/brain-debug';

/**
 * Handle execution of a keep-alive node
 * Keep-alive nodes maintain the flow active and don't complete
 */
export function keepAliveNodeHandler(
  tNode: TNodeEntity,
  node: NodeEntity,
  executionContext: ExecutionContext,
  actor: any
) {
  brainDebug(`Keep-alive node: ${node.label} - flow will remain active`);
  
  // Keep-alive nodes don't complete - they keep the flow running
  // The actor will stay in the executing state indefinitely
} 