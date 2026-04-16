import * as path from 'path';
import { DEFAULT_COMPILED_DIR, loadJSON } from '@/setup/seed/index';
import type { FAQItem } from './types';

/**
 * Load compiled FAQs from the shipped default-setup/dist build. Returns [] if
 * the file is missing or unparseable (loadJSON logs a `[seed]` warning on
 * parse errors).
 *
 * Note: FAQs are shipped-only content. Setup-pack imports do NOT replace them —
 * updated FAQ content ships with a new app build, not via user imports.
 */
export function loadFaqs(): FAQItem[] {
  return loadJSON<FAQItem[]>(path.join(DEFAULT_COMPILED_DIR, 'compiled-faq.json')) ?? [];
}
