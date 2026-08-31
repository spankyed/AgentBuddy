import type { PackConfig } from '@abuddy/sdk/build';

export default {
  name: 'default-setup',
  actions: './src/seeds/actions',
  prompts: './src/seeds/prompts',
  flows: './src/seeds/flows',
  library: './src/seeds/library',
  notes: './src/seeds/notes',
  faqs: './src/seeds/faqs',
} satisfies PackConfig;
