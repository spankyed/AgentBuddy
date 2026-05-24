import {useCurrentFrame} from 'remotion';
import {KanbanColumn} from '../../agentbuddy-ui/threads/KanbanColumn';
import {ThreadKanbanCard} from '../../agentbuddy-ui/threads/ThreadKanbanCard';
import {ThreadsHeader} from '../../agentbuddy-ui/threads/ThreadsHeader';
import {SurfaceFrame} from '../../film/SurfaceFrame';
import {BoardShot} from '../../film/shots/BoardShot';
import {boardShotState} from '../../film/state/board';
import {DemoBoardArea, DemoHeaderArea} from '../DemoLayout';

export const ThreadsHeaderDemo = () => (
  <SurfaceFrame>
    <DemoHeaderArea>
      <ThreadsHeader state={boardShotState.header} />
    </DemoHeaderArea>
  </SurfaceFrame>
);

export const KanbanComponentsDemo = () => (
  <SurfaceFrame>
    <DemoBoardArea>
      <ThreadsHeader state={boardShotState.header} />
      <div style={{display: 'flex', flex: 1, gap: 16, minHeight: 0, padding: 24}}>
        <KanbanColumn title={boardShotState.columns[0].title} count={boardShotState.columns[0].count} tone={boardShotState.columns[0].tone}>
          <ThreadKanbanCard muted={boardShotState.columns[0].cards[0]?.muted} tags={boardShotState.columns[0].cards[0]?.tags}>
            {boardShotState.columns[0].cards[0]?.title}
          </ThreadKanbanCard>
        </KanbanColumn>
        <KanbanColumn title={boardShotState.columns[1].title} count={boardShotState.columns[1].count} tone={boardShotState.columns[1].tone}>
          <ThreadKanbanCard tags={boardShotState.columns[1].cards[0]?.tags}>
            {boardShotState.columns[1].cards[0]?.title}
          </ThreadKanbanCard>
        </KanbanColumn>
      </div>
    </DemoBoardArea>
  </SurfaceFrame>
);

export const BoardSurfaceDemo = () => {
  const frame = useCurrentFrame();
  return (
    <SurfaceFrame>
      <BoardShot frame={frame} />
    </SurfaceFrame>
  );
};
