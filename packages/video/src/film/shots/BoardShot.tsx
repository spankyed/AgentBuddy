import type {CSSProperties} from 'react';
import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {KanbanBoard} from '../../agentbuddy-ui/threads/KanbanBoard';
import {KanbanColumn} from '../../agentbuddy-ui/threads/KanbanColumn';
import {ThreadKanbanCard} from '../../agentbuddy-ui/threads/ThreadKanbanCard';
import {ThreadsHeader} from '../../agentbuddy-ui/threads/ThreadsHeader';
import {ease, mix} from '../state/timeline';
import './BoardShot.module.css';
import {makeStyles} from '../../agentbuddy-ui/primitives/makeStyles';
const styles = makeStyles('BoardShot');

export function BoardShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const p = ease(frame, 70, 170);
  const movingStyle: CSSProperties = {left: `${mix(8, 40, p)}%`, top: `${mix(34, 24, p)}%`, transform: `rotate(${mix(-2, 1, p)}deg)`};
  return (
    <AppWindow activePlugin="threads" variant={variant} breadcrumbs={['Threads', 'Board']} composer={false}>
      <div className={styles.surface}>
        <ThreadsHeader activeView="kanban" />
        <KanbanBoard>
          <KanbanColumn title="Backlog" count={1} tone="neutral"><ThreadKanbanCard muted>Ship capture-state renderer</ThreadKanbanCard></KanbanColumn>
          <KanbanColumn title="In Progress" count={2} tone="blue"><ThreadKanbanCard>Automate release checks</ThreadKanbanCard></KanbanColumn>
          <KanbanColumn title="Done" count={0} tone="emerald" />
          <div className={styles.movingTask} style={movingStyle}><ThreadKanbanCard active>Publish launch film cutdown</ThreadKanbanCard></div>
        </KanbanBoard>
      </div>
    </AppWindow>
  );
}
