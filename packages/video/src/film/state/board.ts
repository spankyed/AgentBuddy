import {ease, mix} from './timeline';

type BoardCardState = {
  muted?: boolean;
  tags?: string[];
  title: string;
};

type BoardColumnState = {
  cards: BoardCardState[];
  count: number;
  title: string;
  tone: 'neutral' | 'blue' | 'emerald';
};

export const boardShotState: {
  breadcrumbs: string[];
  columns: BoardColumnState[];
  header: {
    activeFilterCount?: number;
    activeView: 'list' | 'kanban' | 'dashboard';
    filterLabel: string;
    newThreadLabel: string;
    searchPlaceholder: string;
    subtitle: string;
  };
  movingCard: {
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
    tags: string[];
    title: string;
  };
} = {
  breadcrumbs: ['Threads', 'Board'],
  header: {
    activeView: 'kanban',
    filterLabel: 'Filter',
    newThreadLabel: 'New Thread',
    searchPlaceholder: 'Search threads...',
    subtitle: 'Manage agent threads',
  },
  columns: [
    {
      count: 1,
      cards: [{title: 'Ship capture-state renderer', muted: true, tags: ['video']}],
      title: 'Backlog',
      tone: 'neutral',
    },
    {
      count: 2,
      cards: [{title: 'Automate release checks', tags: ['launch']}],
      title: 'In Progress',
      tone: 'blue',
    },
    {
      count: 0,
      cards: [],
      title: 'Done',
      tone: 'emerald',
    },
  ],
  movingCard: {
    title: 'Publish launch film cutdown',
    tags: ['launch'],
    motion: {
      from: 70,
      to: 170,
      fromLeft: 8,
      toLeft: 40,
      fromTop: 34,
      toTop: 24,
      fromRotation: -2,
      toRotation: 1,
    },
  },
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
