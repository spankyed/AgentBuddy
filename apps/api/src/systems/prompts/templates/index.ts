/**
 * Central registration of all prompt templates
 */

// Import all template modules to ensure they register themselves
import './file';
import './user-message-analysis';
import './format-response';
import './summary-template';

// Re-export templates for convenience
export { filePromptTemplate } from './file';
export { userMessageAnalysisTemplate } from './user-message-analysis';
export { formatResponseTemplate } from './format-response';
export { summaryTemplate } from './summary-template';

// Export the registry for access
export { promptTemplateRegistry } from '../types'; 