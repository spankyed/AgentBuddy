import type { PackConfig } from '@abuddy/sdk/build';

export default {
  name: 'library',
  library: './library-docs',
  settings: './settings.ts',
} satisfies PackConfig;
