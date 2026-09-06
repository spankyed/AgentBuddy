import { blockRegistry } from '@abuddy/sdk/blocks';
import { standardBlocks } from './register';

for (const def of standardBlocks) {
  blockRegistry.register({ ...def, fe: undefined });
}
