export type ChatAttachment = {
  label: string;
  type: 'file' | 'image';
};

export type ChatComposerState = {
  attachments?: ChatAttachment[];
  busy?: boolean;
  disabled?: boolean;
  mode: string;
  phase?: string;
  placeholder: string;
  statusLine?: string;
  text?: string;
};

