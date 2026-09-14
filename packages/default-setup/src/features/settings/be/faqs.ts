import { loadJSON } from '@abuddy/sdk/utils';
import { seedPath } from '@abuddy/sdk/build';
import { getCompiledDir } from '@/__generated__/seeders';

/** A FAQ, compiled from src/seeds/faqs by src/seeds/compilers/faqs.ts */
export interface CompiledFAQ {
  id: string;
  question: string;
  answer: string;
  category?: string;
  order?: number;
}

export function loadFaqs(): CompiledFAQ[] {
  return loadJSON<{ records: CompiledFAQ[] }>(seedPath(getCompiledDir(), 'faqs'))?.records ?? [];
}
