import type { EARS } from '@/core/types';
import type { FlowInstance, FlowSelector } from '../types/event-routing';
import { brainLogger } from '../utils/brain-debug';

/**
 * Registry for tracking active flow instances
 */
class FlowRegistry {
  private flows: Map<EARS.EntityId, FlowInstance> = new Map();
  private pathIndex: Map<string, EARS.EntityId> = new Map();
  private parentIndex: Map<EARS.EntityId, Set<EARS.EntityId>> = new Map();
  private tagIndex: Map<string, Set<EARS.EntityId>> = new Map();
  private blueprintIndex: Map<EARS.EntityId, Set<EARS.EntityId>> = new Map();

  /**
   * Register a new flow instance
   */
  register(flow: FlowInstance): void {
    const { flowTNodeId, path, parentId, metadata, flowId } = flow;
    
    brainLogger.debug(`Registering flow instance: ${flowTNodeId}`, {
      path,
      parentId,
      tags: metadata.tags
    });

    // Store flow instance
    this.flows.set(flowTNodeId, flow);
    
    // Update path index
    this.pathIndex.set(path, flowTNodeId);
    
    // Update parent-child index
    if (parentId) {
      if (!this.parentIndex.has(parentId)) {
        this.parentIndex.set(parentId, new Set());
      }
      this.parentIndex.get(parentId)!.add(flowTNodeId);
    }
    
    // Update tag index
    metadata.tags.forEach(tag => {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag)!.add(flowTNodeId);
    });
    
