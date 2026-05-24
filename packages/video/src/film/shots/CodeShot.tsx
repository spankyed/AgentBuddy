import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {CodeReview} from '../../agentbuddy-ui/code/CodeReview';
import {codeReviewState} from '../state/code';

export function CodeShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  return (
    <AppWindow activePlugin="code" variant={variant} breadcrumbs={codeReviewState.breadcrumbs}>
      <CodeReview frame={frame} state={codeReviewState} variant={variant} />
    </AppWindow>
  );
}
