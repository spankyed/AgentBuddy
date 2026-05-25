import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import {iconForBrainNode} from './brainIcons';
import type {BrainGraphEdge, BrainGraphNode} from './brainTypes';
import './BrainSurface.module.css';

const styles = makeStyles('BrainSurface');

export function BrainGraph({nodes, edges, flowTNodeId, canGoBack}: {nodes: BrainGraphNode[]; edges: BrainGraphEdge[]; flowTNodeId?: string; canGoBack?: boolean}) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  return (
    <div className={styles.graph} data-onboarding-id="brain-flow-graph">
      <svg className={styles.edges}>
        <defs><marker id="brain-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 z" fill="rgb(115 115 115)" /></marker></defs>
        {edges.map(edge => {
          const source = byId.get(edge.source);
          const target = byId.get(edge.target);
          if (!source || !target) return null;
          const start = {x: source.x + 80, y: source.y};
          const end = {x: target.x - 80, y: target.y};
          const midX = start.x + (end.x - start.x) * 0.55;
          const d = `M ${start.x} ${start.y} C ${midX} ${start.y}, ${midX} ${end.y}, ${end.x} ${end.y}`;
          return <path key={edge.id} className={`${styles.edge} ${edge.animated ? styles.edgeActive : ''}`} d={d} markerEnd="url(#brain-arrow)" />;
        })}
      </svg>
      {canGoBack ? <button className={styles.back}><Icons.ArrowLeft size={14} /> Back</button> : null}
      {flowTNodeId ? <div className={styles.currentLabel}>{flowTNodeId}</div> : null}
      <button className={styles.fit}><Icons.Maximize size={16} /></button>
      {nodes.map(node => <BrainGraphNodeView key={node.id} node={node} />)}
    </div>
  );
}

function BrainGraphNodeView({node}: {node: BrainGraphNode}) {
  const Icon = iconForBrainNode(node);
  const type = node.stepNodeType || node.tNodeType;
  return (
    <div className={`${styles.graphNode} ${styles[`node_${type}`]}`} style={{left: node.x, top: node.y}}>
      <div className={styles.nodeHeader}>
        <Icon size={14} />
        <span>{node.label}</span>
      </div>
      {node.eventType ? <div className={styles.nodeSubtitle}>{node.eventType}</div> : null}
      {node.status && node.tNodeType !== 'event' ? <span className={`${styles.statusDot} ${styles[`status_${node.status}`]}`} /> : null}
      <span className={styles.sourceHandle} />
      <span className={styles.targetHandle} />
    </div>
  );
}
