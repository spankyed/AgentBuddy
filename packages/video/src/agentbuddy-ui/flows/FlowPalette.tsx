import {FlowPaletteItem} from './FlowPaletteItem';
import type {FlowPaletteItemState} from './flowTypes';
import styles from './FlowPalette.module.css';

// Mirrors packages/renderer/src/plugins/flows/canvas/components/NodePalette.vue.
export function FlowPalette({items}: {items: FlowPaletteItemState[]}) {
  return (
    <aside className={styles.root}>
      <div className={styles.inner}>
        <div className={styles.stack}>
          {items.map(item => <FlowPaletteItem key={item.kind} item={item} />)}
        </div>
      </div>
    </aside>
  );
}

