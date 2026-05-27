import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {ThreadCreateForm} from '../../agentbuddy-ui/threads/ThreadCreateForm';
import {ThreadsHeader} from '../../agentbuddy-ui/threads/ThreadsHeader';
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
  const headerDock = ease(frame, 20, 62);
  const headerExit = ease(frame, 58, 82);
  const createExit = 1 - ease(frame, 120, 134);
  const boardReveal = ease(frame, 132, 156);
  const createReveal = ease(frame, 52, 78);
  const headerRect = headerPlacement({dock: headerDock, height, layout, variant, width});

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
          {view.createForm ? (
            <div
              className={styles.surfaceReveal}
              style={{
                opacity: Math.min(createReveal, createExit),
                transform: `translateY(${mix(20, -18, 1 - createExit)}px) scale(${mix(0.992, 1, createReveal)})`,
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
      {frame < 84 ? (
        <div
          className={styles.headerMotion}
          style={{
            left: headerRect.left,
            opacity: Math.min(ease(frame, 0, 18), 1 - headerExit),
            top: headerRect.top,
            transform: `translate(-50%, -50%) scale(${mix(1.01, 1, headerDock)})`,
            width: headerRect.width,
          }}
        >
          <div className={styles.headerCard}>
            <ThreadsHeader state={view.header} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function headerPlacement({
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
  const mainLeft = windowLeft + 72;
  const mainWidth = windowWidth - 72;
  const startWidth = variant === 'square' ? Math.min(760, width - 112) : Math.min(980, width - 180);
  const finalWidth = mainWidth;
  const finalCenterX = mainLeft + mainWidth / 2;
  const finalCenterY = windowTop + 42 + 28;

  return {
    left: mix(width / 2, finalCenterX, dock),
    top: mix(height / 2, finalCenterY, dock),
    width: mix(startWidth, finalWidth, dock),
  };
}
