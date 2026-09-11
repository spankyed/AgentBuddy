import * as path from 'path';

// Keep in sync with abuddy.schema.json (editor validation for pack authors)
export interface PackManifest {
  id: string;
  name: string;
  version: string;
  builtIn?: boolean;
  description?: string;
  hostVersion?: string;
  seedTypes?: string[];
  entities?: Record<string, string>;
  relKinds?: Record<string, string>;
  plugins?: PackPluginDefinition[];
  dependencies?: Record<string, string>;
  permissions?: PackPermission[];
  license?: string;
  boot?: PackBootConfig;
  steps?: string | { register: string; definitions: StepEntry[] };
  artifacts?: string;
  blocks?: string;
  migrations?: string;
  features?: PackFeatureEntry[];
  packServices?: Record<string, string>;
  defaultPlugin?: string;
  partitionPolicy?: { excludedEntityTypes?: string[]; secretEntityTypes?: string[] };
  fe?: { entry?: string; tiptapPlugins?: string; appExtensions?: Record<string, string>; styles?: string };
  entityShapes?: Record<string, { source: string; type: string }>;
  dsl?: Record<string, DslEntry>;
}

export interface DslEntry {
  entry: string;
  targets: ('monaco')[];
  prefix?: string;
  globals?: Record<string, string>;
}

export interface PackFeatureEntry {
  id: string;
  designation?: string;
  settings?: string;
  typesEntry?: string;
  earlySystem?: boolean;
  system?: {
    entry: string;
    exportName: string;
    outgoingEventsType?: string;
  };
  plugin?: {
    entry: string;
    label: string;
    icon: string;
    isPinned?: boolean;
  };
  services: Record<string, string>;
  contributions?: string;
  [key: string]: unknown;
}

export interface PackBootConfig {
  earlySystem?: string;
  createDefaultSettings?: string;
  seed?: Record<string, string | SeedEntryConfig>;
  seedPolicy?: { skipAtBoot?: string[]; skipAfterOnboarding?: string[] };
  shutdown?: string;
  [key: string]: unknown;
}

export interface SeedEntryConfig {
  path?: string;
  seeder?: string;
  entityType?: string;
  lookupField?: string;
}

export interface PackTypeManifest {
  entities: Record<string, string>;
  relKinds: Record<string, string>;
}

export interface PackSnapshot {
  types: PackTypeManifest;
  defs: Record<string, string>;
  manifest: PackManifest;
  sdkVersion?: string;
}


export function seedFile(name: string): string {
  return `${name}.seed.json`;
}

export function seedPath(compiledDir: string, name: string): string {
  return path.join(compiledDir, seedFile(name));
}

export interface StepDSLMeta {
  primaryField?: string;
  defaultLabel?: string;
  custom?: true;
}

export interface StepEntry {
  type: string;
  path: string;
  kind?: 'step' | 'trigger';
  dsl?: StepDSLMeta;
}

export type PackPermission =
  | 'ears'
  | 'llm'
  | 'filesystem'
  | 'network'
  | 'terminal';

export interface PackPluginDefinition {
  id: string;
  designation?: string;
  priority?: number;
  system?: PackSystemEntry;
  plugin?: PackPluginEntry;
  entities?: string[];
  settings?: Record<string, unknown>;
}

export interface PackSystemEntry {
  entry: string;
  events?: {
    incoming?: string[];
    outgoing?: string[];
  };
}

export interface PackPluginEntry {
  entry: string;
  label: string;
  icon: string;
}
