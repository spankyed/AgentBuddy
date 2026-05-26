import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {FlowCanvas} from '../../agentbuddy-ui/flows/FlowCanvas';
import {FlowNode} from '../../agentbuddy-ui/flows/FlowNode';
import {FlowNodeForm} from '../../agentbuddy-ui/flows/FlowNodeForm';
import {replaceObsoleteAppsFormStateForFrame} from '../state/flowForms';
import {workflowShotViewForFrame} from '../state/workflow';
import {useAppWindowLayout} from '../appWindowLayout';
import {ease, mix} from '../state/timeline';
import './WorkflowShot.module.css';
import {makeStyles} from '../../agentbuddy-ui/primitives/makeStyles';

const styles = makeStyles('WorkflowShot');

export function WorkflowShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const view = workflowShotViewForFrame(frame);
  const layout = useAppWindowLayout({variant});
  const appReveal = ease(frame, 64, 100);
  const formReveal = ease(frame, 236, 266);

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
    <div
      className={styles.appReveal}
      style={{
        opacity: appReveal,
        transform: `translateY(${mix(-24, 0, appReveal)}px) scale(${mix(0.988, 1, appReveal)})`,
      }}
    >
      <AppWindow activePlugin="flows" breadcrumbs={view.breadcrumbs} composer={false} layout={layout}>
        <FlowCanvas state={view.flow} />
        {frame > 236 ? (
          <FlowNodeForm
            overlayStyle={{opacity: formReveal}}
            panelStyle={{
              opacity: formReveal,
              transform: `translateX(${mix(42, 0, formReveal)}px)`,
            }}
            state={replaceObsoleteAppsFormStateForFrame(frame)}
          />
        ) : null}
      </AppWindow>
    </div>
  );
}
