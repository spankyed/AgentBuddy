import type {KanbanBoardState, KanbanCardState, ThreadsHeaderState} from '../../agentbuddy-ui/threads/threadTypes';
import type {ThreadCreateFormState} from '../../agentbuddy-ui/threads/ThreadCreateForm';
import type {ThreadDashboardSurfaceState} from '../../agentbuddy-ui/threads/ThreadDashboardSurface';
import {launchPlanArtifact} from './chat';
import {launchFilmStory} from './launchStory';
import {ease, mix} from './timeline';
import {revealText} from './typing';
import {createInteractionModel, type InteractionStep} from '../interaction/interactionTimeline';
import {percentTarget, type TargetRect} from '../interaction/cursorTargets';

// Board pointer interactions — the single source of truth shared by the
// scene's cursor and the press/hover states below.
export type BoardTargetId =
  | 'dashboardArea'
  | 'activeDashboardTabPin'
  | 'createThreadButton'
  | 'linkThreadButton'
  | 'linkActionButton'
  | 'createSaveButton'
  | 'kanbanViewButton'
  | 'activeCard'
  | 'inProgressDrop';

export const boardInteractionScript: InteractionStep<BoardTargetId>[] = [
  {label: 'pin-thread', start: 22, end: 48, to: 'activeDashboardTabPin', from: 'dashboardArea', toPoint: {anchor: [0.5, 0.5]}},
  {label: 'open-create', start: 54, end: 84, to: 'createThreadButton', from: 'activeDashboardTabPin', fromPoint: {anchor: [0.5, 0.5]}, toPoint: {anchor: [0.5, 0.5]}},
  {label: 'open-link', start: 174, end: 190, to: 'linkThreadButton', from: 'createThreadButton', fromPoint: {anchor: [0.5, 0.5]}},
  {label: 'reach-link-action', start: 198, end: 216, to: 'linkActionButton', from: 'linkThreadButton', toPoint: {anchor: [0.5, 0.5]}, click: false},
  {label: 'hold-link-action', start: 228, end: 240, to: 'linkActionButton', from: 'linkActionButton', fromPoint: {anchor: [0.5, 0.5]}, toPoint: {anchor: [0.5, 0.5]}, click: false},
  {label: 'save-thread', start: 244, end: 258, to: 'createSaveButton', from: 'linkActionButton', fromPoint: {anchor: [0.5, 0.5]}},
  {label: 'to-kanban', start: 270, end: 282, to: 'kanbanViewButton', from: 'createSaveButton', toPoint: {anchor: [0.5, 0.5]}},
  // Kanban settles (282-294), then the cursor travels to the resting card over
  // ~1s and clicks to grab it (ripple at 326). The card stays in its Backlog
  // slot until the grab — only then does it lift and drag to In Progress.
  {label: 'grab-card', start: 294, end: 326, to: 'activeCard', from: 'kanbanViewButton', fromPoint: {anchor: [0.5, 0.5]}, toPoint: {anchor: [0.5, 0.5]}},
  {label: 'drag-card', start: 330, end: 362, to: 'inProgressDrop', from: 'activeCard', fromPoint: {anchor: [0.5, 0.5]}, toPoint: {anchor: [0.5, 0.5]}, click: false},
];
export const boardInteractions = createInteractionModel(boardInteractionScript);

