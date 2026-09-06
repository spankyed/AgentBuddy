export interface ArtifactFEFacet {
  icon: unknown;
  loadComponent?: () => unknown;
  component?: unknown;
  color?: string;
}

export interface ArtifactDefinition {
  type: string;
  fe?: ArtifactFEFacet;
}
