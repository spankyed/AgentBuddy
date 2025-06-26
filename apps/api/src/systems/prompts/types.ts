/**
 * Prompt template types and definitions
 */

/**
 * Defines a parameter that a prompt template expects
 */
export interface PromptTemplateParam {
  name: string;                    // Parameter name (e.g., "filename", "content")
  description?: string;            // Human-readable description
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required?: boolean;              // Default true
  defaultValue?: any;              // Default value if not provided
}

/**
 * Defines a prompt template
 */
export interface PromptTemplate {
  id: string;                      // Unique identifier
  name: string;                    // Display name
  description?: string;            // What this template does
  category?: string;               // Category for organization (e.g., "code", "analysis", "generation")
  
  // The template function that generates the prompt
  // Parameters are passed as a key-value object
  templateFn: (params: Record<string, any>) => string;
  
  // Define what parameters this template expects
  params: PromptTemplateParam[];
  
  // Example usage
  example?: {
    params: Record<string, any>;
    output: string;
  };
}

/**
 * Registry to store all available prompt templates
 */
export const promptTemplateRegistry: Map<string, PromptTemplate> = new Map();

/**
 * Helper to register a prompt template
 */
export function registerPromptTemplate(template: PromptTemplate): void {
  promptTemplateRegistry.set(template.id, template);
}

/**
 * Defines how a step's output is mapped to a prompt template parameter
 */
export interface InputMapping {
  // The parameter name in the prompt template
  paramName: string;
  
  // Source of the input value
  source: {
    type: 'previousStep' | 'eventPayload' | 'static' | 'expression' | 'context';
    
    // For previousStep: the step ID to get the result from
    stepId?: string;
    
    // For static: the static value
    value?: any;
    
    // For expression or context: a path to extract value
    // For context type, examples:
    // - "previousResults[0].result" (first step's result)
    // - "previousResults.find(r => r.stepLabel === 'Process User Message').result"
    // - "eventPayload.userId"
    // - Any valid JavaScript property access path
    path?: string;
  };
  
  // Optional transformation
  transform?: 'toString' | 'toNumber' | 'toBoolean' | 'toJSON';
}

/**
 * Configuration for using a prompt template in an LLM node
 */
export interface PromptConfig {
  // Either use a template or a static prompt
  type: 'template' | 'static';
  
  // For template type
  templateId?: string;
  inputMappings?: InputMapping[];
  
  // For static type (backward compatibility)
  staticPrompt?: string;
} 