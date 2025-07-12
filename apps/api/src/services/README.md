# Action Services Architecture

## Overview

The services folder contains modular, extensible service implementations that are available to action functions. These services provide common functionality like logging, database operations, email sending, HTTP requests, and storage.

## Architecture Principles

1. **Interface-First Design**: Each service is defined by a TypeScript interface, ensuring consistent contracts
2. **Pluggable Implementations**: Service implementations can be easily swapped out for different environments
3. **Service as Actions**: Services can be automatically converted to actions, making them reusable primitives
4. **Metadata-Driven**: Each service includes metadata that describes its methods, parameters, and usage

## Services Available

### Logger Service (`logger.ts`)
- `info(message, data?)`: Log informational messages
- `error(message, error?)`: Log errors
- `debug(message, data?)`: Log debug information
- `warn(message, data?)`: Log warnings

### Database Service (`database.ts`)
- `query(sql, params?)`: Execute SQL queries
- `insert(table, data)`: Insert records
- `update(table, id, data)`: Update records
- `delete(table, id)`: Delete records
- `transaction(operations)`: Execute transactional operations

### Email Service (`email.ts`)
- `send(to, subject, body, options?)`: Send simple emails
- `sendTemplate(to, templateId, data, options?)`: Send templated emails
- `sendBulk(recipients, options?)`: Send bulk emails

### HTTP Service (`http.ts`)
- `get(url, options?)`: Make GET requests
- `post(url, data?, options?)`: Make POST requests
- `put(url, data?, options?)`: Make PUT requests
- `patch(url, data?, options?)`: Make PATCH requests
- `delete(url, options?)`: Make DELETE requests
- `head(url, options?)`: Get headers only

### Storage Service (`storage.ts`)
- `save(key, data, options?)`: Store data
- `load(key)`: Retrieve data
- `delete(key)`: Delete data
- `list(prefix?, options?)`: List keys
- `exists(key)`: Check if key exists
- `getMetadata(key)`: Get storage metadata

## Usage in Actions

```javascript
// In an action function
const { userId, message } = params;

// Use multiple services
await services.logger.info('Processing user action', { userId });

const user = await services.database.query(
  'SELECT * FROM users WHERE id = ?', 
  [userId]
);

await services.email.send(
  user.email,
  'Action Completed',
  message
);

return { success: true };
```

## Service Metadata

Each service exports metadata that describes its capabilities:

```typescript
export const loggerServiceMetadata: ServiceMetadata = {
  name: 'logger',
  description: 'Logging service for recording messages and events',
  category: 'utility',
  methods: [
    {
      name: 'info',
      description: 'Log an informational message',
      parameters: [...],
      returns: 'LogResult',
      example: '...'
    }
  ]
};
```

## Generating Actions from Services

The `action-generator.ts` utility can automatically create action definitions from service metadata:

```typescript
import { generateActionsFromServices } from './services/action-generator';

const actions = generateActionsFromServices();
// Returns array of action definitions ready to be created
```

## Extending Services

To add a new service:

1. Define the interface in `types.ts`
2. Create the implementation file (e.g., `my-service.ts`)
3. Export from `index.ts`
4. Update the `Services` interface

## Future Enhancements

1. **Production Implementations**: Integrate with real external services (databases, email providers, etc.)
2. **Service Discovery**: Dynamic service registration and discovery
3. **Service Composition**: Build complex services from simpler ones
4. **Dependency Injection**: Proper DI for service dependencies
5. **Service Versioning**: Support multiple versions of services
6. **Service Testing**: Comprehensive test suites for each service
7. **Service Configuration**: Environment-based service configuration
8. **Service Monitoring**: Built-in metrics and monitoring for service usage