import type { Rows } from '@/shared/types';
import { summarizeTextPrompt } from './prompts/summarize-text';
import { codeReviewPrompt } from './prompts/code-review';
import { qaAssistantPrompt } from './prompts/qa-assistant';

// Combine all prompt data
export const promptRows: Rows = {
  entity: [
    ...summarizeTextPrompt.entity,
    ...codeReviewPrompt.entity,
    ...qaAssistantPrompt.entity,
  ],
  
  role: [
    ...summarizeTextPrompt.role,
    ...codeReviewPrompt.role,
    ...qaAssistantPrompt.role,
  ],
  
  relation: [
    ...summarizeTextPrompt.relation,
    ...codeReviewPrompt.relation,
    ...qaAssistantPrompt.relation,
  ],
};