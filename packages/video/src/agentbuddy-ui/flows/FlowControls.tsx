import {Icons} from '../primitives/Icon';
import styles from './FlowCanvas.module.css';

export function FlowControls() {
  return (
    <button className={styles.controls} type="button" title="Fit view">
      <Icons.Square size={18} />
    </button>
  );
}

