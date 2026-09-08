import { loadJSON } from '@abuddy/sdk/utils';
import { seedPath } from '@abuddy/sdk/build';
import type { FAQItem } from './types';

const COMPILED_DIR = new URL('../../../../dist', import.meta.url).pathname;

export function loadFaqs(): FAQItem[] {
  return loadJSON<FAQItem[]>(seedPath(COMPILED_DIR, 'faq')) ?? [];
}
