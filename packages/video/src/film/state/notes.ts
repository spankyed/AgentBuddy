import type {NotesRightRailState, NoteTreeNodeState} from '../../agentbuddy-ui/notes/noteTypes';
import type {NoteImageBlockState} from '../../agentbuddy-ui/notes/NoteImageBlock';
import type {NotesHomeCardState} from '../../agentbuddy-ui/notes/NotesHomeSurface';
import type {ChatComposerState} from '../../agentbuddy-ui/chat/chatTypes';
import {launchComposerState} from './chat';
import {textReveal} from './timeline';

const launchImageSrc = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20720%20320%22%3E%3Crect%20width%3D%22720%22%20height%3D%22320%22%20fill%3D%22%23171717%22%2F%3E%3Crect%20x%3D%2248%22%20y%3D%2244%22%20width%3D%22624%22%20height%3D%22232%22%20rx%3D%2218%22%20fill%3D%22%23262626%22%20stroke%3D%22%23525252%22%2F%3E%3Cpath%20d%3D%22M96%20106h312M96%20146h456M96%20186h380M96%20226h214%22%20stroke%3D%22%23e5e5e5%22%20stroke-width%3D%2214%22%20stroke-linecap%3D%22round%22%2F%3E%3Ccircle%20cx%3D%22596%22%20cy%3D%22106%22%20r%3D%2226%22%20fill%3D%22%233b82f6%22%2F%3E%3Cpath%20d%3D%22M586%20106l7%207%2016-19%22%20fill%3D%22none%22%20stroke%3D%22%23fff%22%20stroke-width%3D%227%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E';

export type NotesTaskListPanelState = {
  activeId: string | null;
  items: NoteTreeNodeState[];
  showCompleted: boolean;
  title: {
    icon: string;
    text: string;
  };
};

export type NotesEditorLineView = {
  caretVisible?: boolean;
  id: string;
  text: string;
};

export type NotesShotView = {
  breadcrumbs: string[];
  composer: ChatComposerState;
  editor: {
    afterLines: NotesEditorLineView[];
    beforeLines: NotesEditorLineView[];
    image?: NoteImageBlockState;
    title: {
      icon: string;
      text: string;
    };
  };
  home: {
    favorites: NotesHomeCardState[];
    greeting: string;
    recent: NotesHomeCardState[];
    searchQuery?: string;
    searchResults?: NotesHomeCardState[];
  };
  rightRail: NotesRightRailState;
  taskList: NotesTaskListPanelState;
};

export const notesTaskListItems: NoteTreeNodeState[] = [
  {id: 'default', title: 'default setup', icon: '🚧', noteType: 'task'},
  {id: 'current', title: 'current', icon: '🔥', noteType: 'task'},
  {id: 'resize-image', title: 'resize image in note', noteType: 'task'},
  {id: 'phone', title: 'phone app', noteType: 'task'},
  {id: 'bugs', title: 'bugs', icon: '🪲', noteType: 'task'},
  {id: 'manager', title: 'manager mode', noteType: 'task'},
  {id: 'bg', title: 'bg processes', noteType: 'task'},
  {id: 'chat', title: 'chat layout redesign', noteType: 'task', completed: true, muted: true},
  {id: 'roadmap', title: 'V1 Roadmap', icon: '🗺️', noteType: 'task'},
  {id: 'artifacts', title: 'artifacts & msg blocks', noteType: 'task'},
];

export const notesTaskListState: NotesTaskListPanelState = {
  activeId: 'current',
  items: notesTaskListItems,
  showCompleted: true,
  title: {icon: '📝', text: 'Tasklist'},
};

export const notesTaskListMenuState = {
  activeId: 'current',
  headerMenuOpen: true,
  items: notesTaskListItems,
  showCompleted: true,
  title: {icon: '📝', text: 'Tasklist'},
};

export const notesTaskListRowMenuState = {
  activeId: 'current',
  items: notesTaskListItems.map(item =>
    item.id === 'current'
      ? {
        ...item,
        favorite: true,
        hasCompletedChildren: true,
        hidingCompletedChildren: false,
        rowMenuOpen: true,
      }
      : item
  ),
  showCompleted: true,
  title: {icon: '📝', text: 'Tasklist'},
};

export const notesRailFavorites: NoteTreeNodeState[] = [
  {id: 'fav-current', icon: '🔥', title: 'current', noteType: 'document'},
  {id: 'fav-cli', icon: '💻', title: 'cli', noteType: 'document'},
  {id: 'fav-videos', icon: '🎬', title: 'Videos', noteType: 'document'},
];

export const notesRailTree: NoteTreeNodeState[] = [
  {id: 'clientlabs', icon: '🌐', title: 'Clientlabs', noteType: 'document'},
  {id: 'agentbuddy', icon: '🚀', title: 'Agentbuddy', noteType: 'document'},
  {id: 'tasklist', icon: '📝', title: 'Tasklist', noteType: 'tasklist'},
  {id: 'brand', icon: '⭐', title: 'Brand & Content', noteType: 'document'},
];

export const notesRightRailState: NotesRightRailState = {
  activeId: 'tasklist',
  favorites: notesRailFavorites,
  favoritesExpanded: true,
  items: notesRailTree,
};

