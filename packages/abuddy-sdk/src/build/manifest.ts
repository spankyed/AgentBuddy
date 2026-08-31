import * as path from 'path';

export interface PackManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  hostVersion?: string;
  seedTypes?: string[];
  entities?: Record<string, string>;
  relKinds?: Record<string, string>;
  features?: PackFeatureEntry[];
  dependencies?: Record<string, string>;
  permissions?: PackPermission[];
  license?: string;
}

export interface PackTypeManifest {
  entities: Record<string, string>;
  relKinds: Record<string, string>;
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

export interface PackFeatureEntry {
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
