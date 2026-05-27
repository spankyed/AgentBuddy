import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {ThreadDashboardSurface} from '../../agentbuddy-ui/threads/ThreadDashboardSurface';
import {ThreadCreateForm} from '../../agentbuddy-ui/threads/ThreadCreateForm';
import {ThreadsBoardSurface} from '../../agentbuddy-ui/threads/ThreadsBoardSurface';
import {Cursor} from '../overlays/Cursor';
import {boardShotViewForFrame} from '../state/board';
import {useAppWindowLayout} from '../appWindowLayout';
import {ease, mix} from '../state/timeline';
import {makeStyles} from '../../agentbuddy-ui/primitives/makeStyles';
import './BoardShot.module.css';

const styles = makeStyles('BoardShot');

export function BoardShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const view = boardShotViewForFrame(frame);
  const layout = useAppWindowLayout({variant});
  const createExit = 1 - ease(frame, 194, 208);
  const createBoardExit = 1 - ease(frame, 198, 212);
  const boardReveal = ease(frame, 204, 230);
  const createReveal = ease(frame, 92, 118);
  const dashboardCreateExit = view.createForm ? 1 - ease(frame, 88, 106) : 1;
  const cursor = boardCursorForFrame(frame);

  return (
    <div className={styles.root}>
      <div className={styles.appReveal}>
        <AppWindow activePlugin="threads" breadcrumbs={view.breadcrumbs} composer={false} layout={layout}>
          {view.dashboard ? (
            <div
              className={styles.surfaceReveal}
              style={{
                opacity: dashboardCreateExit,
              }}
            >
              <ThreadDashboardSurface state={view.dashboard} />
            </div>
          ) : null}
          {!view.dashboard && (frame >= 150 || !view.createForm) ? (
            <div
              className={styles.surfaceReveal}
              style={{
                opacity: boardReveal,
                transform: `translateY(${mix(24, 0, boardReveal)}px) scale(${mix(0.99, 1, boardReveal)})`,
              }}
            >
              <ThreadsBoardSurface
                board={view.board}
                header={view.header}
                movingCard={view.movingCard}
              />
            </div>
          ) : null}
          {view.createForm ? (
            <div
              className={styles.surfaceReveal}
              style={{
                opacity: Math.min(createReveal, createExit, createBoardExit),
                transform: `translateY(${mix(20, -18, 1 - createExit)}px) scale(${mix(0.992, 1, createReveal)})`,
              }}
            >
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
  | {end: number; from: [number, number]; start: number; to: [number, number]}
  | null {
  if (frame >= 58 && frame < 92) {
    return {end: 84, from: [68, 24], start: 58, to: [93, 11]};
  }

  if (frame >= 142 && frame < 170) {
    return {end: 164, from: [54, 50], start: 142, to: [78, 49]};
  }

  if (frame >= 178 && frame < 208) {
    return {end: 198, from: [78, 49], start: 178, to: [94, 14]};
  }

  if (frame >= 208 && frame < 236) {
    return {end: 228, from: [86, 14], start: 208, to: [59, 11]};
  }

  if (frame >= 236 && frame < 278) {
    return {end: 270, from: [28, 34], start: 236, to: [50, 38]};
  }

  return null;
}
