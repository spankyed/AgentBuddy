import type { EARS } from '@/core/types';
import type { ActorRef } from 'xstate';

/**
 * Event scoping defines how events propagate through the flow hierarchy
 */
export type EventScope = 
  | 'self'        // Only within the current flow instance
  | 'children'    // Direct children only
  | 'siblings'    // Sibling flows at same level
  | 'parent'      // Direct parent flow
  | 'ancestors'   // Bubble up through parent chain
  | 'descendants' // All nested flows below
  | 'family'      // Parent + siblings + children
  | 'global'      // System-wide broadcast
  | 'channel';    // Named pub/sub channel

/**
 * Identifies a specific flow instance or set of instances
 */
export interface FlowAddress {
  // Direct targeting
  flowTNodeId?: EARS.EntityId;    // Specific flow instance (TNode)
  flowId?: EARS.EntityId;         // Flow blueprint ID (targets all instances)
  
  // Hierarchical path
  flowPath?: string;               // "/root/flowA/childB" (instance path)
  
  // Tagged targeting
  tags?: string[];                 // Target flows with specific tags
  sessionId?: string;              // Target flows in a session/context
  userId?: string;                 // Target user-specific flow instances
}

/**
 * Configuration for how events are routed
 */
export interface EventRoutingConfig {
  scope?: EventScope | EventScope[];  // Can target multiple scopes
  channel?: string;                    // For channel-based routing
  filter?: {
    flowType?: string;                 // Only flows of specific type
    tags?: string[];                   // Flows with specific tags
    depth?: number;                    // Max traversal depth
  };
  bubbles?: boolean;                   // Allow event bubbling up
  captures?: boolean;                  // Allow event capturing down
  stopPropagation?: boolean;          // Stop after first handler
}

/**
 * A routed event that can be sent between flows
 */
export interface RoutedEvent {
  type: string;                        // Event type/name
  payload?: any;                       // Event data
  
  // Targeting
  target?: {
    flowAddress?: FlowAddress;         // Where to send
    scope?: EventScope;                // How to propagate from target
    broadcast?: boolean;               // Send to all matching flows
  };
  
  // Routing metadata
  routing?: {
    origin?: FlowAddress;              // Where event came from
    channel?: string;                  // Pub/sub channel
    priority?: 'low' | 'normal' | 'high';
    ttl?: number;                      // Time to live (ms)
    trace?: boolean;                   // Enable routing trace
  };
  
  // Security
  auth?: {
    token?: string;                    // Auth token for external events
    permissions?: string[];            // Required permissions
  };
}

/**
 * Selector for finding flows
 */
export interface FlowSelector {
  flowId?: EARS.EntityId;             // Blueprint ID
  tags?: string[];                     // Has all tags
  status?: 'active' | 'paused' | 'completed';
  parentId?: EARS.EntityId;           // Children of specific parent
  depth?: { min?: number; max?: number };
  metadata?: Record<string, any>;
}

/**
 * Represents an active flow instance
 */
export interface FlowInstance {
  flowTNodeId: EARS.EntityId;         // Instance ID
  flowId: EARS.EntityId;              // Blueprint ID  
  path: string;                        // Hierarchical path
  parentId?: EARS.EntityId;           // Parent instance
  status: 'active' | 'paused' | 'completed';
  metadata: {
    label: string;
    tags: string[];
    userId?: string;
    sessionId?: string;
    startedAt: number;
    custom?: Record<string, any>;
  };
  actor: ActorRef<any, any>;           // XState actor reference
}

/**
 * Event authorization configuration
 */
export interface EventAuthorization {
  // Who can send events to this flow
  allowedSenders?: {
    flows?: string[];                  // Specific flow IDs
    users?: string[];                  // User IDs
    roles?: string[];                  // User roles
    external?: boolean;                // Allow external events
  };
  
  // What events are allowed
  allowedEvents?: {
    whitelist?: string[];              // Only these events
    blacklist?: string[];              // Block these events
    patterns?: RegExp[];               // Pattern matching
  };
  
  // Rate limiting
  rateLimit?: {
    maxPerMinute?: number;
    maxPerHour?: number;
    burstSize?: number;
  };
}

/**
 * Event sent from fire nodes with routing
 */
export interface FireNodeEvent {
  eventType: string;
  payload?: any;
  target?: {
    // Target specific flow(s)
    flow?: {
      id?: EARS.EntityId;              // Specific instance
      blueprint?: EARS.EntityId;       // All instances of blueprint
      path?: string;                   // By path
      selector?: FlowSelector;         // Complex selection
    };
    
    // Or use scope-based routing
    scope?: EventScope | EventScope[];
    
    // Or use channel
    channel?: string;
  };
}