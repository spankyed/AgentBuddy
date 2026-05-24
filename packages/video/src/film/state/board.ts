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
  movingCard: string;
} = {
  breadcrumbs: ['Threads', 'Board'],
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
  movingCard: 'Publish launch film cutdown',
};
