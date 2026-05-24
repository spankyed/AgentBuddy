import type {FlowEdgeState, FlowNodeState} from './flowTypes';
import './FlowCanvas.module.css';
import {makeStyles} from '../primitives/makeStyles';
const styles = makeStyles('FlowCanvas');

const nodeWidth = 13;
const defaultHeight = 5.6;
const triggerHeader = 4.8;
const triggerSubtitle = 3.2;
const triggerRow = 2.5;
const triggerBottom = 1.1;

function isTriggerNode(node: FlowNodeState) {
  return node.kind === 'entry' || node.kind === 'listener' || node.kind === 'schedule' || Boolean(node.exits?.length);
}

function nodeHeight(node: FlowNodeState) {
  if (!isTriggerNode(node)) return defaultHeight;
  const exits = Math.max(1, node.exits?.length ?? 1);
  const subtitle = node.subtitle ? triggerSubtitle : 0;
  return Math.max(defaultHeight, triggerHeader + subtitle + exits * triggerRow + triggerBottom);
}

function nodePoint(node: FlowNodeState, side: 'left' | 'right', exit?: number) {
  const x = node.x + (side === 'right' ? nodeWidth / 2 : -nodeWidth / 2);
  if (side === 'right' && isTriggerNode(node) && typeof exit === 'number') {
    const top = node.y - nodeHeight(node) / 2;
    const subtitle = node.subtitle ? triggerSubtitle : 0;
    return {x, y: top + triggerHeader + subtitle + (exit + 0.5) * triggerRow};
  }
  return {x, y: node.y};
}

function elbowPath(a: {x: number; y: number}, b: {x: number; y: number}) {
  const hDist = Math.max(0, b.x - a.x);
  const vDist = Math.abs(b.y - a.y);
  if (vDist < 0.55) return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;

  const bendX = a.x + Math.min(7, Math.max(2.5, hDist / 2));
  const radius = Math.min(0.85, vDist / 2.5, Math.max(0.35, hDist / 4));
  const dir = b.y > a.y ? 1 : -1;

  return [
    `M ${a.x} ${a.y}`,
    `L ${bendX - radius} ${a.y}`,
    `Q ${bendX} ${a.y} ${bendX} ${a.y + dir * radius}`,
    `L ${bendX} ${b.y - dir * radius}`,
    `Q ${bendX} ${b.y} ${bendX + radius} ${b.y}`,
    `L ${b.x} ${b.y}`,
  ].join(' ');
}

export function FlowEdge({edge, nodes}: {edge: FlowEdgeState; nodes: FlowNodeState[]}) {
  const from = nodes.find(node => node.id === edge.from);
  const to = nodes.find(node => node.id === edge.to);
  if (!from || !to) return null;
  const a = nodePoint(from, 'right', edge.fromExit);
  const b = nodePoint(to, 'left');
  return (
    <path
      className={edge.dashed ? styles.edgeDashed : styles.edge}
      d={elbowPath(a, b)}
      vectorEffect="non-scaling-stroke"
    />
  );
}
