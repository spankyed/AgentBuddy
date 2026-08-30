export interface PackManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  hostVersion?: string;
  artifactTypes?: ArtifactType[];
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

export type ArtifactType =
  | 'actions'
  | 'prompts'
  | 'flows'
  | 'library'
  | 'notes'
  | 'settings'
  | 'systems'
  | 'plugins';

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
