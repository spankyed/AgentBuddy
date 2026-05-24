import {ease} from '../../film/state/timeline';
import {makeStyles} from '../primitives/makeStyles';
import type {ToolActivityItemState} from './threadTypes';
import './ToolActivityBlock.module.css';

const styles = makeStyles('ToolActivityBlock');

// Mirrors packages/renderer/src/plugins/threads/chat/interactions/blocks/ToolActivityBlock.vue.
export function ToolActivityBlock({frame, items}: {frame: number; items: ToolActivityItemState[]}) {
  return (
    <div className={styles.root}>
      <div className={styles.label}>Agent is working</div>
      {items.map((item, index) => (
        <div key={item.title} className={styles.row} style={{opacity: ease(frame, 80 + index * 18, 98 + index * 18)}}>
          <span className={styles.dot} data-status={item.status} />
          <span>{item.title}</span>
          <small>{item.status}</small>
        </div>
      ))}
    </div>
  );
}

