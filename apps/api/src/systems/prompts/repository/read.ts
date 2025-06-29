import { EARS } from '@/shared/ears/types';
import type { PromptEntity } from '../types';
import { getPromptById as getFromStore } from './mock-data';

export function getPromptById(id: EARS.EntityId): PromptEntity | undefined {
  return getFromStore(id);
} 