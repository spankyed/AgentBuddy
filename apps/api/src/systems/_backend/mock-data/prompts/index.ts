import type { Rows } from '@/shared/types';
import { summarizeTextPrompt } from './summarize-text';
import { codeReviewPrompt } from './code-review';
import { qaAssistantPrompt } from './qa-assistant';
import { translateTextPrompt } from './translate-text';
import { sentimentAnalysisPrompt } from './sentiment-analysis';
import { brainstormIdeasPrompt } from './brainstorm-ideas';
import { composeData } from '@/systems/_backend/mock-data';

// Combine all prompt data
export const promptRows: Rows = composeData([
  summarizeTextPrompt,
  codeReviewPrompt,
  qaAssistantPrompt,
  translateTextPrompt,
  sentimentAnalysisPrompt,
  brainstormIdeasPrompt,
]);