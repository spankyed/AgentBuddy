import type {NotesRightRailState, NoteTreeNodeState} from '../../agentbuddy-ui/notes/noteTypes';
import type {NoteImageBlockState} from '../../agentbuddy-ui/notes/NoteImageBlock';
import type {NotesHomeCardState} from '../../agentbuddy-ui/notes/NotesHomeSurface';
import type {ReferenceRefType} from '../../agentbuddy-ui/chat/referenceConfig';
import {launchFilmStory} from './launchStory';
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
    'Stripe webhook integration',
    'checkout session flow works in staging',
    'add checkout diagram, resize it, and keep tasks nearby',
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
    'Checkout work stays beside the note instead of becoming another app.',
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
    'Completed from the tasklist panel.',
  ],
};

export function notesHomeViewForFrame(frame: number): NotesShotView['home'] {
  const greeting = textReveal(notesHomeState.greeting, frame, -4, 40);
  const showSearch = frame >= 44;
  const showRecent = frame >= 62;
  const showFavorites = frame >= 84;
  const newNotePressed = frame >= 136 && frame < 154;

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
  const tasklistPressed = frame >= 58 && frame < 76;
  const tasklistActive = frame >= 76;
  const todoPressed = frame >= 108 && frame < 122;
  const todoActive = frame >= 122;
  const todoCompletePressed = frame >= 134 && frame < 144;
  const todoComplete = frame >= 144;

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
          // Lines type one after another, never simultaneously.
          text: textReveal(text, frame, 6 + index * 22, 26 + index * 22),
        })),
        title: {
          icon: newNoteCopy.title.icon,
          text: textReveal(newNoteCopy.title.text, frame, 0, 22),
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
          text: textReveal(text, frame, 88 + index * 10, 116 + index * 10),
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
        text: textReveal(text, frame, 144 + index * 8, 162 + index * 8),
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
  const tasklistActive = frame >= 76;
  const todoActive = frame >= 122;
  const todoPressed = frame >= 108 && frame < 122;
  const todoCompletePressed = frame >= 134 && frame < 144;
  const todoComplete = frame >= 144;

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
