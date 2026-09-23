// This pack's help entries, which the app's Settings view lists under Help. They are compiled from src/seeds/faqs
// by src/seeds/_compilers/faqs.ts, and read the first time the list is read rather than at registration, because
// the compiled file exists only after `abuddy build`.
import { loadFaqs } from './be/faqs';
import type { HelpEntry } from '@abuddy/sdk/framework';

export function helpEntries(): HelpEntry[] {
  return loadFaqs();
}
