import type {NotesRightRailState, NoteTreeNodeState} from '../../agentbuddy-ui/notes/noteTypes';
import type {NoteImageBlockState} from '../../agentbuddy-ui/notes/NoteImageBlock';
import type {NotesHomeCardState} from '../../agentbuddy-ui/notes/NotesHomeSurface';
import type {ChatComposerState} from '../../agentbuddy-ui/chat/chatTypes';
import {launchComposerState} from './chat';
import {ease, mix, textReveal} from './timeline';

const launchImageSrc = svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 320">
  <rect width="720" height="320" fill="#111111"/>
  <rect x="1" y="1" width="718" height="318" rx="10" fill="#171717" stroke="#2f2f2f"/>
  <rect x="1" y="1" width="718" height="34" rx="10" fill="#1d1d1d"/>
  <circle cx="24" cy="18" r="5" fill="#ff5f57"/>
  <circle cx="42" cy="18" r="5" fill="#ffbd2e"/>
  <circle cx="60" cy="18" r="5" fill="#28c840"/>
  <text x="94" y="22" fill="#a3a3a3" font-family="Inter, Arial, sans-serif" font-size="12" font-weight="700" letter-spacing="2">THREADS / LAUNCH PLAN</text>
  <rect x="36" y="62" width="210" height="42" rx="7" fill="#202020" stroke="#303030"/>
  <text x="52" y="87" fill="#f5f5f5" font-family="Inter, Arial, sans-serif" font-size="15" font-weight="700">Launch AgentBuddy</text>
  <rect x="352" y="66" width="320" height="42" rx="8" fill="#172033" stroke="#27456f"/>
  <text x="368" y="91" fill="#f5f5f5" font-family="Inter, Arial, sans-serif" font-size="14">Turn launch context into execution tickets.</text>
  <rect x="72" y="142" width="274" height="118" rx="8" fill="#1d1d1d" stroke="#303030"/>
  <text x="92" y="168" fill="#a3a3a3" font-family="Inter, Arial, sans-serif" font-size="13">Agent is working</text>
  <circle cx="96" cy="196" r="4" fill="#14b8a6"/>
  <text x="112" y="200" fill="#e5e5e5" font-family="Inter, Arial, sans-serif" font-size="13">Capture launch context</text>
  <circle cx="96" cy="220" r="4" fill="#14b8a6"/>
  <text x="112" y="224" fill="#e5e5e5" font-family="Inter, Arial, sans-serif" font-size="13">Create execution tickets</text>
  <circle cx="96" cy="244" r="4" fill="#f59e0b"/>
  <text x="112" y="248" fill="#e5e5e5" font-family="Inter, Arial, sans-serif" font-size="13">Prepare release workflow</text>
  <rect x="390" y="130" width="250" height="150" rx="8" fill="#1d1d1d" stroke="#303030"/>
  <text x="410" y="158" fill="#f5f5f5" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="700">Launch Operating Plan</text>
  <line x1="410" y1="188" x2="616" y2="188" stroke="#2f2f2f"/>
  <text x="410" y="212" fill="#e5e5e5" font-family="Inter, Arial, sans-serif" font-size="13">Capture launch context</text>
  <text x="592" y="212" fill="#22c55e" font-family="Inter, Arial, sans-serif" font-size="12">done</text>
  <text x="410" y="238" fill="#e5e5e5" font-family="Inter, Arial, sans-serif" font-size="13">Create execution tickets</text>
  <text x="592" y="238" fill="#22c55e" font-family="Inter, Arial, sans-serif" font-size="12">done</text>
</svg>
`);

function svgDataUri(svg: string) {
  return `data:image/svg+xml,${encodeURIComponent(svg.trim())}`;
}

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
  const checkboxPressed = frame > 190 && frame <= 204;
  const markedComplete = frame > 204;
  const addPressed = frame > 218 && frame <= 230;
  const linkedTodoVisible = frame > 230;
  const linkedTodoEnter = ease(frame, 230, 250);
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
      style: {
        opacity: linkedTodoEnter,
        transform: `translateY(${mix(12, 0, linkedTodoEnter)}px) scale(${mix(0.985, 1, linkedTodoEnter)})`,
      },
    });
  }

  return {
    ...notesTaskListState,
    activeId: linkedTodoVisible ? 'launch-thread' : markedComplete ? 'resize-image' : notesTaskListState.activeId,
    items,
  };
}

export function notesViewForFrame(frame: number) {
  const imageEnter = ease(frame, 72, 98);
  const animatedLines = notesEditorCopy.animatedLines.map((line, index): NotesEditorLineView => ({
    caretVisible: frame >= (line.caretFrom ?? 0) && frame < (line.caretUntil ?? -1),
    id: `animated-${index}`,
    text: textReveal(line.text, frame, line.from, line.to),
  }));

  return {
    animatedLines,
    image: frame > 72
      ? {
          alt: 'Launch checklist image',
          bubbleOpen: frame > 100 && frame < 188,
          resizeButtonPressed: frame > 112 && frame <= 124,
          resizeOpen: frame > 118 && frame < 188,
          sliderPressed: frame > 124 && frame < 184,
          src: launchImageSrc,
          style: {
            opacity: imageEnter,
            transform: `translateY(${mix(18, 0, imageEnter)}px) scale(${mix(0.985, 1, imageEnter)})`,
          },
          widthPercent: frame > 124 ? Math.round(76 - Math.min(1, (frame - 124) / 48) * 22) : 76,
        }
      : undefined,
  };
}

export function notesShotViewForFrame(frame: number): NotesShotView {
  const view = notesViewForFrame(frame);
  const tasklistPressed = frame > 170 && frame < 186;
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
