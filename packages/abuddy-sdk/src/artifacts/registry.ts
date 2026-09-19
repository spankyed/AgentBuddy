// The registered packs' artifact definitions, looked up by type in the bound registry
import type { ArtifactDefinition } from './types.ts';
import { _boundPackExtensions } from '../runtime/packs-view.ts';

const artifact = (type: string): ArtifactDefinition | undefined => _boundPackExtensions().artifact(type);

/** The registered artifact definitions, by type */
interface ArtifactRegistry {
  get(type: string): ArtifactDefinition | undefined;
  getComponent(type: string): unknown | undefined;
  getIcon(type: string): unknown | undefined;
  has(type: string): boolean;
  all(): ArtifactDefinition[];
}

export const artifactRegistry: ArtifactRegistry = {
  get(type: string): ArtifactDefinition | undefined {
    return artifact(type);
  },

  getComponent(type: string): unknown | undefined {
    return artifact(type)?.fe?.component;
  },

  getIcon(type: string): unknown | undefined {
    return artifact(type)?.fe?.icon;
  },

  has(type: string): boolean {
    return artifact(type) !== undefined;
  },

  all(): ArtifactDefinition[] {
    return _boundPackExtensions().artifacts();
  },
};