// The grab/drop cursor targets must land on the real card, so they are derived
// from the actual app-window box rather than fixed viewport percentages — the
// landscape and square windows have different margins, so a single percent
// target would hit the card in one variant and miss in the other. Offsets are
// the kanban's fixed layout chrome (sidebar, header, board padding, card rows).
export function boardDragTargets(
  windowBox: {height: number; left: number; top: number; width: number},
  viewport: {height: number; width: number},
): {activeCard: TargetRect; inProgressDrop: TargetRect} {
  const SIDEBAR = 72;
  const BOARD_TOP = 126;     // breadcrumb bar (42) + threads header (60) + board padding (24)
  const HEADER_TO_CARD = 52; // column header + gap down to the first card
  const CARD_HEIGHT = 62;
  const CARD_GAP = 16;
  const BOARD_PAD = 24;
  const COL_GAP = 16;
  const CARD_MARGIN = 12;
  const boardWidth = windowBox.width - SIDEBAR;
  const colWidth = (boardWidth - BOARD_PAD * 2 - COL_GAP * 2) / 3;
  // The grabbed card is the 2nd Backlog card; it drops into the 2nd slot of In
  // Progress — both sit on the same row, so they share a Y.
  const rowCenterY = windowBox.top + BOARD_TOP + HEADER_TO_CARD + CARD_HEIGHT + CARD_GAP + CARD_HEIGHT / 2;
  const cardCenterX = (columnIndex: number) =>
    windowBox.left + SIDEBAR + BOARD_PAD + columnIndex * (colWidth + COL_GAP) + CARD_MARGIN + (colWidth - CARD_MARGIN * 2) / 2;
  const point = (x: number, y: number) => percentTarget((x / viewport.width) * 100, (y / viewport.height) * 100);
  return {
    activeCard: point(cardCenterX(0), rowCenterY),
    inProgressDrop: point(cardCenterX(1), rowCenterY),
  };
}

export type BoardShotView = {
  board: KanbanBoardState;
  breadcrumbs: string[];
  createForm?: ThreadCreateFormState;
  createFormStyle?: {opacity: number};
  dashboard?: ThreadDashboardSurfaceState;
  dashboardStyle?: {opacity: number};
  header: ThreadsHeaderState;
  mode: 'dashboard' | 'create' | 'board';
  movingCard: {
    card: KanbanCardState;
    style: {
      left: string;
      top: string;
      transform: string;
    };
  } | undefined;
};

export const boardShotState: {
  board: KanbanBoardState;
  breadcrumbs: string[];
  createForm: ThreadCreateFormState;
  dashboard: ThreadDashboardSurfaceState;
  header: ThreadsHeaderState;
  movingCard: {
    card: KanbanCardState;
    motion: {
      from: number;
      fromLeft: number;
      fromRotation: number;
      fromTop: number;
      grab: number;
      to: number;
      toLeft: number;
      toRotation: number;
      toTop: number;
    };
  };
} = {
  breadcrumbs: ['Threads', 'Board'],
  dashboard: {
    activeTabId: launchFilmStory.threads.stripePaymentIntegration.id,
    // The active thread's artifacts (a flat list, like the real content viewer).
    artifactSidebar: [
      {id: launchPlanArtifact.id, title: launchPlanArtifact.title, type: 'plan'},
      {id: 'checkout-stripe-diff', title: 'checkout.ts, stripe.ts', type: 'diff'},
      {id: 'checkout-claude-session', title: 'Claude Code session', type: 'claude-session', color: 'purple'},
    ],
    artifact: {
      ...launchPlanArtifact,
      content: {
        ...launchPlanArtifact.content,
        branch: launchFilmStory.branch,
        status: 'approved',
      },
    },
    tabs: [
      {id: launchFilmStory.threads.deployChecklist.id, label: launchFilmStory.threads.deployChecklist.title, pinned: true},
      {id: launchFilmStory.threads.stripePaymentIntegration.id, label: launchFilmStory.threads.stripePaymentIntegration.title, pinned: true},
      {id: launchFilmStory.threads.checkoutImplementation.id, label: launchFilmStory.threads.checkoutImplementation.title},
      {id: launchFilmStory.threads.receiptEmailTemplates.id, label: launchFilmStory.threads.receiptEmailTemplates.title},
    ],
  },
  createForm: {
    instructions: 'Validate discount codes and adjust pricing.',
    linkedThreadQuery: launchFilmStory.threads.checkoutImplementation.title,
    parentThread: {
      relation: 'parent_of',
      shortCode: launchFilmStory.threads.checkoutImplementation.shortCode,
      status: 'Active',
      tags: ['checkout'],
      title: launchFilmStory.threads.checkoutImplementation.title,
    },
    tags: [],
    title: launchFilmStory.threads.addDiscountCodeSupport.title,
  },
  header: {
    activeView: 'kanban',
    filterLabel: 'Filter',
    newThreadLabel: 'New Thread',
    searchPlaceholder: 'Search threads...',
    subtitle: 'Manage agent threads',
  },
  board: {
    columns: [
      {
        cards: [
          {title: 'Draft creator payout spec', tags: ['parent'], updatedAt: '12m ago'},
          {title: launchFilmStory.threads.addDiscountCodeSupport.title, tags: ['checkout'], updatedAt: 'just now'},
        ],
        title: 'Backlog',
        tone: 'neutral',
      },
      {
        cards: [{title: 'Wire receipt email templates', tags: ['receipts'], updatedAt: '4m ago'}],
        title: 'In Progress',
        tone: 'blue',
      },
      {
        cards: [],
        title: 'Done',
        tone: 'emerald',
      },
    ],
  },
  movingCard: {
    card: {
      title: launchFilmStory.threads.addDiscountCodeSupport.title,
      tags: ['checkout'],
      updatedAt: 'just now',
    },
    motion: {
      // Card is grabbed at `grab` (lifts in place), then slides `from`->`to`.
      grab: 326,
      from: 330,
      to: 362,
      fromLeft: 3,
      toLeft: 34,
      fromTop: 19,
      toTop: 21,
      fromRotation: -2,
      toRotation: 1,
    },
  },
};

