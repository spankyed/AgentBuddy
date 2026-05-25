import {makeStyles} from '../primitives/makeStyles';
import {GeneralSettingsTab} from './GeneralSettingsTab';
import {PluginsSettingsTab} from './PluginsSettingsTab';
import {HelpSettingsTab} from './HelpSettingsTab';
import type {SettingsSurfaceState, SettingsTabId} from './settingsTypes';
import './SettingsSurface.module.css';

const styles = makeStyles('SettingsSurface');

const tabs: Array<{id: SettingsTabId; label: string}> = [
  {id: 'general', label: 'General'},
  {id: 'plugins', label: 'Plugins'},
  {id: 'help', label: 'Help'},
];

export function SettingsSurface({state}: {state: SettingsSurfaceState}) {
  return (
    <div className={styles.root}>
      <header className={styles.tabs}>
        {tabs.map(tab => (
          <div key={tab.id} className={`${styles.tab} ${state.activeTab === tab.id ? styles.tabActive : ''}`}>{tab.label}</div>
        ))}
      </header>
      <main className={styles.content}>
        {state.activeTab === 'general' ? <GeneralSettingsTab state={state} /> : null}
        {state.activeTab === 'plugins' ? <PluginsSettingsTab state={state} /> : null}
        {state.activeTab === 'help' ? <HelpSettingsTab /> : null}
      </main>
    </div>
  );
}
