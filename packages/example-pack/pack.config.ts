import type { PackConfig } from '@abuddy/sdk/build';
import { actionsCompiler, flowsCompiler } from '@app/default-setup/build';

export default {
  name: 'example-pack',
  actions: './src/seeds/actions',
  flows: './src/seeds/flows',
  compilers: [
    { type: 'actions', compiler: actionsCompiler },
    { type: 'flows', compiler: flowsCompiler },
  ],
} satisfies PackConfig;
