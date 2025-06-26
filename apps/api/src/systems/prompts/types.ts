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
  // Always receives a 'context' parameter with execution data
  // Can receive additional custom parameters
  templateFn: (params: Record<string, any>) => string;
  
  // Define what custom parameters this template expects (besides context)
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