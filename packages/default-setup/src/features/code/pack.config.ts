import type { PackConfig } from '@abuddy/sdk/build';

export default {
  name: 'code',
  actions: './actions',
  prompts: './prompts',
  flows: './flows',
  settings: './settings.ts',
} satisfies PackConfig;
