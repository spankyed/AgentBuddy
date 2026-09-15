import type { BlockDefinition } from './types.ts';

class BlockRegistry {
  private blocks = new Map<string, BlockDefinition>();

  register(def: BlockDefinition): void {
    this.blocks.set(def.type, def);
  }

  get(type: string): BlockDefinition | undefined {
    return this.blocks.get(type);
  }

  getComponent(type: string): unknown | undefined {
    return this.blocks.get(type)?.fe?.component;
  }

  unregister(type: string): void {
    this.blocks.delete(type);
  }

  has(type: string): boolean {
    return this.blocks.has(type);
  }

  all(): BlockDefinition[] {
    return [...this.blocks.values()];
  }
}

export const blockRegistry = new BlockRegistry();
