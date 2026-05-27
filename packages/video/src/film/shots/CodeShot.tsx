import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {CodeFeaturePanel} from '../../agentbuddy-ui/code/CodeFeaturePanel';
import {CodeReview} from '../../agentbuddy-ui/code/CodeReview';
import {PullRequestPanel} from '../../agentbuddy-ui/code/PullRequestPanel';
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
  const appReveal = ease(frame, 34, 86);
  const panelDock = ease(frame, 36, 92);
  const panelExit = ease(frame, 88, 108);
  const panelRect = codePanelPlacement({dock: panelDock, height, layout, variant, width});

  return (
    <div className={styles.root}>
      <div
        className={styles.appReveal}
        style={{
          opacity: appReveal,
          transform: `translateY(${mix(24, 0, appReveal)}px) scale(${mix(0.988, 1, appReveal)})`,
        }}
      >
        <AppWindow activePlugin="code" breadcrumbs={view.breadcrumbs} composer={frame > 112 ? view.composer : false} layout={layout}>
          <div style={{height: '100%', opacity: ease(frame, 96, 124)}}>
            <CodeReview state={view.review.state} variant={variant} view={view.review.view} />
          </div>
        </AppWindow>
      </div>
      {frame < 110 ? (
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
    </div>
  );
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
