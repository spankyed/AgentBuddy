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
  };
  busy?: boolean;
  disabled?: boolean;
  mode: string;
  modeOptions?: ChatModeOption[];
  openSelector?: 'mode' | 'phase';
  phase?: string;
  placeholder: string;
  referenceButtonPressed?: boolean;
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
