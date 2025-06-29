import type { Rows } from '@/shared/types';
import { summarizeTextPrompt } from './summarize-text';
import { codeReviewPrompt } from './code-review';
import { qaAssistantPrompt } from './qa-assistant';
import { composeData } from '@/systems/_backend/mock-data';

// Combine all prompt data
export const promptRows: Rows = composeData([
  summarizeTextPrompt,
  codeReviewPrompt,
  qaAssistantPrompt,
]);