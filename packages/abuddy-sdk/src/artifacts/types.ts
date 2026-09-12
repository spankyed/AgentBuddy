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

export interface ArtifactItem {
  id: string;
  type: string;
  title: string;
  content: any;
  color?: string;
  metadata?: {
    createdAt: number;
    updatedAt?: number;
    [key: string]: any;
  };
}
