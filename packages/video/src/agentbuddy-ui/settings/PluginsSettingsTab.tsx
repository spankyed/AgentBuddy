import {Icons} from '../primitives/Icon';
import {BrainPluginSettings} from './plugin-settings/BrainPluginSettings';
import {DatabasePluginSettings} from './plugin-settings/DatabasePluginSettings';
import {LogsPluginSettings} from './plugin-settings/LogsPluginSettings';
import type {PluginSettingsItem, SettingsSurfaceState} from './settingsTypes';
import './PluginsSettingsTab.module.css';
import {makeStyles} from '../primitives/makeStyles';
const styles = makeStyles('PluginsSettingsTab');

const iconByPlugin = {
  threads: Icons.Threads,
  notes: Icons.NotebookText,
  code: Icons.Code,
  flows: Icons.Flows,
  actions: Icons.Play,
  prompts: Icons.Sparkle,
  brain: Icons.Brain,
  database: Icons.Database,
  logs: Icons.Bug,
  settings: Icons.Settings,
} as const;

export function PluginsSettingsTab({state}: {state: SettingsSurfaceState}) {
  const selected = state.plugins.find(plugin => plugin.id === state.selectedPluginId) ?? state.plugins[0];
  return (
    <div className={styles.root}>
      <aside className={styles.sidebar}>
        <h3 className={styles.heading}>Plugins with Settings</h3>
        {state.plugins.map(plugin => <PluginRow key={plugin.id} plugin={plugin} selected={selected?.id === plugin.id} />)}
      </aside>
      <main className={styles.content}>
        {selected ? (
          <>
            <div className={styles.titleRow}>
              <h2 className={styles.title}>{selected.label} Settings</h2>
              {selected.id !== 'settings' ? <Icons.ExternalLink size={16} /> : null}
            </div>
            <SelectedPluginSettings selected={selected.id} state={state} />
          </>
        ) : (
          <div className={styles.empty}><Icons.Package size={64} /><p>Select a plugin to configure its settings</p></div>
        )}
      </main>
    </div>
  );
}

function SelectedPluginSettings({selected, state}: {selected: PluginSettingsItem['id']; state: SettingsSurfaceState}) {
  switch (selected) {
    case 'brain':
      return <BrainPluginSettings />;
    case 'database':
      return <DatabasePluginSettings executeQueryShortcut={state.selectedPluginSettings?.database?.executeQueryShortcut} />;
    case 'logs':
      return (
        <LogsPluginSettings
          excludedSources={state.selectedPluginSettings?.logs?.excludedSources}
          maxLogs={state.selectedPluginSettings?.logs?.maxLogs}
        />
      );
    default:
      return <div className={styles.card} />;
  }
}

function PluginRow({plugin, selected}: {plugin: PluginSettingsItem; selected: boolean}) {
  const Icon = iconByPlugin[plugin.id];
  const VisibilityIcon = plugin.visible ? Icons.Eye : Icons.EyeOff;
  return (
    <div className={styles.pluginRow}>
      <button className={styles.pluginButton} data-active={selected} type="button"><Icon size={16} />{plugin.label}</button>
      <span className={styles.visibility} data-visible={plugin.visible}><VisibilityIcon size={16} /></span>
    </div>
  );
}
