import { createLogger } from '@/core/shared/debug/logger';
import { tidyFunction } from '@/core/shared/tidy-function';

const nowMs = Date.now();

const loggerService = createLogger('log-service');

const actionLog = tidyFunction(`
  const { level, message, data } = params;

  switch (level) {
    case 'error':
      return await services.logger.error(message, data);
    case 'debug':
      return await services.logger.debug(message, data);
    case 'info':
    default:
      return await services.logger.info(message, data);
  }
`);

const loggerAction = {
  id: 'Action-log-message',
  label: 'Log Message',
  description: 'Logs a message with optional data',
  category: 'utility',
  input: {
    level: {
      name: 'level',
      type: 'string' as const,
      required: true,
      description: 'Log level',
      placeholder: 'info, error, debug',
      default: 'info'
    },
    message: {
      name: 'message',
      type: 'string' as const,
      required: true,
      description: 'Log message'
    },
    data: {
      name: 'data',
      type: 'object' as const,
      required: false,
      description: 'Additional data to log'
    }
  },
  actionFn: actionLog,
  output: { logged: 'boolean', message: 'string' },
  updatedAt: nowMs - 70
};

export {
  loggerService,
  loggerAction
}
