import type {CSSProperties} from 'react';

export type ChatAttachment = {
  label: string;
  previewUrl?: string;
  style?: CSSProperties;
  typeLabel?: string;
  type: 'file' | 'image';
};

export type QuickPromptState = {
  id: string;
  text: string;
};

export type ChatComposerState = {
  attachments?: ChatAttachment[];
  bottomTabs?: {
    active?: 'active' | 'new' | 'recent';
    activeLabel: string;
    activePinned?: boolean;
    newThreadLabel: string;
    pressed?: 'active' | 'new' | 'recent';
    recentLabel: string;
    recentThreadsMenu?: {
      activeId?: string;
      threads: Array<{
        id: string;
        meta?: string;
        status?: string;
        title: string;
      }>;
    };
  };
  busy?: boolean;
  disabled?: boolean;
  mode: string;
  modeOptions?: ChatModeOption[];
  openSelector?: 'mode' | 'phase';
  phase?: string;
  placeholder: string;
  referenceAutocomplete?: {
    activeId?: string;
    query: string;
    suggestions: Array<{
      icon?: string;
      id: string;
      label: string;
      typeLabel?: string;
    }>;
  };
  referenceButtonPressed?: boolean;
  references?: Array<{
    icon?: string;
    id: string;
    label: string;
    token: string;
    typeLabel?: string;
  }>;
  quickPrompts?: QuickPromptState[];
  quickPromptsButtonPressed?: boolean;
  quickPromptsOpen?: boolean;
  quickPromptPressedId?: string;
  sendPressed?: boolean;
  statusLine?: string;
  text?: string;
};

export type ChatModeOption = {
  disabled?: boolean;
  hidden?: boolean;
  name: string;
  phases?: Array<{
    color?: string;
    name: string;
  }>;
};
