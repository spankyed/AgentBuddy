import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {ThreadCreateForm} from '../../agentbuddy-ui/threads/ThreadCreateForm';
import {ThreadsHeader} from '../../agentbuddy-ui/threads/ThreadsHeader';
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
  const appReveal = ease(frame, 36, 68);
  const createExit = 1 - ease(frame, 120, 134);
  const boardReveal = ease(frame, 132, 156);

  if (frame < 36) {
    const enter = ease(frame, 0, 18);
    return (
      <div className={`${styles.isolatedHeader} ${variant === 'square' ? styles.square : ''}`}>
        <div
          className={styles.headerCard}
          style={{
            opacity: enter,
            transform: `translateY(${mix(16, 0, enter)}px) scale(${mix(0.99, 1, enter)})`,
          }}
        >
          <ThreadsHeader state={view.header} />
        </div>
      </div>
    );
  }

  return (
    <div
      className={styles.appReveal}
      style={{
        opacity: appReveal,
        transform: `translateY(${mix(-22, 0, appReveal)}px) scale(${mix(0.988, 1, appReveal)})`,
      }}
    >
      <AppWindow activePlugin="threads" breadcrumbs={view.breadcrumbs} composer={false} layout={layout}>
        {view.createForm ? (
          <div
            className={styles.surfaceReveal}
            style={{
              opacity: createExit,
              transform: `translateY(${mix(0, -18, 1 - createExit)}px) scale(${mix(1, 0.992, 1 - createExit)})`,
            }}
          >
            <ThreadCreateForm state={view.createForm} />
          </div>
        ) : (
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
        )}
      </AppWindow>
    </div>
  );
}
