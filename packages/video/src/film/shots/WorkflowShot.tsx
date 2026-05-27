import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {FlowCanvas} from '../../agentbuddy-ui/flows/FlowCanvas';
import {FlowNodeForm} from '../../agentbuddy-ui/flows/FlowNodeForm';
import {replaceObsoleteAppsFormStateForFrame} from '../state/flowForms';
import {workflowShotViewForFrame} from '../state/workflow';
import {useAppWindowLayout} from '../appWindowLayout';
import {ease, mix} from '../state/timeline';
import {Cursor} from '../overlays/Cursor';
import './WorkflowShot.module.css';
import {makeStyles} from '../../agentbuddy-ui/primitives/makeStyles';

const styles = makeStyles('WorkflowShot');

export function WorkflowShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const view = workflowShotViewForFrame(frame);
  const layout = useAppWindowLayout({variant});
  const appReveal = ease(frame, 0, 26);
  const formReveal = ease(frame, 252, 282);
  const cursor = workflowCursorForFrame(frame);

  return (
    <div className={styles.root}>
      <div
        className={styles.appReveal}
        style={{
          opacity: appReveal,
          transform: `translateY(${mix(24, 0, appReveal)}px) scale(${mix(0.988, 1, appReveal)})`,
        }}
      >
        <AppWindow activePlugin="flows" breadcrumbs={view.breadcrumbs} composer={false} layout={layout}>
          <div style={{height: '100%'}}>
            <FlowCanvas state={view.flow} />
          </div>
          {frame > 252 ? (
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
      {cursor ? <Cursor frame={frame} {...cursor} /> : null}
    </div>
  );
}

function workflowCursorForFrame(frame: number):
  | {end: number; from: [number, number]; start: number; to: [number, number]}
  | null {
  if (frame >= 92 && frame < 124) {
    return {end: 124, from: [50, 52], start: 92, to: [22, 40]};
  }

  if (frame >= 144 && frame < 178) {
    return {end: 178, from: [56, 39], start: 144, to: [78, 32]};
  }

  if (frame >= 200 && frame < 232) {
    return {end: 232, from: [78, 32], start: 200, to: [78, 43]};
  }

  if (frame >= 246 && frame < 282) {
    return {end: 282, from: [78, 43], start: 246, to: [78, 32]};
  }

  if (frame >= 288 && frame < 334) {
    return {end: 334, from: [78, 32], start: 288, to: [87, 62]};
  }

  return null;
}
