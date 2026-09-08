import * as path from 'path';

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
  steps?: string;
  artifacts?: string;
  blocks?: string;
  migrations?: string;
  features?: PackFeatureEntry[];
  packServices?: Record<string, string>;
  defaultPlugin?: string;
  partitionPolicy?: { excludedEntityTypes?: string[]; secretEntityTypes?: string[] };
  fe?: { tiptapPlugins?: string; appExtensions?: Record<string, string> };
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
  seed?: Record<string, string | { seeder?: string; entityType?: string; lookupField?: string }>;
  shutdown?: string;
  [key: string]: unknown;
}

export interface PackTypeManifest {
  entities: Record<string, string>;
  relKinds: Record<string, string>;
}

export interface PackSnapshot {
  types: PackTypeManifest;
  defs: Record<string, string>;
  manifest: PackManifest;
}


export function seedFile(name: string): string {
  return `${name}.seed.json`;
}

export function seedPath(compiledDir: string, name: string): string {
  return path.join(compiledDir, seedFile(name));
}

export type PackPermission =
  | 'ears'
  | 'llm'
  | 'filesystem'
  | 'network'
  | 'terminal';

export interface PackPluginDefinition {
  id: string;
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
