import type { TraceStore } from '@abuddy/sdk/services';
import { services } from '@/__generated__/services';
import { EARS } from '@/__generated__/ears';
import type { TNodeEntity, TrackTree } from '@abuddy/sdk/steps';
import { createLogger } from '@abuddy/sdk/logger';

const logger = createLogger('database:trace');

/**
 * Helper to get all descendant TNodes via a specific relation type
 * Similar to core/ears/helpers/graph.ts descendants but for LMDB
 */
function getDescendants(
  query: TraceStore,
  startId: string,
  relKind: EARS.RelKind
): string[] {
  const seen = new Set<string>();
  const stack = [startId];
  
  while (stack.length > 0) {
    const nodeId = stack.pop()!;
    const relations = [...query.relations({
      kind: relKind,
      src: nodeId as EARS.EntityId,
      skipDeleted: true
    })];
    
    for (const { rel } of relations) {
      const childId = rel.tgt;
      if (!seen.has(childId)) {
        seen.add(childId);
        stack.push(childId);
      }
    }
  }
  
  return Array.from(seen);
}

/**
 * Build a TNode entity from LMDB data with optional children
 */
function buildTNodeEntity(
  query: TraceStore,
  nodeId: string,
  meta: any,
  includeChildren = false
): TrackTree | TNodeEntity | null {
  if (!meta || meta.deletedAt) return null;
  
  const tNode: TNodeEntity = {
    id: nodeId as EARS.EntityId,
    entityType: EARS.Entity.TNode,
    createdAt: meta.createdAt,
    tNodeType: query.getAttr('tNodeType', nodeId as EARS.EntityId) as any || 'step',
    label: query.getAttr('label', nodeId as EARS.EntityId) as string || 'Node',
    status: query.getAttr('status', nodeId as EARS.EntityId) as any || 'completed',
    startedAt: query.getAttr('startedAt', nodeId as EARS.EntityId) as number || meta.createdAt,
  };
  
  // Get optional attributes
  const completedAt = query.getAttr('completedAt', nodeId as EARS.EntityId) as number;
  if (completedAt) tNode.completedAt = completedAt;
  
  const eventType = query.getAttr('eventType', nodeId as EARS.EntityId) as string;
  if (eventType) tNode.eventType = eventType;
  
  const stepNodeType = query.getAttr('stepNodeType', nodeId as EARS.EntityId) as string;
  if (stepNodeType) tNode.stepNodeType = stepNodeType;
  
  const final = query.getAttr('final', nodeId as EARS.EntityId) as boolean;
  if (final) tNode.final = final;
  
  // If includeChildren is true, recursively build children
  if (includeChildren) {
    const childIds = getDescendants(query, nodeId, EARS.RelKind.SPAWNED);
    const children: TrackTree[] = [];
    
    for (const childId of childIds) {
      const childMeta = query.getEntityMeta(childId as EARS.EntityId);
      const child = buildTNodeEntity(query, childId, childMeta, true) as TrackTree;
      if (child) {
        children.push(child);
      }
    }
    
    // Sort children by startedAt
    children.sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
    
    return {
      ...tNode,
      children
    } as TrackTree;
  }
  
  return tNode;
}

/**
 * Get all flow TNodes ordered by recency (most recent first)
 * TNodes are stored in volatileBackup partition
 */
export function getTraceFlows(limit = 100): TNodeEntity[] {
  try {
    const query = services.traceStore;
    const flows: TNodeEntity[] = [];
    
    // Get all TNode entities
    for (const { id: entityId, meta } of query.entities()) {
      if (meta.type === 'TNode' && !meta.deletedAt) {
        const id = String(entityId) as EARS.EntityId;
        
        // Get tNodeType attribute to check if it's a flow
        const tNodeType = query.getAttr('tNodeType', id as EARS.EntityId) as string;
        if (tNodeType === 'flow') {
          // Build the full TNode entity
          const flow: TNodeEntity = {
            id,
            entityType: EARS.Entity.TNode,
            createdAt: meta.createdAt,
            tNodeType: 'flow',
            label: query.getAttr('label', id as EARS.EntityId) as string || 'Unnamed Flow',
            status: query.getAttr('status', id as EARS.EntityId) as any || 'completed',
            startedAt: query.getAttr('startedAt', id as EARS.EntityId) as number || meta.createdAt,
          };
          
          // Get optional attributes
          const completedAt = query.getAttr('completedAt', id as EARS.EntityId) as number;
          if (completedAt) flow.completedAt = completedAt;
          
          const blueprint = query.getAttr('blueprint', id as EARS.EntityId);
          if (blueprint && typeof blueprint === 'object') {
            flow.blueprint = blueprint as TNodeEntity['blueprint'];
          }
          
          flows.push(flow);
        }
      }
    }
    
    // Sort flows: TNode-Root (Run Agent Brain) first, then by startedAt timestamp (most recent first)
    flows.sort((a, b) => {
      // Check if either flow is the Run Agent Brain (TNode-Root)
      const aIsRoot = a.label === 'Run Agent Brain' || a.id === 'TNode-Root';
      const bIsRoot = b.label === 'Run Agent Brain' || b.id === 'TNode-Root';
      
      // If one is root and the other isn't, root comes first
      if (aIsRoot && !bIsRoot) return -1;
      if (!aIsRoot && bIsRoot) return 1;
      
      // Otherwise sort by startedAt timestamp (most recent first)
      return (b.startedAt || 0) - (a.startedAt || 0);
    });
    
    // Limit results
    return flows.slice(0, limit);
  } catch (error) {
    logger.error('Failed to get trace flows:', { error: String(error) });
    return [];
  }
}

