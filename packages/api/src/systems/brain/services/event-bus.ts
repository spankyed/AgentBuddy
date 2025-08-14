import type { EARS } from '@/core/types';
import type { 
  RoutedEvent, 
  FlowSelector, 
  FlowInstance, 
  EventScope,
  FlowAddress,
  FireNodeEvent 
} from '../types/event-routing';
import { flowRegistry } from './flow-registry';
import { brainLogger, brainDebug } from '../utils/brain-debug';

/**
 * Brain Event Bus - Central hub for event routing between flows
 */
class BrainEventBus {
  private channels: Map<string, Set<EARS.EntityId>> = new Map();
  private eventQueue: RoutedEvent[] = [];
  private processing = false;

  /**
   * Send event to a specific flow instance
   */
  sendToFlow(flowTNodeId: EARS.EntityId, event: RoutedEvent): void {
    const flow = flowRegistry.findById(flowTNodeId);
    if (!flow) {
      brainLogger.warn(`Cannot send event to flow ${flowTNodeId}: Flow not found`);
      return;
    }

    brainDebug(`Sending event to flow ${flowTNodeId}`, {
      eventType: event.type,
      hasPayload: !!event.payload
    });

    this.routeEventToFlow(flow, event);
  }

  /**
   * Send event to all instances of a flow blueprint
   */
  sendToFlowType(flowId: EARS.EntityId, event: RoutedEvent): void {
    const flows = flowRegistry.findByBlueprint(flowId);
    
    brainDebug(`Sending event to all instances of flow type ${flowId}`, {
      eventType: event.type,
      instanceCount: flows.length
    });

    flows.forEach(flow => this.routeEventToFlow(flow, event));
  }

  /**
   * Send event to flows matching selector
   */
  sendToFlows(selector: FlowSelector, event: RoutedEvent): void {
    const flows = flowRegistry.findBySelector(selector);
    
    brainDebug(`Sending event to flows matching selector`, {
      selector,
      eventType: event.type,
      matchCount: flows.length
    });

    flows.forEach(flow => this.routeEventToFlow(flow, event));
  }

  /**
   * Broadcast event to a channel
   */
  broadcast(channel: string, event: RoutedEvent): void {
    const subscribers = this.channels.get(channel);
    if (!subscribers || subscribers.size === 0) {
      brainDebug(`No subscribers for channel: ${channel}`);
      return;
    }

    brainDebug(`Broadcasting to channel ${channel}`, {
      eventType: event.type,
      subscriberCount: subscribers.size
    });

    subscribers.forEach(flowTNodeId => {
      const flow = flowRegistry.findById(flowTNodeId);
      if (flow) {
        this.routeEventToFlow(flow, {
          ...event,
          routing: { ...event.routing, channel }
        });
      }
    });
  }

  /**
   * Subscribe a flow to a channel
   */
  subscribeToChannel(flowTNodeId: EARS.EntityId, channel: string): void {
    if (!this.channels.has(channel)) {
      this.channels.set(channel, new Set());
    }
    this.channels.get(channel)!.add(flowTNodeId);
    
    brainDebug(`Flow ${flowTNodeId} subscribed to channel ${channel}`);
  }

  /**
   * Unsubscribe a flow from a channel
   */
  unsubscribeFromChannel(flowTNodeId: EARS.EntityId, channel: string): void {
    this.channels.get(channel)?.delete(flowTNodeId);
    
    brainDebug(`Flow ${flowTNodeId} unsubscribed from channel ${channel}`);
  }

  /**
   * Unsubscribe a flow from all channels
   */
  unsubscribeFromAllChannels(flowTNodeId: EARS.EntityId): void {
    this.channels.forEach(subscribers => {
      subscribers.delete(flowTNodeId);
    });
  }

  /**
   * Send event from a fire node with routing
   */
  sendFromFireNode(
    sourceFlowId: EARS.EntityId, 
    fireEvent: FireNodeEvent
  ): void {
    const sourceFlow = flowRegistry.findById(sourceFlowId);
    if (!sourceFlow) {
      brainLogger.warn(`Cannot send event from flow ${sourceFlowId}: Flow not found`);
      return;
    }

    const event: RoutedEvent = {
      type: fireEvent.eventType,
      payload: fireEvent.payload,
      routing: {
        origin: {
          flowTNodeId: sourceFlowId,
          flowPath: sourceFlow.path
        }
      }
    };

    // Handle different targeting strategies
    if (fireEvent.target?.scope) {
      this.sendWithScope(sourceFlowId, fireEvent.target.scope, event);
    } else if (fireEvent.target?.channel) {
      this.broadcast(fireEvent.target.channel, event);
    } else if (fireEvent.target?.flow) {
      this.sendToTargetFlow(fireEvent.target.flow, event);
    } else {
      // Default to self scope
      this.sendWithScope(sourceFlowId, 'self', event);
    }
  }

