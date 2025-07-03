import { createAction } from './create';
import { createLogger } from '@/systems/logs/logger';

const logger = createLogger('actions-mock-data');

// Mock service implementations that will be available to action functions
export const mockServices = {
  logger: {
    info: (message: string, data?: any) => Promise.resolve({ logged: true, message, data }),
    error: (message: string, error?: any) => Promise.resolve({ logged: true, message, error }),
    debug: (message: string, data?: any) => Promise.resolve({ logged: true, message, data }),
  },
  
  database: {
    query: (sql: string, params?: any[]) => Promise.resolve({ 
      rows: [{ id: 1, name: 'Mock Result' }], 
      rowCount: 1 
    }),
    insert: (table: string, data: any) => Promise.resolve({ 
      id: Math.random().toString(36).substr(2, 9), 
      success: true 
    }),
    update: (table: string, id: string, data: any) => Promise.resolve({ 
      affected: 1, 
      success: true 
    }),
    delete: (table: string, id: string) => Promise.resolve({ 
      affected: 1, 
      success: true 
    }),
  },
  
  email: {
    send: (to: string, subject: string, body: string) => Promise.resolve({ 
      messageId: `msg-${Date.now()}`, 
      success: true,
      to,
      subject 
    }),
    sendTemplate: (to: string, template: string, data: any) => Promise.resolve({ 
      messageId: `msg-${Date.now()}`, 
      success: true,
      to,
      template 
    }),
  },
  
  http: {
    get: (url: string, options?: any) => Promise.resolve({ 
      status: 200, 
      data: { mock: true, url } 
    }),
    post: (url: string, data: any, options?: any) => Promise.resolve({ 
      status: 201, 
      data: { mock: true, received: data } 
    }),
    put: (url: string, data: any, options?: any) => Promise.resolve({ 
      status: 200, 
      data: { mock: true, updated: data } 
    }),
    delete: (url: string, options?: any) => Promise.resolve({ 
      status: 204, 
      data: null 
    }),
  },
  
  storage: {
    save: (key: string, data: any) => Promise.resolve({ 
      key, 
      size: JSON.stringify(data).length,
      success: true 
    }),
    load: (key: string) => Promise.resolve({ 
      data: { mock: true, key },
      found: true 
    }),
    delete: (key: string) => Promise.resolve({ 
      deleted: true,
      key 
    }),
    list: (prefix?: string) => Promise.resolve({ 
      keys: ['mock-key-1', 'mock-key-2'],
      count: 2 
    }),
  }
};

export function createMockActions() {
  logger.info('Creating mock actions...');
  
  const mockActions = [
    {
      label: 'Save Entity',
      description: 'Saves an entity to the database',
      category: 'database',
      parameters: {
        entityType: {
          name: 'entityType',
          type: 'string' as const,
          required: true,
          description: 'The type of entity to save',
          placeholder: 'e.g., User, Post, Comment'
        },
        data: {
          name: 'data',
          type: 'object' as const,
          required: true,
          description: 'The entity data to save'
        }
      },
      actionFn: `// Save entity to database
const { entityType, data } = params;
const result = await services.database.insert(entityType, data);
await services.logger.info('Entity saved', { entityType, id: result.id });
return result;`,
      output: { id: 'string', success: 'boolean' }
    },
    
    {
      label: 'Send Email',
      description: 'Sends an email notification',
      category: 'communication',
      parameters: {
        to: {
          name: 'to',
          type: 'string' as const,
          required: true,
          description: 'Email recipient',
          placeholder: 'user@example.com'
        },
        subject: {
          name: 'subject',
          type: 'string' as const,
          required: true,
          description: 'Email subject line'
        },
        body: {
          name: 'body',
          type: 'string' as const,
          required: true,
          description: 'Email body content'
        }
      },
      actionFn: `// Send email notification
const { to, subject, body } = params;
const result = await services.email.send(to, subject, body);
await services.logger.info('Email sent', { to, messageId: result.messageId });
return result;`,
      output: { messageId: 'string', success: 'boolean' }
    },
    
    {
      label: 'HTTP Request',
      description: 'Makes an HTTP request to external API',
      category: 'integration',
      parameters: {
        method: {
          name: 'method',
          type: 'string' as const,
          required: true,
          description: 'HTTP method',
          placeholder: 'GET, POST, PUT, DELETE'
        },
        url: {
          name: 'url',
          type: 'string' as const,
          required: true,
          description: 'Request URL',
          placeholder: 'https://api.example.com/endpoint'
        },
        data: {
          name: 'data',
          type: 'object' as const,
          required: false,
          description: 'Request body data (for POST/PUT)'
        },
        headers: {
          name: 'headers',
          type: 'object' as const,
          required: false,
          description: 'Request headers'
        }
      },
      actionFn: `// Make HTTP request
const { method, url, data, headers } = params;
let result;

switch (method.toUpperCase()) {
  case 'GET':
    result = await services.http.get(url, { headers });
    break;
  case 'POST':
    result = await services.http.post(url, data, { headers });
    break;
  case 'PUT':
    result = await services.http.put(url, data, { headers });
    break;
  case 'DELETE':
    result = await services.http.delete(url, { headers });
    break;
  default:
    throw new Error(\`Unsupported method: \${method}\`);
}

await services.logger.info('HTTP request completed', { method, url, status: result.status });
return result;`,
      output: { status: 'number', data: 'any' }
    },
    
    {
      label: 'Log Message',
      description: 'Logs a message with optional data',
      category: 'utility',
      parameters: {
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
      actionFn: `// Log message
const { level, message, data } = params;

switch (level) {
  case 'error':
    return await services.logger.error(message, data);
  case 'debug':
    return await services.logger.debug(message, data);
  case 'info':
  default:
    return await services.logger.info(message, data);
}`,
      output: { logged: 'boolean', message: 'string' }
    },
    
    {
      label: 'Store Data',
      description: 'Stores data in persistent storage',
      category: 'storage',
      parameters: {
        key: {
          name: 'key',
          type: 'string' as const,
          required: true,
          description: 'Storage key',
          placeholder: 'my-data-key'
        },
        data: {
          name: 'data',
          type: 'any' as const,
          required: true,
          description: 'Data to store'
        },
        ttl: {
          name: 'ttl',
          type: 'number' as const,
          required: false,
          description: 'Time to live in seconds'
        }
      },
      actionFn: `// Store data
const { key, data, ttl } = params;
const result = await services.storage.save(key, { data, ttl, timestamp: Date.now() });
await services.logger.info('Data stored', { key, size: result.size });
return result;`,
      output: { key: 'string', size: 'number', success: 'boolean' }
    }
  ];
  
  mockActions.forEach(action => {
    createAction(action);
  });
  
  logger.info(`Created ${mockActions.length} mock actions`);
}