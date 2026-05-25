import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import './QueryEditorPanel.module.css';

const styles = makeStyles('QueryEditorPanel');

export function KeyboardHint() {
  return <div className={styles.keyboard}><Icons.Keyboard size={12} /> Cmd + Enter to run</div>;
}
