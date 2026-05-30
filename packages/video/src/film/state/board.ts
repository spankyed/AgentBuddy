import type {KanbanBoardState, KanbanCardState, ThreadsHeaderState} from '../../agentbuddy-ui/threads/threadTypes';
import type {ThreadCreateFormState} from '../../agentbuddy-ui/threads/ThreadCreateForm';
import type {ThreadDashboardSurfaceState} from '../../agentbuddy-ui/threads/ThreadDashboardSurface';
import {launchPlanArtifact} from './chat';
import {launchFilmStory} from './launchStory';
import {ease, mix, textReveal} from './timeline';

export type BoardShotView = {
  board: KanbanBoardState;
  breadcrumbs: string[];
  createForm?: ThreadCreateFormState;
  dashboard?: ThreadDashboardSurfaceState;
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
    artifactSidebar: [
      {id: launchFilmStory.threads.stripePaymentIntegration.id, title: launchFilmStory.threads.stripePaymentIntegration.title, meta: 'done'},
      {id: launchFilmStory.threads.checkoutImplementation.id, title: launchFilmStory.threads.checkoutImplementation.title, meta: 'approved'},
      {id: launchFilmStory.threads.deployChecklist.id, title: launchFilmStory.threads.deployChecklist.title, meta: 'ready'},
      {id: launchFilmStory.threads.receiptEmailTemplates.id, title: launchFilmStory.threads.receiptEmailTemplates.title, meta: 'next'},
    ],
    artifact: {
      ...launchPlanArtifact,
      content: {
        ...launchPlanArtifact.content,
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
    instructions: 'Create the discount code validation endpoint and checkout price adjustment. Link it to the parent checkout thread and keep the Stripe integration visible.',
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
      from: 282,
      to: 304,
      fromLeft: 8,
      toLeft: 40,
      fromTop: 34,
      toTop: 24,
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
  const createVisible = frame >= 88 && frame < 264;
  const createFrame = Math.max(0, frame - 88);
  const draggingCard = frame >= boardShotState.movingCard.motion.from && frame < boardShotState.movingCard.motion.to;
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
        createPressed: createFrame > 158 && createFrame < 170,
        instructions: textReveal(boardShotState.createForm.instructions, createFrame, 42, 86),
        instructionsCaretVisible: createFrame >= 34 && createFrame < 86,
        linkPressed: createFrame > 124 && createFrame <= 136,
        linkedThreadsOpen: createFrame >= 104,
        linkInputVisible: createFrame >= 104 && createFrame <= 140,
        linkedThreadCandidate: createFrame > 120 && createFrame <= 136 ? boardShotState.createForm.parentThread : undefined,
        linkedThreadQuery: createFrame > 112 ? textReveal(boardShotState.createForm.linkedThreadQuery ?? '', createFrame, 112, 126) : '',
        parentThread: createFrame > 136 ? boardShotState.createForm.parentThread : undefined,
        tagsOpen: false,
        title: textReveal(boardShotState.createForm.title, createFrame, 10, 34),
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
    dashboard: dashboardVisible
      ? {
          ...boardShotState.dashboard,
          header: {
            ...boardShotState.header,
            activeView: 'dashboard',
            newThreadPressed: frame > 72 && frame < 86,
            pressedView: undefined,
          },
          hoveredTabId: frame >= 24 && frame < 66 ? launchFilmStory.threads.stripePaymentIntegration.id : undefined,
        }
      : undefined,
    header: {
      ...boardShotState.header,
      activeView: dashboardVisible ? 'dashboard' : frame < 282 ? 'list' : 'kanban',
      hoveredView: frame > 272 && frame < 282 ? 'kanban' : undefined,
      newThreadPressed: frame > 72 && frame < 86,
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
