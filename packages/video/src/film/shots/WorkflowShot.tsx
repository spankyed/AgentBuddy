import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {FlowCanvas} from '../../agentbuddy-ui/flows/FlowCanvas';
import {workflowShotViewForFrame} from '../state/workflow';
import {useAppWindowLayout} from '../appWindowLayout';
import {ease} from '../state/timeline';
import './WorkflowShot.module.css';
import {makeStyles} from '../../agentbuddy-ui/primitives/makeStyles';

const styles = makeStyles('WorkflowShot');

const backdropRevealStartFrame = 156;
const backdropRevealEndFrame = 238;
const appRevealEndFrame = 276;
const chromeRevealStartFrame = 188;
const chromeRevealEndFrame = 276;

export function WorkflowShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const view = workflowShotViewForFrame(frame);
  const layout = useAppWindowLayout({variant});
  const backdropReveal = ease(frame, backdropRevealStartFrame, backdropRevealEndFrame);
  const frameReveal = ease(frame, backdropRevealStartFrame + 34, appRevealEndFrame);
  const chromeReveal = ease(frame, chromeRevealStartFrame, chromeRevealEndFrame);

  return (
    <div className={styles.root}>
      <div className={styles.appReveal}>
        <AppWindow
          activePlugin="flows"
          breadcrumbs={view.breadcrumbs}
          chromeOpacity={chromeReveal}
          composer={false}
          frameOpacity={frameReveal}
          headerOpacity={chromeReveal}
          layout={layout}
        >
          <div style={{height: '100%'}}>
            <FlowCanvas backgroundOpacity={backdropReveal} state={view.flow} />
          </div>
        </AppWindow>
      </div>
    </div>
  );
}
