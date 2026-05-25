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
        {selected ? (
          <div className={styles.settingsPane}>
            <header className={styles.titleRow}>
              <h2 className={styles.title}>{selected.label} Settings</h2>
              {selected.id !== 'settings' ? <button title="Go to plugin"><Icons.ExternalLink size={16} /></button> : null}
            </header>
            <section className={styles.card}>
              {selected.settings.map(setting => (
                <div key={setting.label} className={styles.settingRow}>
                  <div>
                    <strong>{setting.label}</strong>
                    <span>{typeof setting.value === 'boolean' ? 'Boolean setting' : 'Plugin preference'}</span>
                  </div>
                  {typeof setting.value === 'boolean' ? (
                    <span className={`${styles.toggle} ${setting.value ? styles.toggleOn : ''}`}><i /></span>
                  ) : (
                    <span className={styles.value}>{setting.value}</span>
                  )}
                </div>
              ))}
            </section>
            {state.saveStatus === 'saved' ? <div className={styles.save}><Icons.CircleCheck size={12} /> Settings saved</div> : null}
          </div>
        ) : (
          <div className={styles.empty}><Icons.PackageOpen size={64} /><p>Select a plugin to configure its settings</p></div>
        )}
      </main>
    </div>
  );
}
