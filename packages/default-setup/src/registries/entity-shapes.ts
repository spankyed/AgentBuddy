/**
 * Entity shape registry augmentation.
 *
 * Maps EARS entity type strings to their attribute interfaces so that
 * type-aware utilities (EntityShape<E>, typed QueryBuilder, branded EntityId)
 * can infer shapes automatically without explicit generic parameters.
 *
 * Import this file (side-effect) to activate the augmentation:
 *   import '@app/default-setup/src/registries/entity-shapes';
 */

declare module '@abuddy/sdk/types' {
  interface EntityShapeRegistry {
    'Action': {
      label: string;
      description?: string;
      category?: string;
      input: Record<string, unknown>;
      actionFn: string;
      output?: unknown;
      sourceHash?: string;
    };
    'Prompt': {
      label: string;
      description?: string;
      templateFn: string;
      sourceHash?: string;
    };
    'Thread': {
      topic: string;
      instructions?: string;
      sideTopics?: string[];
      timestamp: number;
      lastMessageTimestamp?: number;
      lastVisitedTimestamp?: number;
      shortCode: string;
      status: string;
      tags?: string[];
      forcedMode?: string;
      pinned?: boolean;
      archived?: boolean;
      chatState?: string;
      context?: Record<string, unknown>;
    };
    'Flow': {
      label: string;
      description?: string;
      shortCode: string;
      flowType: 'workflow' | 'integration';
      sourceHash?: string;
    };
    'Document': {
      name: string;
      content: Array<{ type: string; [key: string]: unknown }>;
      shortCode: string;
      displayOrder?: number;
      tags?: string[];
      sourceHash?: string;
    };
    'CalendarEvent': {
      title: string;
      start: string;
      end?: string;
      allDay?: boolean;
      description?: string;
      color?: string;
    };
    'Note': {
      title: string;
      content: string;
      sourceHash?: string;
    };
    'Message': {
      role: string;
      content: string;
      timestamp: number;
      model?: string;
      toolCalls?: unknown[];
    };
  }
}

export {};
