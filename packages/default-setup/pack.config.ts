import type { PackConfig } from '@abuddy/sdk/build';

export default {
  name: 'default-setup',
  actions: './src/seeds/actions',
  prompts: './src/seeds/prompts',
  flows: './src/seeds/flows',
  library: './src/seeds/library',
  notes: './src/seeds/notes',
  faqs: './src/seeds/faqs',
  settings: './src/seeds/default-settings.ts',
  plugins: './src/plugins',
  async setup() {
    const { standardSteps } = await import('./src/steps/register');
    const { stepRegistry } = await import('@abuddy/sdk/steps');
    for (const step of standardSteps) {
      stepRegistry.register(step);
    }
  },
} satisfies PackConfig;
