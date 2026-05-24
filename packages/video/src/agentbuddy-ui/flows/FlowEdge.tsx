import type {FlowEdgeState, FlowNodeState} from './flowTypes';
import styles from './FlowCanvas.module.css';

function nodePoint(node: FlowNodeState, side: 'left' | 'right', exit?: number) {
  const x = node.x + (side === 'right' ? 7 : -7);
  const y = typeof exit === 'number' && node.exits?.length ? node.y - 8 + exit * 3.6 : node.y;
  return {x, y};
}

export function FlowEdge({edge, nodes}: {edge: FlowEdgeState; nodes: FlowNodeState[]}) {
  const from = nodes.find(node => node.id === edge.from);
  const to = nodes.find(node => node.id === edge.to);
  if (!from || !to) return null;
  const a = nodePoint(from, 'right', edge.fromExit);
  const b = nodePoint(to, 'left');
  const mid = a.x + (b.x - a.x) * 0.45;
  return (
    <path
      className={edge.dashed ? styles.edgeDashed : styles.edge}
      d={`M ${a.x} ${a.y} C ${mid} ${a.y}, ${mid} ${b.y}, ${b.x} ${b.y}`}
      vectorEffect="non-scaling-stroke"
    />
  );
}

