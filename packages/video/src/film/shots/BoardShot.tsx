import type {CSSProperties} from 'react';
import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {KanbanBoard, KanbanColumn, TaskCard} from '../../agentbuddy-ui/threads/KanbanBoard';
import {ease, mix} from '../state/timeline';
import './BoardShot.module.css';
import {makeStyles} from '../../agentbuddy-ui/primitives/makeStyles';
const styles = makeStyles('BoardShot');

export function BoardShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const p = ease(frame, 70, 170);
  const movingStyle: CSSProperties = {left: `${mix(8, 40, p)}%`, top: `${mix(34, 24, p)}%`, transform: `rotate(${mix(-2, 1, p)}deg)`};
  return (
    <AppWindow activePlugin="actions" variant={variant} breadcrumbs={['Threads', 'Board']}>
      <KanbanBoard>
        <KanbanColumn title="Backlog" count={1}><TaskCard muted>Ship capture-state renderer</TaskCard></KanbanColumn>
        <KanbanColumn title="In Progress" count={2}><TaskCard>Automate release checks</TaskCard></KanbanColumn>
        <KanbanColumn title="Done" count={0} />
        <div className={styles.movingTask} style={movingStyle}><TaskCard active>Publish launch film cutdown</TaskCard></div>
      </KanbanBoard>
    </AppWindow>
  );
}
