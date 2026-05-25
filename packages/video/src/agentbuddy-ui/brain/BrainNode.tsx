import {FlowNode} from '../flows/FlowNode';
import type {BrainNodeState} from './brainTypes';
import './BrainNode.module.css';
import {makeStyles} from '../primitives/makeStyles';
const styles = makeStyles('BrainNode');

export function BrainNode({connectedExits, node, selected}: {
  connectedExits?: Set<number>;
  node: BrainNodeState & {x: number; y: number};
  selected?: boolean;
}) {
  return (
    <>
      <FlowNode
        connectedExits={connectedExits}
        node={{
          exits: node.exits,
          id: node.id,
          kind: node.kind,
          label: node.label,
          subtitle: node.subtitle ?? node.eventType,
          x: node.x,
          y: node.y,
        }}
        selected={selected}
      />
      {node.status ? <span className={styles.status} data-status={node.status} style={{left: `${node.x + 91}px`, top: `${node.y - 49}px`}} /> : null}
    </>
  );
}
