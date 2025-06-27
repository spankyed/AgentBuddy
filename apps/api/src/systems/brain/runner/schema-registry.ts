import type { EventSchema, StepOutputSchema } from '@/systems/brain/types';

/**
 * Schema Registry - Single source of truth for data shapes
 * In a real system, these would be stored in a database and managed via UI
 * 
 * IMPORTANT: Event structures after entering the system:
 * - Original event: { type: 'user.message', payload: 'Hello', userId: '123' }
 * - In execution context: eventPayload = { payload: 'Hello', userId: '123' }
 * - Field mapping path: $.eventPayload.payload
 * 
 * - Original event: { type: 'user.message', message: 'Hello', userId: '123' }  
 * - In execution context: eventPayload = { message: 'Hello', userId: '123' }
 * - Field mapping path: $.eventPayload.message
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

// Step output schemas define what data each step produces
export const stepOutputSchemas: Record<string, StepOutputSchema> = {
  'Process User Message': {
    stepId: 'process-user-message',
    stepLabel: 'Process User Message',
    description: 'Analyzes user message and extracts intent',
    fields: {
      summary: {
        name: 'summary',
        type: 'string',
        description: 'Summary of the user message',
      },
      intent: {
        name: 'intent',
        type: 'string',
        description: 'Identified user intent',
      },
      entities: {
        name: 'entities',
        type: 'array',
        description: 'Extracted entities',
        items: {
          name: 'entity',
          type: 'string',
        },
      },
      category: {
        name: 'category',
        type: 'string',
        description: 'Message category',
      },
      urgency: {
        name: 'urgency',
        type: 'string',
        description: 'Urgency level',
      },
    },
  },
};

// Helper to get schema for an event type
export function getEventSchema(eventType: string): EventSchema | undefined {
  return eventSchemas[eventType];
}

// Helper to get schema for a step
export function getStepOutputSchema(stepLabel: string): StepOutputSchema | undefined {
  return stepOutputSchemas[stepLabel];
} 