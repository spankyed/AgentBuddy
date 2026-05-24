import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {FlowCanvas} from '../../agentbuddy-ui/flows/FlowCanvas';
import {releaseAutomationFlow} from '../../agentbuddy-ui/flows/flowFixtures';

export function WorkflowShot({variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  return (
    <AppWindow activePlugin="flows" variant={variant} breadcrumbs={releaseAutomationFlow.breadcrumbs}>
      <FlowCanvas state={releaseAutomationFlow} />
    </AppWindow>
  );
}

