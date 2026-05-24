import {Icons} from '../primitives/Icon';
import styles from './ChatComposer.module.css';

export function SendButton({disabled}: {disabled?: boolean}) {
  return (
    <button className={styles.sendButton} disabled={disabled} type="button">
      <span>Send</span>
      <Icons.CornerDownLeft className={styles.sendIcon} size={16} />
    </button>
  );
}

