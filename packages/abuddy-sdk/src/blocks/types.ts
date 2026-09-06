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

export type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger';

export interface ButtonConfig {
  id: string;
  label: string;
  state: string;
  states?: Record<string, {
    label: string;
    variant?: ButtonVariant;
    disabled?: boolean;
  }>;
  toggleStates?: {
    on: { label: string; variant?: ButtonVariant; disabled?: boolean };
    off: { label: string; variant?: ButtonVariant; disabled?: boolean };
  };
}

export interface ButtonGroupResponse {
  buttonId: string;
  state: string;
}
