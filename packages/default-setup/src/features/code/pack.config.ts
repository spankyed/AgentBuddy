import type { PackConfig } from '@abuddy/sdk/build';

export default {
  name: 'code',
  actions: '../../actions/claude-code',
  prompts: '../../prompts',
} satisfies PackConfig;
