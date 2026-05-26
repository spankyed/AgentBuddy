export type NoteTreeNodeState = {
  addPressed?: boolean;
  children?: NoteTreeNodeState[];
  checkboxPressed?: boolean;
  completed?: boolean;
  deletedAge?: string;
  favorite?: boolean;
  hasCompletedChildren?: boolean;
  hidingCompletedChildren?: boolean;
  icon?: string;
  id: string;
  muted?: boolean;
  noteType: 'document' | 'task' | 'tasklist';
  pressed?: boolean;
  rowMenuOpen?: boolean;
  title: string;
};

export type NotesRightRailState = {
  activeId?: string;
  createMenuOpen?: boolean;
  favorites: NoteTreeNodeState[];
  favoritesExpanded?: boolean;
  items: NoteTreeNodeState[];
  search?: {
    active: boolean;
    query?: string;
  };
  trash?: {
    actionId?: string;
    items: NoteTreeNodeState[];
    visible: boolean;
  };
};
