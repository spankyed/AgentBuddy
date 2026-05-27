import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {ThreadDashboardSurface} from '../../agentbuddy-ui/threads/ThreadDashboardSurface';
import {ThreadCreateForm} from '../../agentbuddy-ui/threads/ThreadCreateForm';
import {ThreadsBoardSurface} from '../../agentbuddy-ui/threads/ThreadsBoardSurface';
import {boardShotViewForFrame} from '../state/board';
import {useAppWindowLayout} from '../appWindowLayout';
import {ease, mix} from '../state/timeline';
import {makeStyles} from '../../agentbuddy-ui/primitives/makeStyles';
import './BoardShot.module.css';

const styles = makeStyles('BoardShot');

export function BoardShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const view = boardShotViewForFrame(frame);
  const layout = useAppWindowLayout({variant});
  const createExit = 1 - ease(frame, 188, 202);
  const createBoardExit = 1 - ease(frame, 190, 204);
  const boardReveal = ease(frame, 196, 222);
  const createReveal = ease(frame, 92, 118);
  const dashboardCreateExit = view.createForm ? 1 - ease(frame, 88, 106) : 1;

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
    </div>
  );
}