    // Update blueprint index
    if (!this.blueprintIndex.has(flowId)) {
      this.blueprintIndex.set(flowId, new Set());
    }
    this.blueprintIndex.get(flowId)!.add(flowTNodeId);
  }

  /**
   * Unregister a flow instance
   */
  unregister(flowTNodeId: EARS.EntityId): void {
    const flow = this.flows.get(flowTNodeId);
    if (!flow) return;
    
    brainLogger.debug(`Unregistering flow instance: ${flowTNodeId}`);
    
    // Remove from main registry
    this.flows.delete(flowTNodeId);
    
    // Remove from path index
    this.pathIndex.delete(flow.path);
    
    // Remove from parent index
    if (flow.parentId) {
      this.parentIndex.get(flow.parentId)?.delete(flowTNodeId);
    }
    
    // Remove from tag index
    flow.metadata.tags.forEach(tag => {
      this.tagIndex.get(tag)?.delete(flowTNodeId);
    });
    
    // Remove from blueprint index
    this.blueprintIndex.get(flow.flowId)?.delete(flowTNodeId);
    
    // Also unregister any children
    const children = this.parentIndex.get(flowTNodeId);
    if (children) {
      children.forEach(childId => this.unregister(childId));
    }
    this.parentIndex.delete(flowTNodeId);
  }

  /**
   * Find flow by ID
   */
  findById(flowTNodeId: EARS.EntityId): FlowInstance | null {
    return this.flows.get(flowTNodeId) || null;
  }

  /**
   * Find flow by path
   */
  findByPath(path: string): FlowInstance | null {
    const id = this.pathIndex.get(path);
    return id ? this.flows.get(id) || null : null;
  }

  /**
   * Find flows matching selector
   */
  findBySelector(selector: FlowSelector): FlowInstance[] {
    let results = Array.from(this.flows.values());
    
    // Filter by blueprint ID
    if (selector.flowId) {
      const instanceIds = this.blueprintIndex.get(selector.flowId);
      if (instanceIds) {
        const idSet = new Set(instanceIds);
        results = results.filter(f => idSet.has(f.flowTNodeId));
      } else {
        return [];
      }
    }
    
    // Filter by tags (must have all specified tags)
    if (selector.tags && selector.tags.length > 0) {
      results = results.filter(flow => 
        selector.tags!.every(tag => flow.metadata.tags.includes(tag))
      );
    }
    
    // Filter by status
    if (selector.status) {
      results = results.filter(f => f.status === selector.status);
    }
    
    // Filter by parent
    if (selector.parentId) {
      const childIds = this.parentIndex.get(selector.parentId);
      if (childIds) {
        const idSet = new Set(childIds);
        results = results.filter(f => idSet.has(f.flowTNodeId));
      } else {
        return [];
      }
    }
    
    // Filter by depth
    if (selector.depth) {
      results = results.filter(flow => {
        const depth = flow.path.split('/').length - 1;
        const { min = 0, max = Infinity } = selector.depth!;
        return depth >= min && depth <= max;
      });
    }
    
    // Filter by metadata
    if (selector.metadata) {
      results = results.filter(flow => {
        return Object.entries(selector.metadata!).every(([key, value]) => 
          flow.metadata.custom?.[key] === value
        );
      });
    }
    
    return results;
  }

  /**
   * Get all instances of a blueprint
   */
  findByBlueprint(flowId: EARS.EntityId): FlowInstance[] {
    const instanceIds = this.blueprintIndex.get(flowId);
    if (!instanceIds) return [];
    
    return Array.from(instanceIds)
      .map(id => this.flows.get(id))
      .filter((f): f is FlowInstance => f !== undefined);
  }

  /**
   * Get children of a flow
   */
  getChildren(flowTNodeId: EARS.EntityId): FlowInstance[] {
    const childIds = this.parentIndex.get(flowTNodeId);
    if (!childIds) return [];
    
    return Array.from(childIds)
      .map(id => this.flows.get(id))
      .filter((f): f is FlowInstance => f !== undefined);
  }

  /**
   * Get parent of a flow
   */
  getParent(flowTNodeId: EARS.EntityId): FlowInstance | null {
    const flow = this.flows.get(flowTNodeId);
    return flow?.parentId ? this.flows.get(flow.parentId) || null : null;
  }

  /**
   * Get siblings of a flow
   */
  getSiblings(flowTNodeId: EARS.EntityId): FlowInstance[] {
    const flow = this.flows.get(flowTNodeId);
    if (!flow?.parentId) return [];
    
    const siblings = this.getChildren(flow.parentId);
    return siblings.filter(s => s.flowTNodeId !== flowTNodeId);
  }

  /**
   * Get all ancestors of a flow (parent, grandparent, etc.)
   */
  getAncestors(flowTNodeId: EARS.EntityId): FlowInstance[] {
    const ancestors: FlowInstance[] = [];
    let current = this.flows.get(flowTNodeId);
    
    while (current?.parentId) {
      const parent = this.flows.get(current.parentId);
      if (parent) {
        ancestors.push(parent);
        current = parent;
      } else {
        break;
      }
    }
    
    return ancestors;
  }

  /**
   * Get all descendants of a flow (children, grandchildren, etc.)
   */
  getDescendants(flowTNodeId: EARS.EntityId): FlowInstance[] {
    const descendants: FlowInstance[] = [];
    const queue = [flowTNodeId];
    
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const children = this.getChildren(currentId);
      
      descendants.push(...children);
      queue.push(...children.map(c => c.flowTNodeId));
    }
    
    return descendants;
  }

  /**
   * Update flow metadata
   */
  updateMetadata(flowTNodeId: EARS.EntityId, metadata: Partial<FlowInstance['metadata']>): void {
    const flow = this.flows.get(flowTNodeId);
    if (!flow) return;
    
    // Update tags index if tags changed
    if (metadata.tags && metadata.tags !== flow.metadata.tags) {
      // Remove old tags
      flow.metadata.tags.forEach(tag => {
        this.tagIndex.get(tag)?.delete(flowTNodeId);
      });
      
      // Add new tags
      metadata.tags.forEach(tag => {
        if (!this.tagIndex.has(tag)) {
          this.tagIndex.set(tag, new Set());
        }
        this.tagIndex.get(tag)!.add(flowTNodeId);
      });
    }
    
    // Merge metadata
    flow.metadata = { ...flow.metadata, ...metadata };
  }

  /**
   * Update flow status
   */
  updateStatus(flowTNodeId: EARS.EntityId, status: FlowInstance['status']): void {
    const flow = this.flows.get(flowTNodeId);
    if (flow) {
      flow.status = status;
    }
  }

  /**
   * Get all active flows
   */
  getAllActive(): FlowInstance[] {
    return Array.from(this.flows.values()).filter(f => f.status === 'active');
  }

  /**
   * Clear all flows
   */
  clear(): void {
    this.flows.clear();
    this.pathIndex.clear();
    this.parentIndex.clear();
    this.tagIndex.clear();
    this.blueprintIndex.clear();
  }

  /**
   * Get registry size
   */
  get size(): number {
    return this.flows.size;
  }
}

// Export singleton instance
export const flowRegistry = new FlowRegistry();