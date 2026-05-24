import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {FlowCanvas} from '../../agentbuddy-ui/flows/FlowCanvas';
import {launchComposerState} from '../state/chat';
import {releaseAutomationWorkflow, workflowStateForFrame} from '../state/workflow';
import {useAppWindowLayout} from '../appWindowLayout';

export function WorkflowShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const layout = useAppWindowLayout({variant});
  return (
    <AppWindow activePlugin="flows" breadcrumbs={releaseAutomationWorkflow.breadcrumbs} composer={launchComposerState} layout={layout}>
      <FlowCanvas state={workflowStateForFrame(frame)} />
    </AppWindow>
  );
}
