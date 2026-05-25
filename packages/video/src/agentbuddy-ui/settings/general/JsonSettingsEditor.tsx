import {Icons} from '../../primitives/Icon';
import './SettingsCommon.module.css';
import {makeStyles} from '../../primitives/makeStyles';
const styles = makeStyles('SettingsCommon');

export function JsonSettingsEditor({value}: {value: string}) {
  return (
    <div className={styles.panel}>
      <header className={styles.header} style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16}}>
        <div>
          <h2 className={styles.title}>Settings JSON</h2>
          <span style={{color: 'rgb(34 197 94)', fontSize: 12}}>Saved</span>
        </div>
        <div style={{display: 'flex', gap: 8}}>
          <button className={styles.input} style={{fontSize: 12, padding: '6px 12px', width: 'auto'}} type="button">Reset</button>
          <button className={styles.input} style={{background: 'rgb(38 38 38)', color: 'rgb(115 115 115)', fontSize: 12, padding: '6px 12px', width: 'auto'}} type="button">Save</button>
        </div>
      </header>
      <div style={{border: '1px solid rgb(64 64 64)', borderRadius: 8, overflow: 'hidden'}}>
        <textarea className={styles.textarea} readOnly value={value} style={{border: 0, minHeight: 520}} />
      </div>
    </div>
  );
}
