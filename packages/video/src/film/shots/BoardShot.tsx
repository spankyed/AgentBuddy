import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {ThreadDashboardSurface} from '../../agentbuddy-ui/threads/ThreadDashboardSurface';
import {ThreadCreateForm} from '../../agentbuddy-ui/threads/ThreadCreateForm';
import {ThreadsBoardSurface} from '../../agentbuddy-ui/threads/ThreadsBoardSurface';
import {Cursor} from '../overlays/Cursor';
import {cursorMove, percentTarget} from '../interaction/cursorTargets';
import type {CursorPath, TargetRect} from '../interaction/cursorTargets';
import {boardShotViewForFrame} from '../state/board';
import {useAppWindowLayout} from '../appWindowLayout';
import {makeStyles} from '../../agentbuddy-ui/primitives/makeStyles';
import './BoardShot.module.css';

const styles = makeStyles('BoardShot');

export function BoardShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const view = boardShotViewForFrame(frame);
  const layout = useAppWindowLayout({variant});
  const cursor = boardCursorForFrame(frame);

  return (
    <div className={styles.root}>
      <div className={styles.appReveal}>
        <AppWindow activePlugin="threads" breadcrumbs={view.breadcrumbs} composer={false} layout={layout}>
          {view.dashboard ? (
            <div className={styles.surfaceReveal}>
              <ThreadDashboardSurface state={view.dashboard} />
            </div>
          ) : null}
          {!view.dashboard && (frame >= 150 || !view.createForm) ? (
            <div className={styles.surfaceReveal}>
              <ThreadsBoardSurface
                board={view.board}
                header={view.header}
                movingCard={view.movingCard}
              />
            </div>
          ) : null}
          {view.createForm ? (
            <div className={styles.surfaceReveal}>
              <ThreadCreateForm state={view.createForm} />
            </div>
          ) : null}
        </AppWindow>
      </div>
      {cursor ? <Cursor frame={frame} {...cursor} /> : null}
    </div>
  );
}

function boardCursorForFrame(frame: number):
  | CursorPath
  | null {
  const targets = boardCursorTargets();

  if (frame >= 58 && frame < 92) {
    return cursorMove(targets, {end: 84, from: 'dashboardArea', start: 58, to: 'createThreadButton'}, 'percent');
  }

  if (frame >= 142 && frame < 170) {
    return cursorMove(targets, {end: 164, from: 'boardCenter', start: 142, to: 'activeCard'}, 'percent');
  }

  if (frame >= 178 && frame < 208) {
    return cursorMove(targets, {end: 198, from: 'activeCard', start: 178, to: 'createThreadButton'}, 'percent');
  }

  if (frame >= 208 && frame < 236) {
    return cursorMove(targets, {
      end: 228,
      from: 'createThreadButton',
      fromPoint: {anchor: [0.25, 0.5]},
      start: 208,
      to: 'boardToolbar',
      toPoint: {anchor: [0.58, 0.5]},
    }, 'percent');
  }

  return null;
}

function boardCursorTargets(): Record<string, TargetRect> {
  return {
    activeCard: percentTarget(75, 46, 6, 6),
    boardCenter: percentTarget(51, 47, 6, 6),
    boardToolbar: percentTarget(56, 9.5, 7, 3),
    createThreadButton: percentTarget(91, 9.6, 5, 3),
    dashboardArea: percentTarget(65, 21, 6, 6),
  };
}
