export interface BlockFEFacet {
  loadComponent?: () => unknown;
  component?: unknown;
}

export interface BlockBEFacet {
  generateAsideText?(block: { type: string; props: Record<string, any> }, response: any, context: string): string | null;
}

export interface BlockDefinition {
  type: string;
  kind?: 'display' | 'input';
  fe?: BlockFEFacet;
  be?: BlockBEFacet;
}
