import type {NotesRightRailState, NoteTreeNodeState} from '../../agentbuddy-ui/notes/noteTypes';
import type {NoteImageBlockState} from '../../agentbuddy-ui/notes/NoteImageBlock';
import type {NotesHomeCardState} from '../../agentbuddy-ui/notes/NotesHomeSurface';
import type {ReferenceRefType} from '../../agentbuddy-ui/chat/referenceConfig';
import {launchFilmStory} from './launchStory';
import {ease, mix, textReveal} from './timeline';

const launchImageSrc = svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 320">
  <rect width="720" height="320" fill="#111111"/>
  <rect x="1" y="1" width="718" height="318" rx="10" fill="#171717" stroke="#2f2f2f"/>
  <rect x="1" y="1" width="718" height="34" rx="10" fill="#1d1d1d"/>
  <circle cx="24" cy="18" r="5" fill="#ff5f57"/>
  <circle cx="42" cy="18" r="5" fill="#ffbd2e"/>
  <circle cx="60" cy="18" r="5" fill="#28c840"/>
  <text x="94" y="22" fill="#a3a3a3" font-family="Inter, Arial, sans-serif" font-size="12" font-weight="700" letter-spacing="2">CHECKOUT / STRIPE FLOW</text>
  <rect x="36" y="62" width="210" height="42" rx="7" fill="#202020" stroke="#303030"/>
  <text x="52" y="87" fill="#f5f5f5" font-family="Inter, Arial, sans-serif" font-size="15" font-weight="700">Supafan checkout</text>
  <rect x="352" y="66" width="320" height="42" rx="8" fill="#172033" stroke="#27456f"/>
  <text x="368" y="91" fill="#f5f5f5" font-family="Inter, Arial, sans-serif" font-size="14">Scope Stripe checkout and receipts.</text>
  <rect x="72" y="142" width="274" height="118" rx="8" fill="#1d1d1d" stroke="#303030"/>
  <text x="92" y="168" fill="#a3a3a3" font-family="Inter, Arial, sans-serif" font-size="13">Agent is working</text>
  <circle cx="96" cy="196" r="4" fill="#14b8a6"/>
  <text x="112" y="200" fill="#e5e5e5" font-family="Inter, Arial, sans-serif" font-size="13">Design payment flow</text>
  <circle cx="96" cy="220" r="4" fill="#14b8a6"/>
  <text x="112" y="224" fill="#e5e5e5" font-family="Inter, Arial, sans-serif" font-size="13">Wire receipt emails</text>
  <circle cx="96" cy="244" r="4" fill="#f59e0b"/>
  <text x="112" y="248" fill="#e5e5e5" font-family="Inter, Arial, sans-serif" font-size="13">Stub discount codes</text>
  <rect x="390" y="130" width="250" height="150" rx="8" fill="#1d1d1d" stroke="#303030"/>
  <text x="410" y="158" fill="#f5f5f5" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="700">Checkout Implementation Plan</text>
  <line x1="410" y1="188" x2="616" y2="188" stroke="#2f2f2f"/>
  <text x="410" y="212" fill="#e5e5e5" font-family="Inter, Arial, sans-serif" font-size="13">Stripe integration</text>
  <text x="592" y="212" fill="#22c55e" font-family="Inter, Arial, sans-serif" font-size="12">done</text>
  <text x="410" y="238" fill="#e5e5e5" font-family="Inter, Arial, sans-serif" font-size="13">Receipt emails</text>
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

