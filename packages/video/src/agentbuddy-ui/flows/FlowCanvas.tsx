import {Icons} from '../primitives/Icon';
import {FlowControls} from './FlowControls';
import {FlowEdge} from './FlowEdge';
import {FlowNode} from './FlowNode';
import {FlowPalette} from './FlowPalette';
import type {FlowCanvasState} from './flowTypes';
import './FlowCanvas.module.css';
import {makeStyles} from '../primitives/makeStyles';
const styles = makeStyles('FlowCanvas');

// Mirrors packages/renderer/src/plugins/flows/canvas/flow-canvas.vue and components/FlowEditor.vue.
export function FlowCanvas({state}: {state: FlowCanvasState}) {
  return (
    <div className={styles.root}>
      <FlowPalette items={state.paletteItems} />
      <section className={styles.editor}>
        <button className={styles.backButton} type="button"><Icons.ArrowLeft size={15} />Back</button>
        <svg className={styles.edges} viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <marker id="flow-arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className={styles.edgeMarker} />
            </marker>
          </defs>
          {state.edges.map((edge, index) => <FlowEdge key={`${edge.from}-${edge.to}-${index}`} edge={edge} nodes={state.nodes} />)}
        </svg>
        {state.nodes.map(node => <FlowNode key={node.id} node={node} selected={state.selectedNodeId === node.id} />)}
        <FlowControls />
      </section>
    </div>
  );
}
