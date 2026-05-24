import {Icons} from '../primitives/Icon';
import './FlowCanvas.module.css';
import {makeStyles} from '../primitives/makeStyles';
const styles = makeStyles('FlowCanvas');

export function FlowControls() {
  return (
    <button className={styles.controls} type="button" title="Fit view">
      <Icons.Square size={18} />
    </button>
  );
}