export const notesHomeState: NotesShotView['home'] = {
  greeting: 'Good afternoon',
  recent: [
    {id: 'recent-current', icon: '🔥', title: 'current', noteType: 'document', updatedAt: 'just now', active: true},
    {id: 'recent-tasklist', icon: '📝', title: 'Tasklist', noteType: 'tasklist', updatedAt: '4m ago'},
    {id: 'recent-cli', icon: '💻', title: 'cli', noteType: 'document', updatedAt: '18m ago'},
  ],
  favorites: [
    {id: 'fav-current', icon: '🔥', title: 'current', noteType: 'document', updatedAt: 'just now'},
    {id: 'fav-videos', icon: '🎬', title: 'Videos', noteType: 'document', updatedAt: 'today'},
    {id: 'fav-brand', icon: '⭐', title: 'Brand & Content', noteType: 'document', updatedAt: 'yesterday'},
  ],
};

export const notesRightRailSearchState: NotesRightRailState = {
  ...notesRightRailState,
  search: {
    active: true,
    query: 'launch',
  },
};

export const notesRightRailMenuState: NotesRightRailState = {
  ...notesRightRailState,
  createMenuOpen: true,
};

export const notesRightRailTrashState: NotesRightRailState = {
  ...notesRightRailState,
  trash: {
    visible: true,
    items: [
      {id: 'trash-old-plan', icon: '🧾', title: 'old launch outline', noteType: 'document', deletedAge: '2d'},
      {id: 'trash-draft', icon: '📝', title: 'draft tutorial carousel', noteType: 'document', deletedAge: '5d'},
    ],
  },
};

export const notesRightRailTrashActionsState: NotesRightRailState = {
  ...notesRightRailTrashState,
  trash: {
    ...notesRightRailTrashState.trash!,
    actionId: 'trash-draft',
  },
};

export const notesEditorCopy = {
  breadcrumbs: ['Notes', 'AgentBuddy', 'Tasklist', 'Current'],
  title: {icon: '🔥', text: 'current'},
  beforeLines: ['recent notes', 'launch context stays connected'],
  animatedLines: [
    {text: 'add launch image, resize it, and keep the tasklist beside the note', from: 34, to: 112, caretUntil: 116},
    {text: 'mark resize image complete, then create the next todo', from: 128, to: 198},
    {text: 'new todo: link #threads: Create launch PR flow back to the parent ticket', from: 168, to: 254, caretFrom: 168, caretUntil: 258},
  ],
};

export function notesTaskListForFrame(frame: number): NotesTaskListPanelState {
  const checkboxPressed = frame > 202 && frame <= 214;
  const markedComplete = frame > 214;
  const addPressed = frame > 232 && frame <= 242;
  const linkedTodoVisible = frame > 242;
  const items = notesTaskListItems.map(item =>
    item.id === 'resize-image' && markedComplete
      ? {...item, completed: true, muted: true}
      : item.id === 'resize-image' && checkboxPressed
        ? {...item, checkboxPressed: true, pressed: true}
        : item.id === 'current' && addPressed
          ? {...item, addPressed: true, pressed: true}
      : item
  );

  if (linkedTodoVisible) {
    items.splice(3, 0, {
      id: 'launch-thread',
      title: '#threads: Create launch PR flow',
      noteType: 'task',
    });
  }

  return {
    ...notesTaskListState,
    activeId: linkedTodoVisible ? 'launch-thread' : markedComplete ? 'resize-image' : notesTaskListState.activeId,
    items,
  };
}

export function notesViewForFrame(frame: number) {
  const animatedLines = notesEditorCopy.animatedLines.map((line, index): NotesEditorLineView => ({
    caretVisible: frame >= (line.caretFrom ?? 0) && frame < (line.caretUntil ?? -1),
    id: `animated-${index}`,
    text: textReveal(line.text, frame, line.from, line.to),
  }));

  return {
    animatedLines,
    image: frame > 96
      ? {
          alt: 'Launch checklist image',
          bubbleOpen: frame > 126 && frame < 188,
          resizeButtonPressed: frame > 142 && frame <= 150,
          resizeOpen: frame > 148 && frame < 188,
          sliderPressed: frame > 152 && frame < 184,
          src: launchImageSrc,
          widthPercent: frame > 148 ? Math.round(100 - Math.min(1, (frame - 148) / 40) * 35) : 100,
        }
      : undefined,
  };
}

export function notesShotViewForFrame(frame: number): NotesShotView {
  const view = notesViewForFrame(frame);
  const tasklistPressed = frame > 180 && frame < 196;
  const home = {
    ...notesHomeState,
    recent: notesHomeState.recent.map(note => note.id === 'recent-current'
      ? {...note, pressed: frame > 48 && frame < 64}
      : note
    ),
  };
  return {
    breadcrumbs: notesEditorCopy.breadcrumbs,
    composer: launchComposerState,
    editor: {
      beforeLines: [
        ...notesEditorCopy.beforeLines.map((text, index) => ({id: `before-${index}`, text})),
        view.animatedLines[0],
      ],
      afterLines: [view.animatedLines[1], view.animatedLines[2]],
      image: view.image,
      title: notesEditorCopy.title,
    },
    home,
    rightRail: {
      ...notesRightRailState,
      activeId: tasklistPressed ? undefined : notesRightRailState.activeId,
      items: notesRightRailState.items.map(item => item.id === 'tasklist'
        ? {...item, pressed: tasklistPressed}
        : item
      ),
    },
    taskList: notesTaskListForFrame(frame),
  };
}
