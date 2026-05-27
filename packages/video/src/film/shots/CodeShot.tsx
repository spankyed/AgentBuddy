import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {CodeFeaturePanel} from '../../agentbuddy-ui/code/CodeFeaturePanel';
import {CodeReview} from '../../agentbuddy-ui/code/CodeReview';
import {PullRequestPanel} from '../../agentbuddy-ui/code/PullRequestPanel';
import {ExternalBrowserWindow} from '../props/ExternalBrowserWindow';
import {Cursor} from '../overlays/Cursor';
import {codeShotViewForFrame} from '../state/code';
import {useAppWindowLayout} from '../appWindowLayout';
import {ease, mix} from '../state/timeline';
import {useVideoConfig} from 'remotion';
import './CodeShot.module.css';
import {makeStyles} from '../../agentbuddy-ui/primitives/makeStyles';

const styles = makeStyles('CodeShot');

export function CodeShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const view = codeShotViewForFrame(frame);
  const layout = useAppWindowLayout({variant});
  const {height, width} = useVideoConfig();
  const appReveal = ease(frame, 38, 92);
  const panelDock = ease(frame, 42, 112);
  const panelExit = ease(frame, 126, 154);
  const leftSurfaceReveal = ease(frame, 88, 132);
  const fullPanelReveal = ease(frame, 100, 132);
  const panelRect = codePanelPlacement({dock: panelDock, height, layout, variant, width});
  const browserRect = browserWindowPlacement({height, layout, variant, width});
  const browserEnter = ease(frame, 258, 284);
  const browserExit = ease(frame, 300, 316);
  const cursor = codeCursorForFrame(frame);

  return (
    <div className={styles.root}>
      <div
        className={styles.appReveal}
        style={{
          opacity: appReveal,
          transform: `translateY(${mix(24, 0, appReveal)}px) scale(${mix(0.988, 1, appReveal)})`,
        }}
      >
        <AppWindow activePlugin="code" breadcrumbs={view.breadcrumbs} composer={false} layout={layout}>
          <div style={{height: '100%', opacity: appReveal}}>
            <CodeReview
              leftSurfaceStyle={{
                opacity: leftSurfaceReveal,
                transform: `translateX(${mix(-28, 0, leftSurfaceReveal)}px)`,
              }}
              panelStyle={{
                opacity: fullPanelReveal,
              }}
              state={view.review.state}
              variant={variant}
              view={view.review.view}
            />
          </div>
        </AppWindow>
      </div>
      {frame < 154 ? (
        <div
          className={styles.panelMotion}
          style={{
            height: panelRect.height,
            left: panelRect.left,
            opacity: 1 - panelExit,
            top: panelRect.top,
            transform: `translate(-50%, -50%) scale(${mix(1.018, 1, panelDock)})`,
            width: panelRect.width,
          }}
        >
          <div className={styles.panelContent}>
            <CodeFeaturePanel terminal={view.review.state.terminal}>
              <PullRequestPanel
                baseDirectory={view.review.state.baseDirectory}
                changeCount={view.review.state.staged.length + view.review.state.changes.length}
                createPressed={view.review.view.prCreatePressed}
                mergePressed={view.review.view.prMergePressed}
                mode={view.review.view.prMode}
                publishPressed={view.review.view.prPublishPressed}
                publishProgress={view.review.view.prPublishProgress}
                state={view.review.view.pullRequest}
              />
            </CodeFeaturePanel>
          </div>
        </div>
      ) : null}
      {frame >= 258 && frame < 316 ? (
        <div
          className={styles.browserMotion}
          style={{
            height: browserRect.height,
            left: browserRect.left,
            opacity: browserEnter * (1 - browserExit),
            top: browserRect.top,
            transform: `translate(-50%, -50%) translateY(${mix(20, 0, browserEnter) - browserExit * 18}px) scale(${mix(0.965, 1, browserEnter)})`,
            width: browserRect.width,
          }}
        >
          <ExternalBrowserWindow />
        </div>
      ) : null}
      {cursor ? <Cursor frame={frame} {...cursor} /> : null}
    </div>
  );
}

function codeCursorForFrame(frame: number) {
  if (frame >= 18 && frame < 46) {
    return {
      from: [48, 68] as [number, number],
      to: [61, 20] as [number, number],
      start: 18,
      end: 38,
    };
  }

  if (frame >= 92 && frame < 122) {
    return {
      from: [66, 36] as [number, number],
      to: [96, 16] as [number, number],
      start: 92,
      end: 112,
    };
  }

  if (frame >= 142 && frame < 166) {
    return {
      from: [92, 88] as [number, number],
      to: [93, 21] as [number, number],
      start: 142,
      end: 156,
    };
  }

  if (frame >= 166 && frame < 190) {
    return {
      from: [93, 21] as [number, number],
      to: [96, 27] as [number, number],
      start: 166,
      end: 180,
    };
  }

  if (frame >= 198 && frame < 222) {
    return {
      from: [88, 30] as [number, number],
      to: [83, 42] as [number, number],
      start: 198,
      end: 214,
    };
  }

  if (frame >= 226 && frame < 252) {
    return {
      from: [83, 88] as [number, number],
      to: [90, 90] as [number, number],
      start: 226,
      end: 244,
    };
  }

  if (frame >= 316 && frame < 344) {
    return {
      from: [88, 42] as [number, number],
      to: [92, 20] as [number, number],
      start: 316,
      end: 332,
    };
  }

  if (frame >= 360 && frame < 386) {
    return {
      from: [88, 52] as [number, number],
      to: [84, 53] as [number, number],
      start: 360,
      end: 376,
    };
  }

  if (frame >= 392 && frame < 412) {
    return {
      from: [84, 53] as [number, number],
      to: [73, 87] as [number, number],
      start: 392,
      end: 404,
    };
  }

  return null;
}

function codePanelPlacement({
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
  const panelWidth = variant === 'square' ? 360 : 430;
  const finalHeight = windowHeight - 42;
  const startHeight = variant === 'square' ? Math.min(700, height - 112) : Math.min(740, height - 96);
  const startWidth = variant === 'square' ? Math.min(430, width - 72) : 430;

  return {
    height: mix(startHeight, finalHeight, dock),
    left: mix(width / 2, windowLeft + windowWidth - panelWidth / 2, dock),
    top: mix(height / 2, windowTop + 42 + finalHeight / 2, dock),
    width: mix(startWidth, panelWidth, dock),
  };
}

function browserWindowPlacement({
  height,
  layout,
  variant,
  width,
}: {
  height: number;
  layout: ReturnType<typeof useAppWindowLayout>;
  variant?: 'landscape' | 'square';
  width: number;
}) {
  const windowLeft = Number(layout.windowStyle.left ?? 0);
  const windowTop = Number(layout.windowStyle.top ?? 0);
  const windowWidth = Number(layout.windowStyle.width ?? width);
  const windowHeight = Number(layout.windowStyle.height ?? height);
  const sidePanelWidth = variant === 'square' ? 360 : 430;
  const browserWidth = variant === 'square' ? Math.min(760, width - 92) : Math.min(900, windowWidth - sidePanelWidth - 150);
  const browserHeight = variant === 'square' ? 480 : Math.min(560, windowHeight - 176);

  return {
    height: browserHeight,
    left: windowLeft + 72 + (windowWidth - 72 - sidePanelWidth) / 2,
    top: windowTop + 42 + (windowHeight - 42) / 2,
    width: browserWidth,
  };
}
