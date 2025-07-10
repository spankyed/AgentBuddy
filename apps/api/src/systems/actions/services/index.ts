/**
 * Services Index
 * Exports all services and related functionality
 */

// Export types
export * from './types';

// Import individual services
import { createLoggerService, loggerServiceMetadata } from './logger';
import { createDatabaseService, databaseServiceMetadata } from './database';
import { createEmailService, emailServiceMetadata } from './email';
import { createHttpService, httpServiceMetadata } from './http';
import { createStorageService, storageServiceMetadata } from './storage';

import type { Services, ServiceMetadata } from './types';

/**
 * Creates a complete set of services for use in actions
 */
export function createServices(): Services {
  return {
    logger: createLoggerService(),
    database: createDatabaseService(),
    email: createEmailService(),
    http: createHttpService(),
    storage: createStorageService()
  };
}

/**
 * Default services instance
 */
export const services: Services = createServices();

/**
 * Service metadata for all available services
 * Can be used to generate actions from services
 */
export const serviceMetadata: Record<string, ServiceMetadata> = {
  logger: loggerServiceMetadata,
  database: databaseServiceMetadata,
  email: emailServiceMetadata,
  http: httpServiceMetadata,
  storage: storageServiceMetadata
};

/**
 * Helper to generate action definitions from service metadata
 * This demonstrates how services can be converted to actions
 */
export function generateActionsFromServices(): Array<{
  label: string;
  description: string;
  category: string;
  input: Record<string, any>;
  actionFn: string;
  output?: any;
}> {
  const actions: any[] = [];

  Object.entries(serviceMetadata).forEach(([serviceName, metadata]) => {
    metadata.methods.forEach(method => {
      const parameterDefs: Record<string, any> = {};
      
      method.input.forEach(param => {
        parameterDefs[param.name] = {
          name: param.name,
          type: param.type.includes('|') ? 'any' : param.type,
          required: param.required,
          description: param.description,
          default: param.default
        };
      });

      const action = {
        label: `${metadata.name}.${method.name}`,
        description: method.description,
        category: metadata.category,
        input: parameterDefs,
        actionFn: createActionFunction(serviceName, method),
        output: method.returns
      };

      actions.push(action);
    });
  });

  return actions;
}

/**
 * Creates an action function string from service method metadata
 */
function createActionFunction(serviceName: string, method: any): string {
  const paramNames = method.input.map((p: any) => p.name).join(', ');
  const hasInput = method.input.length > 0;
  
  let functionBody = `// ${method.description}\n`;
  
  if (hasInput) {
    functionBody += `const { ${paramNames} } = params;\n\n`;
  }
  
  if (method.example) {
    functionBody += `// Example usage:\n// ${method.example.split('\n').join('\n// ')}\n\n`;
  }
  
  functionBody += `const result = await services.${serviceName}.${method.name}(${hasInput ? paramNames : ''});\n`;
  functionBody += `return result;`;
  
  return functionBody;
}

// Re-export individual service factories
export {
  createLoggerService,
  createDatabaseService,
  createEmailService,
  createHttpService,
  createStorageService
};