export const notesEditorCopy = {
  breadcrumbs: ['Notes', 'Supafan', 'Tasklist', 'Current'],
  title: {icon: '💳', text: 'current'},
  beforeLines: ['Stripe webhook integration', 'checkout session flow works in staging'],
  animatedLines: [
    {text: 'add checkout diagram, resize it, and keep tasks nearby', from: 132, to: 176, caretUntil: 180},
    {text: 'mark receipt emails complete, then create the next todo', from: 220, to: 276},
    {text: `new todo: link #threads: ${launchFilmStory.threads.addDiscountCodeSupport.title} back to the parent ticket`, from: 248, to: 320, caretFrom: 248, caretUntil: 324},
  ],
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

const launchPrFlowReference = {
  id: launchFilmStory.threads.addDiscountCodeSupport.id,
  label: launchFilmStory.threads.addDiscountCodeSupport.title,
  refType: 'thread' as const,
  token: `#threads: ${launchFilmStory.threads.addDiscountCodeSupport.title}`,
};

export function notesTaskListForFrame(frame: number): NotesTaskListPanelState {
  const checkboxPressed = frame > 230 && frame <= 244;
  const markedComplete = frame > 244;
  const addPressed = frame > 258 && frame <= 270;
  const linkedTodoVisible = frame > 270;
  const linkedTodoEnter = ease(frame, 270, 292);
  const items = notesTaskListItems.map(item =>
    item.id === 'receipt-emails' && markedComplete
      ? {...item, completed: true, muted: true}
      : item.id === 'receipt-emails' && checkboxPressed
        ? {...item, checkboxPressed: true, pressed: true}
        : item.id === 'current' && addPressed
          ? {...item, addPressed: true, pressed: true}
      : item
  );

  if (linkedTodoVisible) {
    items.splice(3, 0, {
      id: 'launch-thread',
      title: launchFilmStory.threads.addDiscountCodeSupport.title,
      noteType: 'task',
      style: {
        opacity: linkedTodoEnter,
        transform: `translateY(${mix(12, 0, linkedTodoEnter)}px) scale(${mix(0.985, 1, linkedTodoEnter)})`,
      },
    });
  }

  return {
    ...notesTaskListState,
    activeId: linkedTodoVisible ? 'launch-thread' : markedComplete ? 'receipt-emails' : notesTaskListState.activeId,
    items,
  };
}

export function notesViewForFrame(frame: number) {
  const imageEnter = ease(frame, 150, 176);
  const animatedLines = notesEditorCopy.animatedLines.map((line, index): NotesEditorLineView => {
    const text = textReveal(line.text, frame, line.from, line.to);
    return {
      caretVisible: frame >= (line.caretFrom ?? 0) && frame < (line.caretUntil ?? -1),
      id: `animated-${index}`,
      references: text.includes(launchPrFlowReference.token) ? [launchPrFlowReference] : undefined,
      text,
    };
  });

  return {
    animatedLines,
    image: frame > 150
      ? {
          alt: 'Supafan checkout flow diagram',
          bubbleOpen: frame > 178 && frame < 248,
          resizeButtonPressed: frame > 188 && frame <= 200,
          resizeOpen: frame > 194 && frame < 248,
          sliderPressed: frame > 200 && frame < 240,
          src: launchImageSrc,
          style: {
            opacity: imageEnter,
            transform: `translateY(${mix(18, 0, imageEnter)}px) scale(${mix(0.985, 1, imageEnter)})`,
          },
          widthPercent: frame > 200 ? Math.round(76 - Math.min(1, (frame - 200) / 48) * 22) : 76,
        }
      : undefined,
  };
}

export function notesShotViewForFrame(frame: number): NotesShotView {
  const view = notesViewForFrame(frame);
  const tasklistPressed = frame > 204 && frame < 220;
  const home = {
    ...notesHomeState,
    recent: notesHomeState.recent.map(note => note.id === 'recent-current'
      ? {...note, pressed: frame > 72 && frame < 88}
      : note
    ),
  };
  return {
    breadcrumbs: notesEditorCopy.breadcrumbs,
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

export function notesHomeViewForFrame(frame: number): NotesShotView['home'] {
  const greeting = textReveal(notesHomeState.greeting, frame, -4, 40);
  const showSearch = frame >= 44;
  const showRecent = frame >= 62;
  const newNotePressed = frame >= 136 && frame < 154;

  return {
    ...notesHomeState,
    favorites: [],
    greeting,
    newNotePressed,
    recent: showRecent ? notesHomeState.recent.map(note => ({...note, active: false, pressed: false})) : [],
    showFavorites: false,
    showRecent,
    showSearch,
  };
}

export function notesEditorViewForFrame(frame: number): NotesShotView {
  const tasklistPressed = frame >= 68 && frame < 88;
  const tasklistActive = frame >= 88;
  const todoPressed = frame >= 130 && frame < 148;
  const todoActive = frame >= 148;
  const todoCompletePressed = frame >= 168 && frame < 180;
  const todoComplete = frame >= 180;

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
          caretVisible: index === newNoteCopy.lines.length - 1 && frame < 68,
          id: `new-note-${index}`,
          text: textReveal(text, frame, 8 + index * 18, 34 + index * 18),
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
          text: textReveal(text, frame, 106 + index * 10, 132 + index * 10),
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
        text: todoComplete ? text : '',
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
  const tasklistActive = frame >= 88;
  const todoActive = frame >= 148;
  const todoPressed = frame >= 130 && frame < 148;
  const todoCompletePressed = frame >= 168 && frame < 180;
  const todoComplete = frame >= 180;

  return {
    ...notesTaskListState,
    activeId: tasklistActive && todoActive ? 'resize-image' : null,
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
