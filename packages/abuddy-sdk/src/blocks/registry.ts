import type { BlockDefinition } from './types.js';

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

  initComponents(): void {
    for (const def of this.blocks.values()) {
      if (def.fe?.loadComponent && !def.fe.component) {
        def.fe.component = def.fe.loadComponent();
      }
    }
  }
}

export const blockRegistry = new BlockRegistry();
