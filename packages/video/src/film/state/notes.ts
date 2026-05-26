import type {NotesRightRailState, NoteTreeNodeState} from '../../agentbuddy-ui/notes/noteTypes';
import type {ChatComposerState} from '../../agentbuddy-ui/chat/chatTypes';
import {launchComposerState} from './chat';
import {textReveal} from './timeline';

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
    title: {
      icon: string;
      text: string;
    };
  };
  rightRail: NotesRightRailState;
  taskList: NotesTaskListPanelState;
};

export const notesTaskListItems: NoteTreeNodeState[] = [
  {id: 'default', title: 'default setup', icon: '🚧', noteType: 'task'},
  {id: 'current', title: 'current', icon: '🔥', noteType: 'task'},
  {id: 'launch-thread', title: '#threads: Launch PR flow', noteType: 'task'},
  {id: 'resize-image', title: 'resize image in note', noteType: 'task', completed: true, muted: true},
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
    {text: 'new todo: link #threads: Launch PR flow back to the parent ticket', from: 168, to: 254, caretFrom: 168, caretUntil: 258},
  ],
};

export function notesViewForFrame(frame: number) {
  const animatedLines = notesEditorCopy.animatedLines.map((line, index): NotesEditorLineView => ({
    caretVisible: frame >= (line.caretFrom ?? 0) && frame < (line.caretUntil ?? -1),
    id: `animated-${index}`,
    text: textReveal(line.text, frame, line.from, line.to),
  }));

  return {
    animatedLines,
  };
}

export function notesShotViewForFrame(frame: number): NotesShotView {
  const view = notesViewForFrame(frame);
  return {
    breadcrumbs: notesEditorCopy.breadcrumbs,
    composer: launchComposerState,
    editor: {
      beforeLines: [
        ...notesEditorCopy.beforeLines.map((text, index) => ({id: `before-${index}`, text})),
        view.animatedLines[0],
      ],
      afterLines: [view.animatedLines[1], view.animatedLines[2]],
      title: notesEditorCopy.title,
    },
    rightRail: notesRightRailState,
    taskList: notesTaskListState,
  };
}
