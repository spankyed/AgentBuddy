import type { PackConfig } from '@abuddy/sdk/build';
import { delayStep } from './src/steps/delay';

export default {
  name: 'example-pack',
  actions: './src/seeds/actions',
  flows: './src/seeds/flows',
  steps: [delayStep],
} satisfies PackConfig;
