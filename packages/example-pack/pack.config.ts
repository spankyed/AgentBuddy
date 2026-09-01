import type { PackConfig } from '@abuddy/sdk/build';

export default {
  name: 'example-pack',
  actions: './src/seeds/actions',
  flows: './src/seeds/flows',
} satisfies PackConfig;
