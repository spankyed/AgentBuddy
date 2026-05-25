import './SettingsCommon.module.css';
import {makeStyles} from '../../primitives/makeStyles';
const styles = makeStyles('SettingsCommon');

export function JsonSettingsEditor({value}: {value: string}) {
  return (
    <div className={styles.panel}>
      <header className={styles.header}>
        <h2 className={styles.title}>Settings JSON</h2>
        <p className={styles.description}>View and edit the raw settings document.</p>
      </header>
      <textarea className={styles.textarea} readOnly value={value} />
    </div>
  );
}
