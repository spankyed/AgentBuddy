import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {FlowCanvas} from '../../agentbuddy-ui/flows/FlowCanvas';
import {FlowNode} from '../../agentbuddy-ui/flows/FlowNode';
import {FlowNodeForm} from '../../agentbuddy-ui/flows/FlowNodeForm';
import {replaceObsoleteAppsFormStateForFrame} from '../state/flowForms';
import {releaseAutomationWorkflow, workflowShotViewForFrame} from '../state/workflow';
import {useAppWindowLayout} from '../appWindowLayout';
import {ease, mix} from '../state/timeline';
import {Cursor} from '../overlays/Cursor';
import './WorkflowShot.module.css';
import {makeStyles} from '../../agentbuddy-ui/primitives/makeStyles';

const styles = makeStyles('WorkflowShot');

const switchStartFrame = 102;
const edgeStartFrame = 124;
const appStartFrame = 164;
const backdropRevealStartFrame = 156;
const backdropRevealEndFrame = 238;
const isolatedExitStartFrame = 156;
const isolatedExitEndFrame = 252;
const appRevealEndFrame = 276;
const chromeRevealStartFrame = 188;
const chromeRevealEndFrame = 276;
const appNodeHandoffFrame = 250;

export function WorkflowShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const view = workflowShotViewForFrame(frame);
  const layout = useAppWindowLayout({variant});
  const appReveal = ease(frame, appStartFrame, appRevealEndFrame);
  const backdropReveal = ease(frame, backdropRevealStartFrame, backdropRevealEndFrame);
  const isolatedRevealOut = ease(frame, isolatedExitStartFrame, isolatedExitEndFrame);
  const frameReveal = ease(frame, appStartFrame + 34, appRevealEndFrame);
  const chromeReveal = ease(frame, chromeRevealStartFrame, chromeRevealEndFrame);
  const appClip = appRevealClip(backdropReveal);
  const formStartFrame = 330;
  const formReveal = ease(frame, formStartFrame, formStartFrame + 32);
  const cursor = workflowCursorForFrame(frame);
  const isolatedNode = {
    ...releaseAutomationWorkflow.flow.nodes[0],
    x: mix(720, 410, isolatedRevealOut),
    y: mix(410, 318, isolatedRevealOut),
    style: {
      transform: `translate(-50%, -50%) scale(${mix(1.12, 1, isolatedRevealOut)})`,
    },
  };
  const switchReveal = ease(frame, switchStartFrame, switchStartFrame + 46);
  const isolatedSwitchNode = {
    ...releaseAutomationWorkflow.flow.nodes[1],
    x: mix(1030, 660, isolatedRevealOut),
    y: mix(410, 318, isolatedRevealOut),
    style: {
      opacity: switchReveal * (1 - isolatedRevealOut * 0.2),
      transform: `translate(-50%, -50%) translateX(${mix(58, 0, switchReveal)}px) scale(${mix(0.96, 1, switchReveal)})`,
    },
  };
  const edgeReveal = ease(frame, edgeStartFrame, edgeStartFrame + 40);
  const shouldRenderApp = frame >= appStartFrame;
  const hiddenAppNodeIds = frame < appNodeHandoffFrame ? new Set(['listener', 'switch']) : undefined;

  return (
    <div className={styles.root}>
      <div className={styles.isolatedBackdrop} style={{opacity: 1 - backdropReveal}} />
      <div className={styles.isolatedStage} style={{opacity: 1 - isolatedRevealOut}}>
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
      {cursor ? <Cursor frame={frame} {...cursor} /> : null}
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

function workflowCursorForFrame(frame: number):
  | {end: number; from: [number, number]; start: number; to: [number, number]}
  | null {
  if (frame >= 92 && frame < 132) {
    return {end: 132, from: [50, 52], start: 92, to: [45, 46]};
  }

  if (frame >= 164 && frame < 206) {
    return {end: 206, from: [45, 46], start: 164, to: [77, 33]};
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
