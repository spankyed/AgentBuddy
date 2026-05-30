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

  if (frame >= 174 && frame < 198) {
    return cursorMove(targets, {end: 190, from: 'instructionsField', start: 174, to: 'linkThreadButton'}, 'percent');
  }

  if (frame >= 198 && frame < 228) {
    return cursorMove(targets, {
      end: 216,
      from: 'linkThreadButton',
      fromPoint: {anchor: [0.55, 0.5]},
      start: 198,
      to: 'linkActionButton',
      toPoint: {anchor: [0.5, 0.5]},
    }, 'percent');
  }

  if (frame >= 228 && frame < 244) {
    return cursorMove(targets, {
      click: false,
      end: 240,
      from: 'linkActionButton',
      fromPoint: {anchor: [0.5, 0.5]},
      start: 228,
      to: 'linkActionButton',
      toPoint: {anchor: [0.5, 0.5]},
    }, 'percent');
  }

  if (frame >= 244 && frame < 264) {
    return cursorMove(targets, {end: 258, from: 'linkActionButton', start: 244, to: 'createSaveButton'}, 'percent');
  }

  if (frame >= 264 && frame < 282) {
    return cursorMove(targets, {
      end: 276,
      from: 'createSaveButton',
      fromPoint: {anchor: [0.5, 0.5]},
      start: 264,
      to: 'kanbanViewButton',
      toPoint: {anchor: [0.5, 0.5]},
    }, 'percent');
  }

  if (frame >= 282 && frame < 292) {
    return cursorMove(targets, {
      end: 290,
      from: 'kanbanViewButton',
      start: 282,
      to: 'activeCard',
    }, 'percent');
  }

  if (frame >= 292 && frame < 300) {
    return cursorMove(targets, {
      end: 300,
      from: 'activeCard',
      start: 292,
      to: 'inProgressDrop',
    }, 'percent');
  }

  return null;
}

function boardCursorTargets(): Record<string, TargetRect> {
  return {
    activeCard: percentTarget(27, 38, 6, 6),
    boardCenter: percentTarget(51, 47, 6, 6),
    boardToolbar: percentTarget(56, 9.5, 7, 3),
    createSaveButton: percentTarget(94.5, 11.8, 5, 3),
    createThreadButton: percentTarget(91, 9.6, 5, 3),
    dashboardArea: percentTarget(65, 21, 6, 6),
    inProgressDrop: percentTarget(48, 34, 6, 6),
    instructionsField: percentTarget(46, 34, 12, 5),
    kanbanViewButton: percentTarget(57.7, 9.6, 2.5, 3),
    linkActionButton: percentTarget(82, 40, 4.5, 3),
    linkThreadButton: percentTarget(87, 33.2, 9, 3),
  };
}
