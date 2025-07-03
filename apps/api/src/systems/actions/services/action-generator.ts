/**
 * Action Generator from Services
 * Automatically creates action definitions from service metadata
 */

import { generateActionsFromServices, serviceMetadata } from './index';
import type { ActionParameter } from '../types';

/**
 * Convert service parameter types to action parameter types
 */
function convertParameterType(type: string): ActionParameter['type'] {
  // Handle union types
  if (type.includes('|')) {
    return 'any';
  }
  
  // Map common types
  switch (type.toLowerCase()) {
    case 'string':
    case 'string[]':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'object':
    case 'record':
      return 'object';
    case 'array':
    case 'any[]':
      return 'array';
    default:
      return 'any';
  }
}

/**
 * Generate a single action from a service method
 */
export function generateActionFromServiceMethod(
  serviceName: string,
  methodName: string
): {
  label: string;
  description: string;
  category: string;
  parameters: Record<string, ActionParameter>;
  actionFn: string;
  output?: any;
} | null {
  const service = serviceMetadata[serviceName];
  if (!service) {
    return null;
  }

  const method = service.methods.find(m => m.name === methodName);
  if (!method) {
    return null;
  }

  // Build parameter definitions
  const parameters: Record<string, ActionParameter> = {};
  method.parameters.forEach(param => {
    parameters[param.name] = {
      name: param.name,
      type: convertParameterType(param.type),
      required: param.required,
      description: param.description,
      default: param.default
    };
  });

  // Build action function
  const paramNames = method.parameters.map(p => p.name).join(', ');
  const hasParams = method.parameters.length > 0;
  
  let actionFn = `// ${method.description}\n`;
  if (hasParams) {
    actionFn += `const { ${paramNames} } = params;\n\n`;
  }
  
  // Add example as comment if available
  if (method.example) {
    const exampleLines = method.example.split('\n');
    actionFn += `// Example:\n`;
    exampleLines.forEach(line => {
      actionFn += `// ${line}\n`;
    });
    actionFn += `\n`;
  }
  
  // Add the actual service call
  actionFn += `try {\n`;
  actionFn += `  const result = await services.${serviceName}.${method.name}(${hasParams ? paramNames : ''});\n`;
  actionFn += `  \n`;
  actionFn += `  // Log the operation\n`;
  actionFn += `  await services.logger.info('${service.name}.${method.name} completed', { ${hasParams ? paramNames + ', ' : ''}result });\n`;
  actionFn += `  \n`;
  actionFn += `  return result;\n`;
  actionFn += `} catch (error) {\n`;
  actionFn += `  await services.logger.error('${service.name}.${method.name} failed', error);\n`;
  actionFn += `  throw error;\n`;
  actionFn += `}`;

  return {
    label: `${service.name}.${method.name}`,
    description: method.description,
    category: service.category,
    parameters,
    actionFn,
    output: method.returns
  };
}

/**
 * Generate example composite actions that use multiple services
 */
export function generateCompositeActions(): Array<{
  label: string;
  description: string;
  category: string;
  parameters: Record<string, ActionParameter>;
  actionFn: string;
  output?: any;
}> {
  return [
    {
      label: 'User Registration Flow',
      description: 'Complete user registration with email notification',
      category: 'composite',
      parameters: {
        email: {
          name: 'email',
          type: 'string',
          required: true,
          description: 'User email address'
        },
        name: {
          name: 'name',
          type: 'string',
          required: true,
          description: 'User full name'
        },
        password: {
          name: 'password',
          type: 'string',
          required: true,
          description: 'User password'
        }
      },
      actionFn: `// Complete user registration flow
const { email, name, password } = params;

try {
  // Create user in database
  const user = await services.database.insert('users', {
    email,
    name,
    password_hash: password, // In production, hash the password
    created_at: new Date(),
    verified: false
  });
  
  // Generate verification token
  const token = Math.random().toString(36).substr(2, 32);
  await services.storage.save(\`verification-\${token}\`, {
    userId: user.id,
    email,
    expires: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
  });
  
  // Send welcome email
  await services.email.sendTemplate(email, 'welcome-email', {
    name,
    verificationLink: \`https://example.com/verify?token=\${token}\`
  });
  
  // Log the registration
  await services.logger.info('New user registered', {
    userId: user.id,
    email
  });
  
  return {
    success: true,
    userId: user.id,
    message: 'Registration successful. Please check your email to verify your account.'
  };
} catch (error) {
  await services.logger.error('User registration failed', { email, error });
  throw error;
}`,
      output: {
        success: 'boolean',
        userId: 'string',
        message: 'string'
      }
    },
    {
      label: 'Fetch and Cache API Data',
      description: 'Fetch data from external API and cache it',
      category: 'composite',
      parameters: {
        endpoint: {
          name: 'endpoint',
          type: 'string',
          required: true,
          description: 'API endpoint path'
        },
        cacheKey: {
          name: 'cacheKey',
          type: 'string',
          required: true,
          description: 'Cache storage key'
        },
        ttl: {
          name: 'ttl',
          type: 'number',
          required: false,
          description: 'Cache time-to-live in seconds',
          default: 3600
        }
      },
      actionFn: `// Fetch data from API and cache it
const { endpoint, cacheKey, ttl = 3600 } = params;

try {
  // Check cache first
  const cached = await services.storage.load(cacheKey);
  if (cached.found) {
    await services.logger.info('Cache hit', { cacheKey });
    return cached.data;
  }
  
  // Fetch from API
  const response = await services.http.get(\`https://api.example.com\${endpoint}\`);
  
  if (response.status !== 200) {
    throw new Error(\`API request failed with status \${response.status}\`);
  }
  
  // Cache the response
  await services.storage.save(cacheKey, response.data, { ttl });
  
  // Log the operation
  await services.logger.info('Data fetched and cached', {
    endpoint,
    cacheKey,
    ttl
  });
  
  return response.data;
} catch (error) {
  await services.logger.error('Failed to fetch and cache data', {
    endpoint,
    cacheKey,
    error
  });
  throw error;
}`,
      output: 'any'
    }
  ];
}

/**
 * Get all available action templates
 */
export function getAllActionTemplates() {
  const serviceActions = generateActionsFromServices();
  const compositeActions = generateCompositeActions();
  
  return {
    serviceActions,
    compositeActions,
    total: serviceActions.length + compositeActions.length
  };
}