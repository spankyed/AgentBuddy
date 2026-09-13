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

export interface ArtifactItem<TContent = unknown> {
  id: string;
  type: string;
  title: string;
  content: TContent;
  color?: string;
  metadata?: {
    createdAt: number;
    updatedAt?: number;
    [key: string]: unknown;
  };
}
