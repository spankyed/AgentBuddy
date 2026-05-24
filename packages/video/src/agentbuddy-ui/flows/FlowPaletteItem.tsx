import {Icons} from '../primitives/Icon';
import type {FlowPaletteItemState} from './flowTypes';
import styles from './FlowPalette.module.css';

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

// Mirrors packages/renderer/src/plugins/flows/canvas/components/NodePalette.vue.
export function FlowPaletteItem({item}: {item: FlowPaletteItemState}) {
  const Icon = iconByKind[item.kind];
  return (
    <button className={styles.item} data-kind={item.kind} type="button">
      <span className={styles.dot} />
      <span className={styles.label}>{item.label}</span>
      <Icon className={styles.icon} size={14} />
    </button>
  );
}

