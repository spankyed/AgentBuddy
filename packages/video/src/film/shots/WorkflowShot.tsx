import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {FlowCanvas} from '../../agentbuddy-ui/flows/FlowCanvas';
import {FlowNode} from '../../agentbuddy-ui/flows/FlowNode';
import {FlowNodeForm} from '../../agentbuddy-ui/flows/FlowNodeForm';
import {replaceObsoleteAppsFormStateForFrame} from '../state/flowForms';
import {workflowShotViewForFrame} from '../state/workflow';
import {useAppWindowLayout} from '../appWindowLayout';
import './WorkflowShot.module.css';
import {makeStyles} from '../../agentbuddy-ui/primitives/makeStyles';

const styles = makeStyles('WorkflowShot');

export function WorkflowShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const view = workflowShotViewForFrame(frame);
  const layout = useAppWindowLayout({variant});

  if (frame < 64) {
    const listener = view.flow.nodes[0];
    return (
      <div className={`${styles.isolatedFlow} ${variant === 'square' ? styles.square : ''}`}>
        <div className={styles.isolatedNode}>
          <FlowNode editable={false} node={{...listener, x: 0, y: 0}} selected />
        </div>
      </div>
    );
  }

  return (
    <AppWindow activePlugin="flows" breadcrumbs={view.breadcrumbs} composer={false} layout={layout}>
      <FlowCanvas state={view.flow} />
      {frame > 236 ? <FlowNodeForm state={replaceObsoleteAppsFormStateForFrame(frame)} /> : null}
    </AppWindow>
  );
}
