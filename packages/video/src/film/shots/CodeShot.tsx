import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {CodeReview} from '../../agentbuddy-ui/code/CodeReview';
import {launchComposerState} from '../state/chat';
import {codeShotState, codeReviewViewForFrame} from '../state/code';
import {useAppWindowLayout} from '../appWindowLayout';

export function CodeShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const layout = useAppWindowLayout({variant});
  return (
    <AppWindow activePlugin="code" breadcrumbs={codeShotState.breadcrumbs} composer={launchComposerState} layout={layout}>
      <CodeReview state={codeShotState.review} variant={variant} view={codeReviewViewForFrame(frame)} />
    </AppWindow>
  );
}
