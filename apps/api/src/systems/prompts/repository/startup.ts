import type { PromptsStartupData, PromptEntity } from '../types';
import { getAllPrompts, getPromptById } from './read';
import { EARS } from '@/shared/ears/types';

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


export function getTemplateWithValidation(
  templateId: EARS.EntityId,
  params: Record<string, any>
): { template: PromptEntity; errors: string[] } | null {
  const template = getPromptById(templateId);
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