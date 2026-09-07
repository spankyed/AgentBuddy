import type { BlockDefinition } from '@abuddy/sdk/blocks';
import { standardBlocks } from './register';

export const blockDefinitions: BlockDefinition[] = standardBlocks.map(def => ({
  ...def,
  fe: undefined,
}));
