import {cx} from '../primitives/classNames';
import {makeStyles} from '../primitives/makeStyles';
import type {SettingsSurfaceState} from './settingsTypes';
import './SettingsPanel.module.css';

const styles = makeStyles('SettingsPanel');

export function SettingsPanel({state}: {state: SettingsSurfaceState}) {
  return (
    <main className={styles.root}>
      <h2 className={styles.title}>Settings</h2>
      <section className={styles.section}>
        {state.preferences.map(item => (
          <div key={item.label} className={styles.row}>
            <div>
              <div className={styles.label}>{item.label}</div>
              <div className={styles.sub}>{item.value}</div>
            </div>
            <span className={styles.value}>Edit</span>
          </div>
        ))}
        {state.modelRouting.map(route => (
          <div key={route.task} className={styles.row}>
            <div>
              <div className={styles.label}>{route.task}</div>
              <div className={styles.sub}>{route.provider} / {route.model}</div>
            </div>
            <span className={styles.value}>{route.selected ? 'Default' : 'Route'}</span>
          </div>
        ))}
        {state.tools.map(tool => (
          <div key={tool.name} className={styles.row}>
            <div>
              <div className={styles.label}>{tool.name}</div>
              <div className={styles.sub}>{tool.scope}</div>
            </div>
            <span className={cx(styles.toggle, !tool.enabled && styles.toggleOff)} />
          </div>
        ))}
      </section>
    </main>
  );
}
