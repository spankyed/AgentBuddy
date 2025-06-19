import { qx } from '@/shared/ears/helpers/query';
import { EARS } from '@/shared/ears/types';
import type { FlowTNodeData, TNodeEntity, TrackEntity,  } from '../types';
import { descendants } from '@/shared/ears/helpers/graph';

export default function buildTNodeTree(tNodeId: EARS.EntityId): TrackEntity {
  const nodeCols = ["id", "nodeType", "label", "status", "startedAt", "createdAt", "eventTag", "stepNodeId", "stepNodeType"] as const;
  
  // Get the TNode
  const tNode = qx(tNodeId)
    .pickOne(nodeCols) as TNodeEntity;
  
  if (!tNode) {
    throw new Error(`TNode not found: ${tNodeId}`);
  }
  
  let children: TrackEntity[] = [];
  
  if (tNode.nodeType === 'flow') {
    // Flow nodes use TRACKED to find event nodes
    const childLinks = qx(tNodeId)
      .links(EARS.RelKind.TRACKED, [EARS.Entity.TNode])
      .sort((a, b) => {
        // Sort by order if available in info
        const aOrder = (a as any).info?.order ?? 0;
        const bOrder = (b as any).info?.order ?? 0;
        return aOrder - bOrder;
      });
    
    // Recursively build children
    children = childLinks.map(({ id }) => buildTNodeTree(id));
  } else if (tNode.nodeType === 'event' || tNode.nodeType === 'step') {
    // For event and step nodes, find the sequential chain using SPAWNED relation
    const chainNodes = descendants(tNodeId, EARS.RelKind.SPAWNED);
    
    if (chainNodes.length > 0) {
      // Find the immediate child (the one directly spawned by this node)
      const immediateChild = qx(tNodeId)
        .links(EARS.RelKind.SPAWNED, [EARS.Entity.TNode])
        .map(({ id }) => id)[0];
      
      if (immediateChild) {
        // Build the chain as a linear tree
        children = [buildTNodeTree(immediateChild)];
      }
    }
  }
  
  return {
    ...tNode,
    children
  };
}
