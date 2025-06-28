/**
 * Prompt template types and definitions
 */

/**
 * Defines an input that a template expects
 */
export interface TemplateInput {
  name: string;                    // Input name (e.g., "userMessage")
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any';
  description?: string;            // What this input is for
  required?: boolean;              // Default true
  defaultValue?: any;              // Default if not provided
  
  // Hints for UI/mapping system
  commonSources?: string[];        // Common paths this might come from
  example?: any;                   // Example value
}

/**
 * Defines a prompt template
 */
export interface PromptTemplate {
  id: string;                      // Unique identifier
  name: string;                    // Display name
  description?: string;            // What this template does
  category?: string;               // Category for organization
  
  // Declare expected inputs - this connects templates to the mapping system
  inputs: Record<string, TemplateInput>;
  
  // The template function that generates the prompt
  // Receives mapped parameters based on declared inputs
  templateFn: (params: Record<string, any>) => string;
  
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
  // Validate that all required inputs have defaults or are marked required
  for (const [name, input] of Object.entries(template.inputs)) {
    if (input.required !== false && input.defaultValue === undefined) {
      console.warn(`Template ${template.id}: Input '${name}' is required but has no default`);
    }
  }
  
  promptTemplateRegistry.set(template.id, template);
}

/**
 * Get a template and validate params match expected inputs
 */
export function getTemplateWithValidation(
  templateId: string,
  params: Record<string, any>
): { template: PromptTemplate; errors: string[] } | null {
  const template = promptTemplateRegistry.get(templateId);
  if (!template) return null;
  
  const errors: string[] = [];
  
  // Check required inputs
  for (const [name, input] of Object.entries(template.inputs)) {
    if (input.required !== false && !(name in params) && input.defaultValue === undefined) {
      errors.push(`Missing required input: ${name}`);
    }
  }
  
  // Warn about unknown params
  for (const paramName of Object.keys(params)) {
    if (!(paramName in template.inputs)) {
      errors.push(`Unknown parameter: ${paramName}`);
    }
  }
  
  return { template, errors };
} 