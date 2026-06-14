import type {NotesRightRailState, NoteTreeNodeState} from '../../agentbuddy-ui/notes/noteTypes';
import type {NoteImageBlockState} from '../../agentbuddy-ui/notes/NoteImageBlock';
import type {NotesHomeCardState} from '../../agentbuddy-ui/notes/NotesHomeSurface';
import type {ReferenceRefType} from '../../agentbuddy-ui/chat/referenceConfig';
import {launchFilmStory} from './launchStory';
import {revealText} from './typing';
import {createInteractionModel, type InteractionStep} from '../interaction/interactionTimeline';

// Notes pointer interactions — the single source of truth that drives both the
// scene's cursor and the press/active states below. Home and editor are
// separate cursor phases, so they have separate scripts.
export type NotesHomeTargetId = 'newNoteButton';
export type NotesEditorTargetId = 'editorBody' | 'rightRailTasklist' | 'taskListCurrentRow' | 'taskCheckbox';

export const notesHomeInteractionScript: InteractionStep<NotesHomeTargetId>[] = [
  {label: 'new-note', start: 118, end: 146, to: 'newNoteButton', fromViewport: [0.52, 0.52], toPoint: {anchor: [0.52, 0.5]}},
];
export const notesEditorInteractionScript: InteractionStep<NotesEditorTargetId>[] = [
  {label: 'open-tasklist', start: 50, end: 70, to: 'rightRailTasklist', from: 'editorBody'},
  {label: 'open-todo', start: 98, end: 116, to: 'taskListCurrentRow', from: 'rightRailTasklist'},
  {label: 'complete-todo', start: 126, end: 138, to: 'taskCheckbox', from: 'taskListCurrentRow', toPoint: {anchor: [0.5, 0.5], offset: [0.3, 0]}},
];
export const notesHomeInteractions = createInteractionModel(notesHomeInteractionScript);
export const notesEditorInteractions = createInteractionModel(notesEditorInteractionScript);

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
  references?: Array<{
    id: string;
    label: string;
    refType: ReferenceRefType;
    token: string;
  }>;
  text: string;
};

export type NotesShotView = {
  breadcrumbs: string[];
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
    newNotePressed?: boolean;
    recent: NotesHomeCardState[];
    searchQuery?: string;
    searchResults?: NotesHomeCardState[];
    showFavorites?: boolean;
    showRecent?: boolean;
    showSearch?: boolean;
  };
  rightRail: NotesRightRailState;
  taskList: NotesTaskListPanelState;
};

export const notesTaskListItems: NoteTreeNodeState[] = [
  {id: 'stripe-webhooks', title: 'Stripe webhooks', icon: '🔧', noteType: 'task'},
  {id: 'current', title: 'current', icon: '💳', noteType: 'task'},
  {id: 'receipt-emails', title: 'receipt emails', noteType: 'task'},
  {id: 'checkout-ui', title: 'checkout UI', noteType: 'task'},
  {id: 'discount-codes', title: 'discount codes', noteType: 'task'},
  {id: 'creator-payouts', title: 'creator payouts', noteType: 'task'},
  {id: 'product-variants', title: 'product variants', noteType: 'task'},
  {id: 'landing-page', title: 'landing page redesign', noteType: 'task', completed: true, muted: true},
  {id: 'pricing-tiers', title: 'pricing tiers', icon: '💰', noteType: 'task'},
  {id: 'analytics-dashboard', title: 'analytics dashboard', noteType: 'task'},
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
  {id: 'fav-current', icon: '💳', title: 'current', noteType: 'document'},
  {id: 'fav-api', icon: '🔌', title: 'api', noteType: 'document'},
  {id: 'fav-roadmap', icon: '🗺️', title: 'Roadmap', noteType: 'document'},
];

