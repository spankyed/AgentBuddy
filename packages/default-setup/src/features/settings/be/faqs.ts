import { DEFAULT_COMPILED_DIR, loadJSON } from '../../../registries/seed/index';
import { seedPath } from '@abuddy/sdk/build';
import type { FAQItem } from './types';

export function loadFaqs(): FAQItem[] {
  return loadJSON<FAQItem[]>(seedPath(DEFAULT_COMPILED_DIR, 'faq')) ?? [];
}
