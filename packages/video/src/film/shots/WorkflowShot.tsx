import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {FlowCanvas} from '../../agentbuddy-ui/flows/FlowCanvas';
import {FlowNode} from '../../agentbuddy-ui/flows/FlowNode';
import {FlowNodeForm} from '../../agentbuddy-ui/flows/FlowNodeForm';
import {replaceObsoleteAppsFormStateForFrame} from '../state/flowForms';
import {releaseAutomationWorkflow, workflowShotViewForFrame} from '../state/workflow';
import {useAppWindowLayout} from '../appWindowLayout';
import {ease, mix} from '../state/timeline';
import './WorkflowShot.module.css';
import {makeStyles} from '../../agentbuddy-ui/primitives/makeStyles';

const styles = makeStyles('WorkflowShot');

const switchStartFrame = 102;
const edgeStartFrame = 124;
const appStartFrame = 164;
const backdropRevealStartFrame = 156;
const backdropRevealEndFrame = 238;
const appRevealEndFrame = 276;
const chromeRevealStartFrame = 188;
const chromeRevealEndFrame = 276;
const appNodeHandoffFrame = 250;
const appNodeHandoffStartFrame = 226;

export function WorkflowShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const view = workflowShotViewForFrame(frame);
  const layout = useAppWindowLayout({variant});
  const appReveal = ease(frame, appStartFrame, appRevealEndFrame);
  const backdropReveal = ease(frame, backdropRevealStartFrame, backdropRevealEndFrame);
  const isolatedPosition = ease(frame, appStartFrame, appNodeHandoffFrame);
  const isolatedStageOpacity = 1 - ease(frame, appNodeHandoffStartFrame, appNodeHandoffFrame);
  const frameReveal = ease(frame, appStartFrame + 34, appRevealEndFrame);
  const chromeReveal = ease(frame, chromeRevealStartFrame, chromeRevealEndFrame);
  const appClip = appRevealClip(backdropReveal);
  const formStartFrame = 330;
  const formReveal = ease(frame, formStartFrame, formStartFrame + 32);
  const isolatedNode = {
    ...releaseAutomationWorkflow.flow.nodes[0],
    x: mix(720, 535, isolatedPosition),
    y: mix(410, 390, isolatedPosition),
    style: {
      transform: `translate(-50%, -50%) scale(${mix(1.12, 1, isolatedPosition)})`,
    },
  };
  const switchReveal = ease(frame, switchStartFrame, switchStartFrame + 46);
  const isolatedSwitchNode = {
    ...releaseAutomationWorkflow.flow.nodes[1],
    x: mix(1030, 785, isolatedPosition),
    y: mix(410, 390, isolatedPosition),
    style: {
      opacity: switchReveal,
      transform: `translate(-50%, -50%) translateX(${mix(58, 0, switchReveal)}px) scale(${mix(0.96, 1, switchReveal)})`,
    },
  };
  const edgeReveal = ease(frame, edgeStartFrame, edgeStartFrame + 40);
  const shouldRenderApp = frame >= appStartFrame;
  const hiddenAppNodeIds = frame < appNodeHandoffStartFrame ? new Set(['listener', 'switch']) : undefined;

  return (
    <div className={styles.root}>
      <div className={styles.isolatedBackdrop} style={{opacity: 1 - backdropReveal}} />
      {frame < appNodeHandoffFrame ? (
        <div className={styles.isolatedStage} style={{opacity: isolatedStageOpacity}}>
          <svg className={styles.isolatedEdge} viewBox="0 0 1440 900" preserveAspectRatio="none">
            {frame >= edgeStartFrame ? (
              <path
                d={`M ${isolatedNode.x + 95} ${isolatedNode.y} L ${mix(isolatedNode.x + 95, isolatedSwitchNode.x - 95, edgeReveal)} ${isolatedSwitchNode.y}`}
                style={{opacity: edgeReveal}}
              />
            ) : null}
          </svg>
          <FlowNode node={isolatedNode} selected />
          {frame >= switchStartFrame ? <FlowNode node={isolatedSwitchNode} selected={frame >= switchStartFrame + 46} /> : null}
        </div>
      ) : null}
      {shouldRenderApp ? (
        <div
          className={styles.appReveal}
          style={{
            clipPath: appClip,
            opacity: appReveal,
            transform: `translateY(${mix(18, 0, appReveal)}px) scale(${mix(0.992, 1, appReveal)})`,
          }}
        >
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
              <FlowCanvas hiddenNodeIds={hiddenAppNodeIds} state={view.flow} />
            </div>
            {frame > formStartFrame ? (
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
      ) : null}
    </div>
  );
}

function appRevealClip(progress: number) {
  const top = mix(43, 0, progress);
  const right = mix(34, 0, progress);
  const bottom = mix(34, 0, progress);
  const left = mix(24, 0, progress);
  return `inset(${top}% ${right}% ${bottom}% ${left}% round ${mix(18, 0, progress)}px)`;
}
