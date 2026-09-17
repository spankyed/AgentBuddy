// The registered packs' message block definitions, looked up by type in the bound registry
import type { BlockDefinition } from './types.ts';
import { boundPackContributions } from '../runtime/packs-view.ts';

const block = (type: string): BlockDefinition | undefined => boundPackContributions().block(type);

/** The registered message block definitions, by type */
interface BlockRegistry {
  get(type: string): BlockDefinition | undefined;
  getComponent(type: string): unknown | undefined;
  has(type: string): boolean;
  all(): BlockDefinition[];
}

export const blockRegistry: BlockRegistry = {
  get(type: string): BlockDefinition | undefined {
    return block(type);
  },

  getComponent(type: string): unknown | undefined {
    return block(type)?.fe?.component;
  },

  has(type: string): boolean {
    return block(type) !== undefined;
  },

  all(): BlockDefinition[] {
    return boundPackContributions().blocks();
  },
};
