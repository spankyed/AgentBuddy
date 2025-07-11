import type { EventSchema, StepOutputSchema } from '@/systems/brain/types';

/**
 * Schema Registry - Single source of truth for data shapes
 * In a real system, these would be stored in a database and managed via UI
 * 
 * IMPORTANT: Event structures in the new system:
 * - Original event: { type: 'user.message', payload: 'Hello', userId: '123' }
 * - In execution context: event.data = { payload: 'Hello', userId: '123' }
 * - Field mapping path: $.event.data.payload
 * 
 * The cleaner structure avoids the confusing eventPayload.payload nesting
 */

// Event schemas define what data each event type provides
export const eventSchemas: Record<string, EventSchema> = {
  'user.message': {
    eventType: 'user.message',
    description: 'User sends a message',
    fields: {
      payload: {
        name: 'payload',
        type: 'string',
        description: 'The user\'s message text',
        required: true,
      },
      userId: {
        name: 'userId',
        type: 'string',
        description: 'ID of the user sending the message',
        required: false,
      },
      context: {
        name: 'context',
        type: 'string',
        description: 'Additional context about the message',
        required: false,
      },
    },
  },
  'database.query.prompt': {
    eventType: 'database.query.prompt',
    description: 'Request to generate a database query',
    fields: {
      query: {
        name: 'query',
        type: 'string',
        description: 'Natural language query request',
        required: true,
      },
      context: {
        name: 'context',
        type: 'object',
        description: 'Additional context for the query',
        required: false,
      },
    },
  },
};


// Helper to get schema for an event type
export function getEventSchema(eventType: string): EventSchema | undefined {
  return eventSchemas[eventType];
}

