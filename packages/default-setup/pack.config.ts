import type { PackConfig } from '@abuddy/sdk/build';
import {
  actionsCompiler, promptsCompiler, flowsCompiler,
  libraryCompiler, notesCompiler, faqCompiler, settingsCompiler,
} from './build/seed-compilers';

export default {
  name: 'default-setup',
  actions: './src/seeds/actions',
  prompts: './src/seeds/prompts',
  flows: './src/seeds/flows',
  library: './src/seeds/library',
  notes: './src/seeds/notes',
  faqs: './src/seeds/faqs',
  compilers: [
    { type: 'actions', compiler: actionsCompiler },
    { type: 'prompts', compiler: promptsCompiler },
    { type: 'flows', compiler: flowsCompiler },
    { type: 'library', compiler: libraryCompiler },
    { type: 'notes', compiler: notesCompiler },
    { type: 'faqs', compiler: faqCompiler },
    { type: 'settings', compiler: settingsCompiler },
  ],
} satisfies PackConfig;
