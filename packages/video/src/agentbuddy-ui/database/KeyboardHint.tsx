import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import './KeyboardHint.module.css';

const styles = makeStyles('DatabaseKeyboardHint');

export function KeyboardHint() {
  return (
    <div className={styles.root}>
      <Icons.Keyboard size={12} />
      <span>Cmd + Enter to run</span>
    </div>
  );
}
