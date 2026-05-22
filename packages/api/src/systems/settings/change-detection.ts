export * from '@/core/shared/change-detection';

// Backward-compat wrappers with settings-specific types
import { detectChanges } from '@/core/shared/change-detection';
import type { ThreadStatusOption, ThreadTagOption, Category } from './types';

export const detectStatusChanges = (prev?: ThreadStatusOption[], next?: ThreadStatusOption[]) =>
  detectChanges(prev, next, s => s.label, s => s.color);

export const detectTagChanges = (prev?: ThreadTagOption[], next?: ThreadTagOption[]) =>
  detectChanges(prev, next, t => t.name, t => t.color || 'default');

export const detectCategoryChanges = (prev?: Category[], next?: Category[]) =>
  detectChanges(prev, next, c => c.name, c => c.color);
