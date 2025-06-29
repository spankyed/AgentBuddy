import { qx } from '@/shared/ears/helpers/query';
import { EARS } from '@/shared/ears/types';
import type { PromptEntity } from '../types';

const fields = [
  'id',
  'entityType', 
  'label',
  'description',
  'category',
  'inputs',
  'templateFn',
  'outputSchema',
  'createdAt',
  'updatedAt'
] as const;

export function getPromptById(id: EARS.EntityId): PromptEntity | undefined {
  const result = qx(id).pick(fields);
  return result ? result as unknown as PromptEntity : undefined;
}

export function getAllPrompts(): PromptEntity[] {
  const results = qx(EARS.Entity.Prompt).pick(fields);
  return (results || []) as unknown as PromptEntity[];
}

export function getPromptsByCategory(category: string): PromptEntity[] {
  const results = qx(EARS.Entity.Prompt)
    .where('category', category)
    .pick(fields);
  return (results || []) as unknown as PromptEntity[];
} 