import type { PromptsStartupData } from '../types';
import { getAllPrompts } from './mock-data';

const PROMPTS_PER_PAGE = 10;

export default function promptsStartupData(page: number = 1): PromptsStartupData {
  const allPrompts = getAllPrompts();
  const totalCount = allPrompts.length;
  const totalPages = Math.ceil(totalCount / PROMPTS_PER_PAGE);
  
  // Calculate pagination
  const startIndex = (page - 1) * PROMPTS_PER_PAGE;
  const endIndex = startIndex + PROMPTS_PER_PAGE;
  const prompts = allPrompts.slice(startIndex, endIndex);
  
  return {
    prompts,
    page,
    totalPages,
    totalCount
  };
} 