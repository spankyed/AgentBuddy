import {Icons} from '../primitives/Icon';
import {cx} from '../primitives/classNames';
import {FlowAddHandle} from './FlowAddHandle';
import type {FlowNodeState} from './flowTypes';
import './FlowNode.module.css';
import {makeStyles} from '../primitives/makeStyles';
const styles = makeStyles('FlowNode');

const iconByKind = {
  action: Icons.Play,
  keep_alive: Icons.Activity,
  listener: Icons.Radio,
  schedule: Icons.Clock,
  llm: Icons.Sparkle,
  flow: Icons.Flows,
  switch: Icons.Split,
  fire: Icons.Zap,
  kill: Icons.Plug,
  entry: Icons.Radio,
};

// Mirrors packages/renderer/src/plugins/flows/canvas/nodes/BaseNode.vue.
export function FlowNode({editing, node, selected}: {editing?: boolean; node: FlowNodeState; selected?: boolean}) {
  const Icon = iconByKind[node.kind];
  const style = {left: `${node.x}%`, top: `${node.y}%`};
  const nodeClassName = cx(styles.node, editing && styles.editing, !editing && selected && styles.selected);
  if (node.kind === 'entry' || node.exits?.length) {
    return (
      <div className={cx(nodeClassName, styles.entry)} data-kind={node.kind} style={style}>
        <div className={styles.header}><Icon className={styles.nodeIcon} size={14} /><span>{node.label}</span></div>
        {node.subtitle ? <div className={styles.subtitle}>{node.subtitle}</div> : null}
        <div className={styles.exitList}>
          {node.exits?.map((exit, index) => (
            <div key={exit} className={styles.exitRow}>
              <span className={styles.exitIndex}>{index + 1}</span>
              <span>{exit}</span>
              <span className={styles.handle} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={nodeClassName} data-kind={node.kind} style={style}>
      <div className={styles.header}><Icon className={styles.nodeIcon} size={14} /><span>{node.label}</span></div>
      {node.subtitle ? <div className={styles.subtitle}>{node.subtitle}</div> : null}
      <FlowAddHandle selected={selected} />
    </div>
  );
}
