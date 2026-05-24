import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {KanbanBoard} from '../../agentbuddy-ui/threads/KanbanBoard';
import {KanbanColumn} from '../../agentbuddy-ui/threads/KanbanColumn';
import {ThreadKanbanCard} from '../../agentbuddy-ui/threads/ThreadKanbanCard';
import {ThreadsHeader} from '../../agentbuddy-ui/threads/ThreadsHeader';
import {boardShotState, boardViewForFrame} from '../state/board';
import {useAppWindowLayout} from '../appWindowLayout';
import './BoardShot.module.css';
import {makeStyles} from '../../agentbuddy-ui/primitives/makeStyles';
const styles = makeStyles('BoardShot');

export function BoardShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const view = boardViewForFrame(frame);
  const layout = useAppWindowLayout({variant});
  return (
    <AppWindow activePlugin="threads" breadcrumbs={boardShotState.breadcrumbs} composer={false} layout={layout}>
      <div className={styles.surface}>
        <ThreadsHeader state={boardShotState.header} />
        <KanbanBoard>
          {boardShotState.columns.map(column => (
            <KanbanColumn title={column.title} count={column.count} tone={column.tone}>
              {column.cards.map(card => <ThreadKanbanCard muted={card.muted} tags={card.tags}>{card.title}</ThreadKanbanCard>)}
            </KanbanColumn>
          ))}
          <div className={styles.movingTask} style={view.movingCardStyle}><ThreadKanbanCard active tags={boardShotState.movingCard.tags}>{boardShotState.movingCard.title}</ThreadKanbanCard></div>
        </KanbanBoard>
      </div>
    </AppWindow>
  );
}