/**
 * Get paginated event tracks for a specific flow
 * Uses TRACKED relations to find child events
 */
export function getFlowEvents(
  flowId: string, 
  offset = 0, 
  limit = 50
): { events: TrackTree[]; hasMore: boolean } {
  try {
    const query = services.traceStore;
    const eventTracks: TrackTree[] = [];
    
    // Find all TRACKED relations from this flow (flow TNode -> event TNodes)
    const relations = [...query.relations({ 
      kind: EARS.RelKind.TRACKED,
      src: flowId as EARS.EntityId,
      skipDeleted: true
    })];
    
    // Build event tracks with their child steps
    for (const { rel } of relations) {
      const eventId = rel.tgt;
      const eventMeta = query.getEntityMeta(eventId);
      const eventTrack = buildTNodeEntity(query, eventId, eventMeta, true) as TrackTree;
      
      if (eventTrack) {
        eventTracks.push(eventTrack);
      }
    }
    
    // Sort event tracks by startedAt timestamp (most recent first)
    eventTracks.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
    
    // Apply pagination
    const paginatedEvents = eventTracks.slice(offset, offset + limit);
    const hasMore = offset + limit < eventTracks.length;
    
    return { events: paginatedEvents, hasMore };
  } catch (error) {
    logger.error('Failed to get flow events:', { error: String(error) });
    return { events: [], hasMore: false };
  }
}

/**
 * Get complete node details including nodeAttributes
 * Only called when a node is expanded in the UI
 */
export function getNodeDetails(nodeId: string): TNodeEntity | null {
  try {
    const query = services.traceStore;
    const meta = query.getEntityMeta(nodeId as EARS.EntityId);
    
    if (!meta || meta.deletedAt) {
      return null;
    }
    
    const node: TNodeEntity = {
      id: nodeId as EARS.EntityId,
      entityType: EARS.Entity.TNode,
      createdAt: meta.createdAt,
      tNodeType: query.getAttr('tNodeType', nodeId as EARS.EntityId) as any || 'step',
      label: query.getAttr('label', nodeId as EARS.EntityId) as string || 'Node',
      status: query.getAttr('status', nodeId as EARS.EntityId) as any || 'completed',
      startedAt: query.getAttr('startedAt', nodeId as EARS.EntityId) as number || meta.createdAt,
    };
    
    // Get all optional attributes
    const completedAt = query.getAttr('completedAt', nodeId as EARS.EntityId) as number;
    if (completedAt) node.completedAt = completedAt;
    
    const eventType = query.getAttr('eventType', nodeId as EARS.EntityId) as string;
    if (eventType) node.eventType = eventType;
    
    const stepNodeType = query.getAttr('stepNodeType', nodeId as EARS.EntityId) as string;
    if (stepNodeType) node.stepNodeType = stepNodeType;
    
    const final = query.getAttr('final', nodeId as EARS.EntityId) as boolean;
    if (final) node.final = final;
    
    const blueprint = query.getAttr('blueprint', nodeId as EARS.EntityId);
    if (blueprint && typeof blueprint === 'object') {
      node.blueprint = blueprint as TNodeEntity['blueprint'];
    }
    
    // Get the full nodeAttributes (this is what we lazy load)
    const nodeAttributes = query.getAttr('nodeAttributes', nodeId as EARS.EntityId);
    if (nodeAttributes && typeof nodeAttributes === 'object') {
      node.nodeAttributes = nodeAttributes as Record<string, unknown>;
    }
    
    return node;
  } catch (error) {
    logger.error('Failed to get node details:', { error: String(error) });
    return null;
  }
}