  /**
   * Send event with scope-based routing
   */
  private sendWithScope(
    sourceFlowId: EARS.EntityId, 
    scope: EventScope | EventScope[], 
    event: RoutedEvent
  ): void {
    const scopes = Array.isArray(scope) ? scope : [scope];
    const targetFlows = new Set<FlowInstance>();

    scopes.forEach(s => {
      const flows = this.getFlowsForScope(sourceFlowId, s);
      flows.forEach(f => targetFlows.add(f));
    });

    brainDebug(`Sending event with scope ${scopes.join(', ')}`, {
      sourceFlow: sourceFlowId,
      targetCount: targetFlows.size,
      eventType: event.type
    });

    targetFlows.forEach(flow => this.routeEventToFlow(flow, event));
  }

  /**
   * Get flows based on scope
   */
  private getFlowsForScope(flowTNodeId: EARS.EntityId, scope: EventScope): FlowInstance[] {
    switch (scope) {
      case 'self':
        const self = flowRegistry.findById(flowTNodeId);
        return self ? [self] : [];
      
      case 'children':
        return flowRegistry.getChildren(flowTNodeId);
      
      case 'siblings':
        return flowRegistry.getSiblings(flowTNodeId);
      
      case 'parent':
        const parent = flowRegistry.getParent(flowTNodeId);
        return parent ? [parent] : [];
      
      case 'ancestors':
        return flowRegistry.getAncestors(flowTNodeId);
      
      case 'descendants':
        return flowRegistry.getDescendants(flowTNodeId);
      
      case 'family':
        const family: FlowInstance[] = [];
        const parentFlow = flowRegistry.getParent(flowTNodeId);
        if (parentFlow) family.push(parentFlow);
        family.push(...flowRegistry.getSiblings(flowTNodeId));
        family.push(...flowRegistry.getChildren(flowTNodeId));
        return family;
      
      case 'global':
        return flowRegistry.getAllActive();
      
      case 'channel':
        // Channel routing is handled separately
        return [];
      
      default:
        brainLogger.warn(`Unknown scope: ${scope}`);
        return [];
    }
  }

  /**
   * Send to targeted flow
   */
  private sendToTargetFlow(target: any, event: RoutedEvent): void {
    if (!target) return;

    if (target.id) {
      this.sendToFlow(target.id, event);
    } else if (target.blueprint) {
      this.sendToFlowType(target.blueprint, event);
    } else if (target.path) {
      const flow = flowRegistry.findByPath(target.path);
      if (flow) {
        this.routeEventToFlow(flow, event);
      }
    } else if (target.selector) {
      this.sendToFlows(target.selector, event);
    }
  }

  /**
   * Route event to a specific flow instance
   */
  private routeEventToFlow(flow: FlowInstance, event: RoutedEvent): void {
    try {
      // Send event to the flow's actor
      flow.actor.send({
        type: 'EXTERNAL_EVENT',
        event: event,
        metadata: {
          timestamp: Date.now(),
          source: event.routing?.origin
        }
      });
    } catch (error) {
      const errorInfo = error instanceof Error ? { message: error.message, stack: error.stack } : { error: String(error) };
      brainLogger.error(`Failed to route event to flow ${flow.flowTNodeId}`, errorInfo);
    }
  }

  /**
   * Process queued events
   */
  private processQueue(): void {
    if (this.processing || this.eventQueue.length === 0) return;
    
    this.processing = true;
    
    while (this.eventQueue.length > 0) {
      const event = this.eventQueue.shift();
      if (event) {
        // Process event based on its routing
        // This would be called if we need delayed/scheduled event processing
      }
    }
    
    this.processing = false;
  }

  /**
   * Clear all subscriptions for a flow (called when flow completes)
   */
  cleanupFlow(flowTNodeId: EARS.EntityId): void {
    this.unsubscribeFromAllChannels(flowTNodeId);
    flowRegistry.unregister(flowTNodeId);
  }

  /**
   * Get all active flows (for debugging/monitoring)
   */
  getActiveFlows(): FlowInstance[] {
    return flowRegistry.getAllActive();
  }

  /**
   * Get flow by ID (for external access)
   */
  getFlow(flowTNodeId: EARS.EntityId): FlowInstance | null {
    return flowRegistry.findById(flowTNodeId);
  }
}

// Export singleton instance
export const brainEventBus = new BrainEventBus();