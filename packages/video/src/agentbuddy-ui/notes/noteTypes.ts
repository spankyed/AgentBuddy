export type NoteTreeNodeState = {
  children?: NoteTreeNodeState[];
  completed?: boolean;
  icon?: string;
  id: string;
  muted?: boolean;
  noteType: 'document' | 'task' | 'tasklist';
  title: string;
};

