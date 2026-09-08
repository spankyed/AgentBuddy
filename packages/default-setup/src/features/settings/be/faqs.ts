import { loadJSON } from '@abuddy/sdk/utils';
import { seedPath } from '@abuddy/sdk/build';
import { DEFAULT_COMPILED_DIR } from '@/__generated__/seeders';
import type { FAQItem } from './types';

export function loadFaqs(): FAQItem[] {
  return loadJSON<FAQItem[]>(seedPath(DEFAULT_COMPILED_DIR, 'faq')) ?? [];
}
