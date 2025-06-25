import type { NodeEntity } from '@/systems/flows/types';
import type { ExecutionContext } from '@/systems/brain/types';

/**
 * Handle execution of a keep-alive node
 * Keep-alive nodes maintain the flow active and don't complete
 */
export function keepAliveNodeHandler(
  node: NodeEntity,
  executionContext: ExecutionContext,
  actor: any
) {
  console.log(`Keep-alive node: ${node.label} - flow will remain active`);
  
  // Keep-alive nodes don't complete - they keep the flow running
  // The actor will stay in the executing state indefinitely
} 