import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {CodeFeaturePanel} from '../../agentbuddy-ui/code/CodeFeaturePanel';
import {CodeReview} from '../../agentbuddy-ui/code/CodeReview';
import {PullRequestPanel} from '../../agentbuddy-ui/code/PullRequestPanel';
import {ComponentStage} from '../ComponentStage';
import {codeShotViewForFrame} from '../state/code';
import {useAppWindowLayout} from '../appWindowLayout';
import {ease, mix} from '../state/timeline';
import './CodeShot.module.css';
import {makeStyles} from '../../agentbuddy-ui/primitives/makeStyles';

const styles = makeStyles('CodeShot');

export function CodeShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const view = codeShotViewForFrame(frame);
  const layout = useAppWindowLayout({variant});
  const appReveal = ease(frame, 48, 84);

  if (frame < 48) {
    return (
      <ComponentStage
        frame={frame}
        height={variant === 'square' ? 'min(700px, calc(100% - 112px))' : 'min(740px, calc(100% - 96px))'}
        variant={variant}
        width={variant === 'square' ? 'min(430px, calc(100% - 72px))' : '430px'}
      >
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
      </ComponentStage>
    );
  }

  return (
    <div
      className={styles.appReveal}
      style={{
        opacity: appReveal,
        transform: `translateY(${mix(-26, 0, appReveal)}px) scale(${mix(0.986, 1, appReveal)})`,
      }}
    >
      <AppWindow activePlugin="code" breadcrumbs={view.breadcrumbs} composer={view.composer} layout={layout}>
        <CodeReview state={view.review.state} variant={variant} view={view.review.view} />
      </AppWindow>
    </div>
  );
}
