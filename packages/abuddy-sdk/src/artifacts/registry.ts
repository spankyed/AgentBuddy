import type { ArtifactDefinition } from './types.ts';

class ArtifactRegistry {
  private artifacts = new Map<string, ArtifactDefinition>();

  register(def: ArtifactDefinition): void {
    this.artifacts.set(def.type, def);
  }

  get(type: string): ArtifactDefinition | undefined {
    return this.artifacts.get(type);
  }

  getComponent(type: string): unknown | undefined {
    return this.artifacts.get(type)?.fe?.component;
  }

  getIcon(type: string): unknown | undefined {
    return this.artifacts.get(type)?.fe?.icon;
  }

  unregister(type: string): void {
    this.artifacts.delete(type);
  }

  has(type: string): boolean {
    return this.artifacts.has(type);
  }

  all(): ArtifactDefinition[] {
    return [...this.artifacts.values()];
  }
}

export const artifactRegistry = new ArtifactRegistry();
