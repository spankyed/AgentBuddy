import type { NodeEntity } from '@/core/shared-types/flows';
import type { ExecutionContext, TNodeEntity } from '@/systems/brain/types';
import { brainInspect } from '../utils/brain-inspect';

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
  // brainInspect(`Keep-alive node: ${node.label} - flow will remain active`);
  
  // Keep-alive nodes don't complete - they keep the flow running
  // The actor will stay in the executing state indefinitely
} 