import { loadJSON } from '@abuddy/sdk/utils';
import { seedPath } from '@abuddy/sdk/build';
import { getCompiledDir } from '@/__generated__/seeders';
import type { CompiledFAQ } from '@abuddy/sdk/build';

export function loadFaqs(): CompiledFAQ[] {
  return loadJSON<CompiledFAQ[]>(seedPath(getCompiledDir(), 'faq')) ?? [];
}
