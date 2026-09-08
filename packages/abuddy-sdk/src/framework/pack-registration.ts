/**
 * Pack Registration Types
 *
 * Contract that packs use to declare what they contribute to the host.
 * The host (API) owns the mutable registry; packs only reference these types.
 */

import type { AnyStateMachine } from 'xstate';

export interface PackSystemDef {
  id: string;
  machine: AnyStateMachine;
  events: Set<string>;
  designation?: string;
}

export interface PackMigration {
  target: string;
  description: string;
  up: () => void;
}

export interface PackBootHooks {
  earlySystem?: AnyStateMachine;
  createDefaultSettings?: () => void;
  shutdown?: () => void;
  seed?: () => void;
}

export interface PackEARS {
  entities: Record<string, string>;
  relKinds: Record<string, string>;
  partitionPolicy?: {
    excludedEntityTypes?: string[];
    secretEntityTypes?: string[];
  };
}

export interface PackFeatureDef {
  id: string;
  designation?: string;
  hasSystem: boolean;
  plugin?: { label: string; icon: string; isPinned?: boolean };
  services: string[];
}

export interface PackRegistration {
  id: string;
  systems: PackSystemDef[];
  services?: Record<string, unknown> & Partial<import('../types/entities').ServiceRegistry>;
  ears?: PackEARS;
  boot?: PackBootHooks;
  migrations?: PackMigration[];
  steps?: import('../steps/types').StepDefinition[];
  artifacts?: import('../artifacts/types').ArtifactDefinition[];
  blocks?: import('../blocks/types').BlockDefinition[];
  features?: PackFeatureDef[];
}
