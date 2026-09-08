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
  features: './src/features',
  async setup() {
    const { standardSteps } = await import('./src/extensions/steps/register');
    const { stepRegistry } = await import('@abuddy/sdk/steps');
    for (const step of standardSteps) stepRegistry.register(step);

    const { standardArtifacts } = await import('./src/extensions/artifacts/register');
    const { artifactRegistry } = await import('@abuddy/sdk/artifacts');
    for (const art of standardArtifacts) artifactRegistry.register(art);

    const { standardBlocks } = await import('./src/extensions/blocks/register');
    const { blockRegistry } = await import('@abuddy/sdk/blocks');
    for (const block of standardBlocks) blockRegistry.register(block);
  },
} satisfies PackConfig;
