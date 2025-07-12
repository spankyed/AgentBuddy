import type OpenAI from 'openai';
import type { StreamHandler } from './runner';
import { createLogger } from '@/shared/debug/logger';

const logger = createLogger('openai-stream');

/**
 * Handles OpenAI stream events and processes them according to their type
 */
export const handleOpenAIStream: StreamHandler<OpenAI.Responses.ResponseStreamEvent> = (event, callback) => {
  // Log the event type for debugging
  // console.log(`Processing event type: ${event.type}`);

  switch (event.type) {
    case 'response.created':
    case 'response.in_progress': // These events indicate the start of a response but don't contain content to stream
      return true;

    case 'response.output_item.added': // A new message item is being added to the output
      // We could potentially send an event to initialize a new message container
      return true;

    case 'response.content_part.added': // A new content part is being added to an output item
      // This is typically followed by delta events
      return true;

    case 'response.output_text.delta': // This is the actual text content being streamed
    if ('delta' in event && typeof event.delta === 'string') {
        callback(event.delta);
        return true;
      }
      return false;

    case 'response.output_text.done': // The text content for this part is complete
      
      return true;

    case 'response.content_part.done': // A content part is complete
      
      return true;

    case 'response.output_item.done': // An output item (like a message) is complete
      
      return true;

    case 'response.completed': // The entire response is complete
      // callback(event.delta);
      // agentSys.send({
      //   type: 'LLM_DONE'
      // });
      return true;

    default:
      logger.warn(`Unhandled event type: ${event.type}`);
      return false;
  }
}
