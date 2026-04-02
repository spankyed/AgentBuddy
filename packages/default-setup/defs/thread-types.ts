/**
 * Thread UI types – Vendored subset from AgentBuddy
 * Source: packages/api/src/systems/threads/types.ts
 */

export interface LinkEvent {
  target: 'application' | 'external' | string;
  data: any;
}

export type LinkIcon =
  | 'external-link'
  | 'file-text'
  | 'message-square'
  | 'settings'
  | 'link';

export interface LinkConfig {
  label: string;
  event: LinkEvent;
  icon?: LinkIcon;
}

export interface ButtonConfig {
  id: string;
  label: string;
  state: string;
  states?: Record<string, {
    label: string;
    variant?: 'primary' | 'secondary' | 'success' | 'danger';
    disabled?: boolean;
  }>;
  toggleStates?: {
    on: {
      label: string;
      variant?: 'primary' | 'secondary' | 'success' | 'danger';
      disabled?: boolean;
    };
    off: {
      label: string;
      variant?: 'primary' | 'secondary' | 'success' | 'danger';
      disabled?: boolean;
    };
  };
}
