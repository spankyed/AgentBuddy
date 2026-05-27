import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {ThreadDashboardSurface} from '../../agentbuddy-ui/threads/ThreadDashboardSurface';
import {ThreadCreateForm} from '../../agentbuddy-ui/threads/ThreadCreateForm';
import {ThreadsBoardSurface} from '../../agentbuddy-ui/threads/ThreadsBoardSurface';
import {boardShotViewForFrame} from '../state/board';
import {useAppWindowLayout} from '../appWindowLayout';
import {ease, mix} from '../state/timeline';
import {useVideoConfig} from 'remotion';
import {makeStyles} from '../../agentbuddy-ui/primitives/makeStyles';
import './BoardShot.module.css';

const styles = makeStyles('BoardShot');

export function BoardShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const view = boardShotViewForFrame(frame);
  const layout = useAppWindowLayout({variant});
  const {height, width} = useVideoConfig();
  const appReveal = ease(frame, 24, 68);
  const dashboardDock = ease(frame, 18, 62);
  const dashboardExit = ease(frame, 84, 110);
  const appDashboardReveal = ease(frame, 58, 84);
  const createExit = 1 - ease(frame, 152, 166);
  const createBoardExit = 1 - ease(frame, 146, 158);
  const boardReveal = ease(frame, 150, 178);
  const createReveal = ease(frame, 92, 118);
  const dashboardCreateExit = view.createForm ? 1 - ease(frame, 88, 106) : 1;
  const dashboardRect = dashboardPlacement({dock: dashboardDock, height, layout, variant, width});

  return (
    <div className={styles.root}>
      <div
        className={styles.appReveal}
        style={{
          opacity: appReveal,
          transform: `translateY(${mix(22, 0, appReveal)}px) scale(${mix(0.988, 1, appReveal)})`,
        }}
      >
        <AppWindow activePlugin="threads" breadcrumbs={view.breadcrumbs} composer={false} layout={layout}>
          {view.dashboard ? (
            <div
              className={styles.surfaceReveal}
              style={{
                opacity: Math.min(appDashboardReveal, dashboardCreateExit),
                transform: `translateY(${mix(18, 0, appDashboardReveal)}px) scale(${mix(0.992, 1, appDashboardReveal)})`,
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
      {view.dashboard && frame < 112 ? (
        <div
          className={styles.dashboardMotion}
          style={{
            height: dashboardRect.height,
            left: dashboardRect.left,
            opacity: Math.min(ease(frame, 0, 18), 1 - dashboardExit, dashboardCreateExit),
            top: dashboardRect.top,
            transform: `translate(-50%, -50%) scale(${mix(1.02, 1, dashboardDock)})`,
            width: dashboardRect.width,
          }}
        >
          <ThreadDashboardSurface state={view.dashboard} />
        </div>
      ) : null}
    </div>
  );
}

function dashboardPlacement({
  dock,
  height,
  layout,
  variant,
  width,
}: {
  dock: number;
  height: number;
  layout: ReturnType<typeof useAppWindowLayout>;
  variant?: 'landscape' | 'square';
  width: number;
}) {
  const windowLeft = Number(layout.windowStyle.left ?? 0);
  const windowTop = Number(layout.windowStyle.top ?? 0);
  const windowWidth = Number(layout.windowStyle.width ?? width);
  const windowHeight = Number(layout.windowStyle.height ?? height);
  const mainLeft = windowLeft + 72;
  const mainWidth = windowWidth - 72;
  const startWidth = variant === 'square' ? Math.min(720, width - 112) : Math.min(880, width - 220);
  const startHeight = variant === 'square' ? 440 : 520;
  const finalWidth = mainWidth;
  const finalCenterX = mainLeft + mainWidth / 2;
  const finalHeight = windowHeight - 42;
  const finalCenterY = windowTop + 42 + finalHeight / 2;

  return {
    height: mix(startHeight, finalHeight, dock),
    left: mix(width / 2, finalCenterX, dock),
    top: mix(height / 2, finalCenterY, dock),
    width: mix(startWidth, finalWidth, dock),
  };
}
