import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {ThreadDashboardSurface} from '../../agentbuddy-ui/threads/ThreadDashboardSurface';
import {ThreadCreateForm} from '../../agentbuddy-ui/threads/ThreadCreateForm';
import {ThreadsBoardSurface} from '../../agentbuddy-ui/threads/ThreadsBoardSurface';
import {Cursor} from '../overlays/Cursor';
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

  return null;
}
