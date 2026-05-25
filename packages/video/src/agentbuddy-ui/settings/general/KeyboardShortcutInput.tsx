import {Icons} from '../../primitives/Icon';
import './KeyboardShortcutInput.module.css';
import {makeStyles} from '../../primitives/makeStyles';
const styles = makeStyles('KeyboardShortcutInput');

export function KeyboardShortcutInput({label, value, placeholder = 'Click to set shortcut', showResetButton = true}: {
  label?: string;
  placeholder?: string;
  showResetButton?: boolean;
  value?: string;
}) {
  return (
    <div className={styles.root}>
      <span className={styles.box} title={value ?? ''}>
        {label ? <span className={styles.label}>{label}</span> : null}
        {value ? <span className={styles.key}>{value}</span> : <span className={styles.empty}>{placeholder}</span>}
        {!value ? <Icons.Keyboard className={styles.keyboardIcon} size={16} /> : null}
      </span>
      {value && showResetButton ? (
        <button className={styles.resetButton} title="Clear shortcut" type="button">
          <Icons.Eraser size={16} />
        </button>
      ) : null}
    </div>
  );
}