export const threadsHeaderSearchState: ThreadsHeaderState = {
  ...boardShotState.header,
  searchKeyword: 'checkout',
};

export const threadsHeaderFilterState: ThreadsHeaderState = {
  ...boardShotState.header,
  activeFilterCount: 2,
  filterPopover: {
    visible: true,
    rootOnly: true,
    showArchived: false,
    statuses: [
      {label: 'Active', selected: true, color: '#2563eb'},
      {label: 'Paused', color: '#a16207'},
      {label: 'Done', color: '#16a34a'},
    ],
    tags: [
      {label: 'checkout', selected: true, color: '#7c3aed'},
      {label: 'payments', color: '#0891b2'},
      {label: 'bug', color: '#dc2626'},
    ],
    chatStates: [
      {label: 'Has tools', selected: true, color: '#0d9488'},
      {label: 'Needs reply', color: '#64748b'},
    ],
  },
};

export const threadsHeaderArchiveState: ThreadsHeaderState = {
  ...boardShotState.header,
  showArchived: true,
};

export function boardViewForFrame(frame: number) {
  const motion = boardShotState.movingCard.motion;
  const progress = ease(frame, motion.from, motion.to);
  return {
    movingCardStyle: {
      left: `${mix(motion.fromLeft, motion.toLeft, progress)}%`,
      top: `${mix(motion.fromTop, motion.toTop, progress)}%`,
      transform: `rotate(${mix(motion.fromRotation, motion.toRotation, progress)}deg)`,
    },
  };
}

