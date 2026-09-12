import { loadJSON } from '@abuddy/sdk/utils';
import { seedPath } from '@abuddy/sdk/build';
import { getCompiledDir } from '@/__generated__/seeders';
import type { FAQItem } from './types';

export function loadFaqs(): FAQItem[] {
  return loadJSON<FAQItem[]>(seedPath(getCompiledDir(), 'faq')) ?? [];
}
