import {Icons} from '../primitives/Icon';
import {makeStyles} from '../primitives/makeStyles';
import type {SettingsSurfaceState} from './settingsTypes';
import './PluginsSettingsTab.module.css';

const styles = makeStyles('PluginsSettingsTab');

export function PluginsSettingsTab({state}: {state: SettingsSurfaceState}) {
  const selected = state.pluginRows.find(row => row.selected) ?? state.pluginRows[0];
  return (
    <div className={styles.root}>
      <aside className={styles.sidebar}>
        <div className={styles.heading}>Plugins with Settings</div>
        {state.pluginRows.map(row => (
          <div key={row.id} className={styles.rowWrap}>
            <div className={`${styles.row} ${row.selected ? styles.active : ''}`}>
              <Icons.Plug size={16} />
              {row.label}
            </div>
            <div className={styles.eye}>{row.visible ? <Icons.Eye size={16} /> : <Icons.EyeOff size={16} />}</div>
          </div>
        ))}
      </aside>
      <main className={styles.content}>
        <h2 className={styles.title}>{selected?.label ?? 'Plugin'} Settings</h2>
      </main>
    </div>
  );
}
