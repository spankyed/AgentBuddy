import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {CodeReview} from '../../agentbuddy-ui/code/CodeReview';

export function CodeShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  return (
    <AppWindow activePlugin="code" variant={variant} breadcrumbs={['Code', 'Launch Film', 'Branch']}>
      <CodeReview frame={frame} />
    </AppWindow>
  );
}

