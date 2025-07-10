import type { LoggerService, LogResult, ServiceMetadata } from './types';

/**
 * Logger Service Implementation
 * Provides logging capabilities for actions
 */
export class LoggerServiceImpl implements LoggerService {
  async info(message: string, data?: any): Promise<LogResult> {
    return {
      logged: true,
      message,
      level: 'info',
      timestamp: Date.now(),
      data
    };
  }

  async error(message: string, error?: any): Promise<LogResult> {
    return {
      logged: true,
      message,
      level: 'error',
      timestamp: Date.now(),
      error
    };
  }

  async debug(message: string, data?: any): Promise<LogResult> {
    return {
      logged: true,
      message,
      level: 'debug',
      timestamp: Date.now(),
      data
    };
  }

  async warn(message: string, data?: any): Promise<LogResult> {
    return {
      logged: true,
      message,
      level: 'warn',
      timestamp: Date.now(),
      data
    };
  }
}

// Service metadata for potential action generation
export const loggerServiceMetadata: ServiceMetadata = {
  name: 'logger',
  description: 'Logging service for recording messages and events',
  category: 'utility',
  methods: [
    {
      name: 'info',
      description: 'Log an informational message',
      input: [
        {
          name: 'message',
          type: 'string',
          required: true,
          description: 'The message to log'
        },
        {
          name: 'data',
          type: 'any',
          required: false,
          description: 'Additional data to log with the message'
        }
      ],
      returns: 'LogResult',
      example: `await services.logger.info('User logged in', { userId: user.id });`
    },
    {
      name: 'error',
      description: 'Log an error message',
      input: [
        {
          name: 'message',
          type: 'string',
          required: true,
          description: 'The error message to log'
        },
        {
          name: 'error',
          type: 'any',
          required: false,
          description: 'The error object or additional error details'
        }
      ],
      returns: 'LogResult',
      example: `await services.logger.error('Failed to process payment', error);`
    },
    {
      name: 'debug',
      description: 'Log a debug message',
      input: [
        {
          name: 'message',
          type: 'string',
          required: true,
          description: 'The debug message to log'
        },
        {
          name: 'data',
          type: 'any',
          required: false,
          description: 'Additional debug data'
        }
      ],
      returns: 'LogResult',
      example: `await services.logger.debug('Processing step 3', { step: 3, data: stepData });`
    },
    {
      name: 'warn',
      description: 'Log a warning message',
      input: [
        {
          name: 'message',
          type: 'string',
          required: true,
          description: 'The warning message to log'
        },
        {
          name: 'data',
          type: 'any',
          required: false,
          description: 'Additional warning context'
        }
      ],
      returns: 'LogResult',
      example: `await services.logger.warn('API rate limit approaching', { remaining: 10 });`
    }
  ]
};

// Factory function for creating logger service
export function createLoggerService(): LoggerService {
  return new LoggerServiceImpl();
}