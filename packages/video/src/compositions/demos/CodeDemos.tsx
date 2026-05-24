import {useCurrentFrame} from 'remotion';
import {CodeReview} from '../../agentbuddy-ui/code/CodeReview';
import {PullRequestPanel} from '../../agentbuddy-ui/code/PullRequestPanel';
import {SurfaceFrame} from '../../film/SurfaceFrame';
import {CodeShot} from '../../film/shots/CodeShot';
import {codeReviewViewForFrame, codeShotState} from '../../film/state/code';
import {DemoFramedArea} from '../DemoLayout';

export const CodeReviewDemo = () => {
  const frame = useCurrentFrame();
  return (
    <SurfaceFrame>
      <DemoFramedArea>
        <CodeReview state={codeShotState.review} view={codeReviewViewForFrame(frame)} />
      </DemoFramedArea>
    </SurfaceFrame>
  );
};

export const PullRequestPanelDemo = () => {
  const frame = useCurrentFrame();
  const view = codeReviewViewForFrame(frame + 170);
  const pullRequestState = {
    ...codeShotState.review.pullRequest,
    branchPublished: view.prPublishProgress >= 1,
    createdPr: view.prCreated ? codeShotState.review.pullRequest.createdPr : undefined,
  };
  return (
    <SurfaceFrame>
      <DemoFramedArea>
        <div style={{height: '100%', marginLeft: 'auto', width: 340}}>
          <PullRequestPanel
            baseDirectory={codeShotState.review.baseDirectory}
            changeCount={codeShotState.review.staged.length + codeShotState.review.changes.length}
            mode={view.prMode}
            publishProgress={view.prPublishProgress}
            state={pullRequestState}
          />
        </div>
      </DemoFramedArea>
    </SurfaceFrame>
  );
};

export const CodeSurfaceDemo = () => {
  const frame = useCurrentFrame();
  return (
    <SurfaceFrame>
      <CodeShot frame={frame} />
    </SurfaceFrame>
  );
};
