import {Icons} from '../primitives/Icon';
import {FlowControls} from './FlowControls';
import {FlowEdge} from './FlowEdge';
import {FlowNode} from './FlowNode';
import {FlowPalette} from './FlowPalette';
import type {FlowCanvasState} from './flowTypes';
import styles from './FlowCanvas.module.css';

// Mirrors packages/renderer/src/plugins/flows/canvas/flow-canvas.vue and components/FlowEditor.vue.
export function FlowCanvas({state}: {state: FlowCanvasState}) {
  return (
    <div className={styles.root}>
      <FlowPalette items={state.paletteItems} />
      <section className={styles.editor}>
        <button className={styles.backButton} type="button"><Icons.ArrowLeft size={15} />Back</button>
        <svg className={styles.edges} viewBox="0 0 100 100" preserveAspectRatio="none">
          {state.edges.map((edge, index) => <FlowEdge key={`${edge.from}-${edge.to}-${index}`} edge={edge} nodes={state.nodes} />)}
        </svg>
        {state.nodes.map(node => <FlowNode key={node.id} node={node} selected={state.selectedNodeId === node.id} />)}
        <FlowControls />
      </section>
    </div>
  );
}

