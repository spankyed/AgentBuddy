import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {CodeFeaturePanel} from '../../agentbuddy-ui/code/CodeFeaturePanel';
import {CodeReview} from '../../agentbuddy-ui/code/CodeReview';
import {PullRequestPanel} from '../../agentbuddy-ui/code/PullRequestPanel';
import {codeShotViewForFrame} from '../state/code';
import {useAppWindowLayout} from '../appWindowLayout';
import './CodeShot.module.css';
import {makeStyles} from '../../agentbuddy-ui/primitives/makeStyles';

const styles = makeStyles('CodeShot');

export function CodeShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const view = codeShotViewForFrame(frame);
  const layout = useAppWindowLayout({variant});

  if (frame < 48) {
    return (
      <div className={`${styles.isolatedPanel} ${variant === 'square' ? styles.square : ''}`}>
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
    );
  }

  return (
    <AppWindow activePlugin="code" breadcrumbs={view.breadcrumbs} composer={view.composer} layout={layout}>
      <CodeReview state={view.review.state} variant={variant} view={view.review.view} />
    </AppWindow>
  );
}
