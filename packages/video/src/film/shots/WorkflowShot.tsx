import {AppWindow} from '../../agentbuddy-ui/chrome/AppWindow';
import {FlowCanvas} from '../../agentbuddy-ui/flows/FlowCanvas';
import {FlowNode} from '../../agentbuddy-ui/flows/FlowNode';
import {FlowNodeForm} from '../../agentbuddy-ui/flows/FlowNodeForm';
import {flowNodeHeight, flowNodeWidth} from '../../agentbuddy-ui/flows/flowGeometry';
import {replaceObsoleteAppsFormStateForFrame} from '../state/flowForms';
import {workflowShotViewForFrame} from '../state/workflow';
import {useAppWindowLayout} from '../appWindowLayout';
import {ease, mix} from '../state/timeline';
import {Cursor} from '../overlays/Cursor';
import {useVideoConfig} from 'remotion';
import './WorkflowShot.module.css';
import {makeStyles} from '../../agentbuddy-ui/primitives/makeStyles';

const styles = makeStyles('WorkflowShot');

export function WorkflowShot({frame, variant}: {frame: number; variant?: 'landscape' | 'square'}) {
  const view = workflowShotViewForFrame(frame);
  const layout = useAppWindowLayout({variant});
  const {height, width} = useVideoConfig();
  const appReveal = ease(frame, 36, 92);
  const nodeDock = ease(frame, 40, 104);
  const nodeExit = ease(frame, 92, 108);
  const formReveal = ease(frame, 236, 266);
  const listener = view.flow.nodes[0];
  const nodeRect = workflowNodePlacement({dock: nodeDock, height, layout, listener, width});
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
          <div style={{height: '100%', opacity: ease(frame, 48, 88)}}>
            <FlowCanvas hiddenNodeIds={frame < 106 ? new Set([listener.id]) : undefined} state={view.flow} />
          </div>
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
      {frame < 110 ? (
        <div
          className={styles.nodeMotion}
          style={{
            height: nodeRect.height,
            left: nodeRect.left,
            opacity: 1 - nodeExit,
            top: nodeRect.top,
            transform: `translate(-50%, -50%) scale(${mix(1.18, 1, nodeDock)})`,
            width: nodeRect.width,
          }}
        >
          <div className={styles.nodeSlot}>
            <FlowNode editable={false} node={{...listener, x: 0, y: 0}} selected />
          </div>
        </div>
      ) : null}
      {cursor ? <Cursor frame={frame} {...cursor} /> : null}
    </div>
  );
}

function workflowCursorForFrame(frame: number):
  | {end: number; from: [number, number]; start: number; to: [number, number]}
  | null {
  if (frame >= 46 && frame < 78) {
    return {end: 78, from: [50, 52], start: 46, to: [22, 40]};
  }

  if (frame >= 112 && frame < 146) {
    return {end: 146, from: [56, 39], start: 112, to: [78, 32]};
  }

  if (frame >= 172 && frame < 204) {
    return {end: 204, from: [78, 32], start: 172, to: [78, 43]};
  }

  if (frame >= 230 && frame < 266) {
    return {end: 266, from: [78, 43], start: 230, to: [78, 32]};
  }

  if (frame >= 272 && frame < 318) {
    return {end: 318, from: [78, 32], start: 272, to: [87, 62]};
  }

  return null;
}

function workflowNodePlacement({
  dock,
  height,
  layout,
  listener,
  width,
}: {
  dock: number;
  height: number;
  layout: ReturnType<typeof useAppWindowLayout>;
  listener: ReturnType<typeof workflowShotViewForFrame>['flow']['nodes'][number];
  width: number;
}) {
  const windowLeft = Number(layout.windowStyle.left ?? 0);
  const windowTop = Number(layout.windowStyle.top ?? 0);
  const windowWidth = Number(layout.windowStyle.width ?? width);
  const windowHeight = Number(layout.windowStyle.height ?? height);
  const mainLeft = windowLeft + 72;
  const surfaceTop = windowTop + 42;
  const editorLeft = mainLeft + 240;
  const nodeWidth = flowNodeWidth(listener);
  const nodeHeight = flowNodeHeight(listener);
  const finalCenterX = editorLeft + listener.x;
  const finalCenterY = surfaceTop + listener.y;

  return {
    height: mix(180, nodeHeight, dock),
    left: mix(width / 2, Math.min(finalCenterX, windowLeft + windowWidth - nodeWidth), dock),
    top: mix(height / 2, Math.min(finalCenterY, windowTop + windowHeight - nodeHeight), dock),
    width: mix(300, nodeWidth, dock),
  };
}
