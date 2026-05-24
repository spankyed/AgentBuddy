import {Icons} from '../primitives/Icon';
import {cx} from '../primitives/classNames';
import type {FlowNodeState} from './flowTypes';
import styles from './FlowNode.module.css';

const iconByKind = {
  action: Icons.Play,
  keepAlive: Icons.Zap,
  listener: Icons.Radio,
  schedule: Icons.Clock,
  llm: Icons.Sparkle,
  flow: Icons.Flows,
  switch: Icons.GitBranch,
  fire: Icons.Zap,
  kill: Icons.Plus,
  entry: Icons.Radio,
};

// Mirrors packages/renderer/src/plugins/flows/canvas/nodes/BaseNode.vue.
export function FlowNode({node, selected}: {node: FlowNodeState; selected?: boolean}) {
  const Icon = iconByKind[node.kind];
  const style = {left: `${node.x}%`, top: `${node.y}%`};
  if (node.kind === 'entry' || node.exits?.length) {
    return (
      <div className={cx(styles.node, styles.entry, selected && styles.selected)} data-kind={node.kind} style={style}>
        <div className={styles.header}><Icon size={13} /><span>{node.label}</span></div>
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
    <div className={cx(styles.node, selected && styles.selected)} data-kind={node.kind} style={style}>
      <div className={styles.header}><Icon size={14} /><span>{node.label}</span><span className={styles.addHandle}>+</span></div>
      {node.subtitle ? <div className={styles.subtitle}>{node.subtitle}</div> : null}
    </div>
  );
}

