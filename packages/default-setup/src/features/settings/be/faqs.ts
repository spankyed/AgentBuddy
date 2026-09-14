import { loadJSON } from '@abuddy/sdk/utils';
import { seedPath } from '@abuddy/sdk/build';
import { getCompiledDir } from '@/__generated__/seeders';
import type { FAQItem } from './types';

/** The Help tab's FAQs, compiled from src/seeds/faqs by src/seeds/_compilers/faqs.ts */
export function loadFaqs(): FAQItem[] {
  return loadJSON<{ records: FAQItem[] }>(seedPath(getCompiledDir(), 'faqs'))?.records ?? [];
}