export const notesRailTree: NoteTreeNodeState[] = [
  {id: 'supafan', icon: '⚡', title: 'Supafan', noteType: 'document'},
  {id: 'payments', icon: '💳', title: 'Payments', noteType: 'document'},
  {id: 'tasklist', icon: '📝', title: 'Tasklist', noteType: 'tasklist'},
  {id: 'design', icon: '🎨', title: 'Design', noteType: 'document'},
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
    {id: 'recent-current', icon: '💳', title: 'current', noteType: 'document', updatedAt: 'just now', active: true},
    {id: 'recent-tasklist', icon: '📝', title: 'Tasklist', noteType: 'tasklist', updatedAt: '4m ago'},
    {id: 'recent-api', icon: '🔌', title: 'api', noteType: 'document', updatedAt: '18m ago'},
  ],
  favorites: [
    {id: 'fav-current', icon: '💳', title: 'current', noteType: 'document', updatedAt: 'just now'},
    {id: 'fav-roadmap', icon: '🗺️', title: 'Roadmap', noteType: 'document', updatedAt: 'today'},
    {id: 'fav-design', icon: '🎨', title: 'Design', noteType: 'document', updatedAt: 'yesterday'},
  ],
};

export const notesRightRailSearchState: NotesRightRailState = {
  ...notesRightRailState,
  search: {
    active: true,
    query: 'checkout',
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
      {id: 'trash-old-plan', icon: '🧾', title: 'old checkout outline', noteType: 'document', deletedAge: '2d'},
      {id: 'trash-draft', icon: '📝', title: 'draft payout notes', noteType: 'document', deletedAge: '5d'},
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

const newNoteCopy = {
  breadcrumbs: ['Notes', 'Supafan', 'Checkout Notes'],
  title: {icon: '📝', text: 'Checkout notes'},
  lines: [
    'Stripe webhook setup',
    'checkout flow in staging',
    'keep tasks nearby',
  ],
};

const tasklistOverviewCopy = {
  breadcrumbs: ['Notes', 'Supafan', 'Tasklist'],
  title: {icon: '📝', text: 'Tasklist'},
  beforeLines: [
    'Stripe webhooks',
    'current',
    'receipt emails',
    launchFilmStory.threads.addDiscountCodeSupport.title,
  ],
  afterLines: [
    'Checkout work stays by the note.',
  ],
};

const todoNoteCopy = {
  breadcrumbs: ['Notes', 'Supafan', 'Tasklist', 'receipt emails'],
  title: {icon: '', text: 'receipt emails'},
  beforeLines: [
    'Configure Resend transport',
    'Render order summary template',
    'Keep the linked checkout context visible',
  ],
  afterLines: [
    'Completed from panel.',
  ],
};

export function notesHomeViewForFrame(frame: number): NotesShotView['home'] {
  const greeting = revealText(notesHomeState.greeting, frame, -4);
  const showSearch = frame >= 44;
  const showRecent = frame >= 62;
  const showFavorites = frame >= 84;
  const newNotePressed = notesHomeInteractions.pressed('newNoteButton', frame, {lead: 10, tail: 8});

  return {
    ...notesHomeState,
    favorites: showFavorites ? notesHomeState.favorites : [],
    greeting,
    newNotePressed,
    recent: showRecent ? notesHomeState.recent.map(note => ({...note, active: false, pressed: false})) : [],
    showFavorites,
    showRecent,
    showSearch,
  };
}

export function notesEditorViewForFrame(frame: number): NotesShotView {
  // Press while the cursor clicks; the note/todo opens (active) a few frames
  // after the click settles — all derived from the cursor, never hand-timed.
  const tasklistPressed = notesEditorInteractions.pressed('rightRailTasklist', frame, {lead: 12, tail: 6});
  const tasklistActive = notesEditorInteractions.clicked('rightRailTasklist', frame, 6);
  const todoPressed = notesEditorInteractions.pressed('taskListCurrentRow', frame, {lead: 8, tail: 6});
  const todoActive = notesEditorInteractions.clicked('taskListCurrentRow', frame, 6);
  const todoCompletePressed = notesEditorInteractions.pressed('taskCheckbox', frame, {lead: 4, tail: 6});
  const todoComplete = notesEditorInteractions.clicked('taskCheckbox', frame, 6);

  const taskList = notesTaskListForEditorFrame(frame);
  const rightRail: NotesRightRailState = {
    ...notesRightRailState,
    activeId: tasklistActive ? 'tasklist' : undefined,
    items: notesRightRailState.items.map(item => item.id === 'tasklist'
      ? {...item, pressed: tasklistPressed}
      : item
    ),
  };

  if (!tasklistActive) {
    return {
      breadcrumbs: newNoteCopy.breadcrumbs,
      editor: {
        afterLines: [],
        beforeLines: newNoteCopy.lines.map((text, index) => ({
          caretVisible: index === newNoteCopy.lines.length - 1 && frame < 70,
          id: `new-note-${index}`,
          // Lines type one after another, never simultaneously. Stagger
          // (24f) exceeds the longest line so reveals never overlap.
          text: revealText(text, frame, 6 + index * 24),
        })),
        title: {
          icon: newNoteCopy.title.icon,
          text: revealText(newNoteCopy.title.text, frame, 0),
        },
      },
      home: notesHomeState,
      rightRail,
      taskList,
    };
  }

  if (!todoActive) {
    return {
      breadcrumbs: tasklistOverviewCopy.breadcrumbs,
      editor: {
        afterLines: tasklistOverviewCopy.afterLines.map((text, index) => ({
          id: `overview-after-${index}`,
          text: revealText(text, frame, 88 + index * 10),
        })),
        beforeLines: tasklistOverviewCopy.beforeLines.map((text, index) => ({
          id: `overview-${index}`,
          text,
        })),
        title: tasklistOverviewCopy.title,
      },
      home: notesHomeState,
      rightRail,
      taskList,
    };
  }

  return {
    breadcrumbs: todoNoteCopy.breadcrumbs,
    editor: {
      afterLines: todoNoteCopy.afterLines.map((text, index) => ({
        id: `todo-after-${index}`,
        text: revealText(text, frame, 144 + index * 8),
      })),
      beforeLines: todoNoteCopy.beforeLines.map((text, index) => ({
        caretVisible: index === todoNoteCopy.beforeLines.length - 1 && !todoComplete,
        id: `todo-${index}`,
        text,
      })),
      title: todoNoteCopy.title,
    },
    home: notesHomeState,
    rightRail,
    taskList: {
      ...taskList,
      activeId: 'receipt-emails',
      items: taskList.items.map(item => item.id === 'receipt-emails'
        ? {...item, checkboxPressed: todoCompletePressed, completed: todoComplete, muted: todoComplete}
        : item
      ),
    },
  };
}

function notesTaskListForEditorFrame(frame: number): NotesTaskListPanelState {
  const tasklistActive = notesEditorInteractions.clicked('rightRailTasklist', frame, 6);
  const todoActive = notesEditorInteractions.clicked('taskListCurrentRow', frame, 6);
  const todoPressed = notesEditorInteractions.pressed('taskListCurrentRow', frame, {lead: 8, tail: 6});
  const todoCompletePressed = notesEditorInteractions.pressed('taskCheckbox', frame, {lead: 4, tail: 6});
  const todoComplete = notesEditorInteractions.clicked('taskCheckbox', frame, 6);

  return {
    ...notesTaskListState,
    activeId: tasklistActive && todoActive ? 'receipt-emails' : null,
    items: notesTaskListItems.map(item => {
      if (item.id === 'receipt-emails') {
        return {
          ...item,
          checkboxPressed: todoCompletePressed,
          completed: todoComplete,
          muted: todoComplete,
          pressed: todoPressed || todoCompletePressed,
        };
      }
      return item;
    }),
  };
}
