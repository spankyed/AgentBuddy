import {Icons} from '../../primitives/Icon';
import './SettingsCommon.module.css';
import {makeStyles} from '../../primitives/makeStyles';
const styles = makeStyles('SettingsCommon');

export function ApplicationSettings() {
  return (
    <div className={styles.panelNarrow}>
      <header className={styles.header}>
        <h2 className={styles.title}>Application</h2>
        <p className={styles.description}>Import setup packs, configure hotkeys, and manage app data.</p>
      </header>
      <section className={styles.card}>
        <div className={styles.sectionHeader}><Icons.Keyboard size={16} />Hotkeys</div>
        <div className={styles.grid2}>
          <Hotkey label="Switch Plugin Up" value="⌘ ↑" />
          <Hotkey label="Switch Plugin Down" value="⌘ ↓" />
          <Hotkey label="Toggle Inspection Panel" value="⌘ I" />
        </div>
      </section>
      <section className={styles.card}>
        <div className={styles.sectionHeader}><Icons.PackageOpen size={16} />Import Setup Pack</div>
        <p className={styles.description}>Import compiled actions, prompts, flows, library docs, and notes from a setup pack directory.</p>
        <button className={styles.input} style={{marginTop: 16, width: 'auto'}} type="button">Select Compiled Directory...</button>
      </section>
      <section className={styles.card} style={{borderColor: 'rgb(127 29 29 / 30%)', background: 'rgb(127 29 29 / 10%)'}}>
        <div className={styles.sectionHeader} style={{color: 'rgb(248 113 113)'}}><Icons.RotateCcw size={16} />Reset App</div>
        <p className={styles.description}>Erase all data and restore defaults. This cannot be undone.</p>
        <button className={styles.input} style={{background: 'rgb(220 38 38)', marginTop: 16, width: 'auto'}} type="button">Reset App...</button>
      </section>
    </div>
  );
}

function Hotkey({label, value}: {label: string; value: string}) {
  return (
    <label>
      <span className={styles.label}>{label}</span>
      <input className={styles.input} readOnly value={value} />
    </label>
  );
}
