import type { Rows } from '@/core/types';
import { summarizeTextPrompt } from './summarize-text';
import { codeReviewPrompt } from './code-review';
import { qaAssistantPrompt } from './qa-assistant';
import { translateTextPrompt } from './translate-text';
import { sentimentAnalysisPrompt } from './sentiment-analysis';
import { brainstormIdeasPrompt } from './brainstorm-ideas';
import { userMessageAnalysisPrompt } from './user-message-analysis';
import { formatResponsePrompt } from './format-response';
import { composeData } from '@/core/mock-data';

// Combine all prompt data
export const promptRows: Rows = composeData([
  summarizeTextPrompt,
  codeReviewPrompt,
  qaAssistantPrompt,
  translateTextPrompt,
  sentimentAnalysisPrompt,
  brainstormIdeasPrompt,
  userMessageAnalysisPrompt,
  formatResponsePrompt,
]);