export type NoteTreeNodeState = {
  children?: NoteTreeNodeState[];
  completed?: boolean;
  icon?: string;
  id: string;
  muted?: boolean;
  noteType: 'document' | 'task' | 'tasklist';
  title: string;
};

export type NotesRightRailState = {
  activeId?: string;
  favorites: NoteTreeNodeState[];
  favoritesExpanded?: boolean;
  items: NoteTreeNodeState[];
  search?: {
    active: boolean;
    query?: string;
  };
};
