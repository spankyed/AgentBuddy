import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import './BrainSurface.module.css';

const styles = makeStyles('BrainSurface');

export function StoppedOverlay() {
  return <div className={styles.stopped}><div><div className={styles.stoppedIcon}><Icons.X size={28} /></div><p>Brain Stopped</p><span>This is the last known state</span><button>Start Brain</button></div></div>;
}