export function boardShotViewForFrame(frame: number): BoardShotView {
  const view = boardViewForFrame(frame);
  const dashboardVisible = frame < 88;
  const dashboardThreadPinned = boardInteractions.clicked('activeDashboardTabPin', frame, 12);
  const createVisible = frame >= 88 && frame < 264;
  const createFrame = Math.max(0, frame - 88);
  // Crossfade dashboard -> create form -> board list instead of hard pops.
  const formEnter = ease(frame, 88, 96);
  const formExit = ease(frame, 256, 264);
  const dashboardShown = frame < 96;
  // The card lifts at the grab, holds its slot for a few frames, then slides.
  const draggingCard = frame >= boardShotState.movingCard.motion.grab && frame < boardShotState.movingCard.motion.to;
  const droppedCard = frame >= boardShotState.movingCard.motion.to;
  const boardColumns = boardShotState.board.columns.map(column => {
    if (column.title === 'Backlog') {
      return {
        ...column,
        cards: droppedCard || draggingCard
          ? column.cards.filter(card => card.title !== boardShotState.movingCard.card.title)
          : column.cards,
        count: droppedCard || draggingCard ? column.cards.length - 1 : column.cards.length,
      };
    }

    if (column.title === 'In Progress') {
      return {
        ...column,
        cards: droppedCard
          ? [...column.cards, {...boardShotState.movingCard.card, tags: ['checkout']}]
          : column.cards,
        count: droppedCard ? column.cards.length + 1 : column.cards.length,
      };
    }

    return column;
  });
  const createForm = createVisible
    ? {
        ...boardShotState.createForm,
        createPressed: boardInteractions.pressed('createSaveButton', frame, {lead: 12, tail: 0}),
        instructions: revealText(boardShotState.createForm.instructions, createFrame, 42),
        instructionsCaretVisible: createFrame >= 34 && createFrame < 86,
        // The link action has no discrete click (a hold opens the dropdown), so
        // its press is gated on the cursor hovering it.
        linkPressed: boardInteractions.hovered('linkActionButton', frame) && createFrame > 124 && createFrame <= 136,
        linkedThreadsOpen: createFrame >= 104,
        linkInputVisible: createFrame >= 104 && createFrame <= 140,
        linkedThreadCandidate: createFrame > 120 && createFrame <= 136 ? boardShotState.createForm.parentThread : undefined,
        // Type a short search prefix (fits before the candidate is picked at
        // ~136); the full thread title still shows as the matched candidate.
        linkedThreadQuery: createFrame > 112 ? revealText((boardShotState.createForm.linkedThreadQuery ?? '').slice(0, 13), createFrame, 112) : '',
        parentThread: createFrame > 136 ? boardShotState.createForm.parentThread : undefined,
        tagsOpen: false,
        title: revealText(boardShotState.createForm.title, createFrame, 10),
        titleCaretVisible: createFrame >= 0 && createFrame < 34,
      }
    : undefined;
  return {
    board: {
      ...boardShotState.board,
      columns: boardColumns,
    },
    breadcrumbs: frame < 96 ? ['Threads', 'Dashboard'] : createVisible ? ['Threads', 'New Thread'] : boardShotState.breadcrumbs,
    createForm,
    createFormStyle: createVisible ? {opacity: Math.min(formEnter, 1 - formExit)} : undefined,
    dashboard: dashboardShown
      ? {
          ...boardShotState.dashboard,
          pinPressed: boardInteractions.pressed('activeDashboardTabPin', frame, {lead: -4, tail: 12}),
          pinned: dashboardThreadPinned,
          header: {
            ...boardShotState.header,
            activeView: 'dashboard',
            newThreadPressed: boardInteractions.pressed('createThreadButton', frame, {lead: 12, tail: 2}),
            pressedView: undefined,
          },
          // Tab stays hovered from the cursor reaching it until it leaves for the create button.
          hoveredTabId: boardInteractions.clicked('activeDashboardTabPin', frame, -24) && !boardInteractions.clicked('createThreadButton', frame, -18) ? launchFilmStory.threads.stripePaymentIntegration.id : undefined,
        }
      : undefined,
    dashboardStyle: dashboardShown ? {opacity: 1 - formEnter} : undefined,
    header: {
      ...boardShotState.header,
      activeView: dashboardVisible ? 'dashboard' : frame < 282 ? 'list' : 'kanban',
      hoveredView: boardInteractions.hovered('kanbanViewButton', frame) ? 'kanban' : undefined,
      newThreadPressed: boardInteractions.pressed('createThreadButton', frame, {lead: 12, tail: 2}),
      pressedView: undefined,
    },
    mode: dashboardVisible ? 'dashboard' : createVisible ? 'create' : 'board',
    movingCard: draggingCard
      ? {
          card: boardShotState.movingCard.card,
          style: view.movingCardStyle,
        }
      : undefined,
  };
}
