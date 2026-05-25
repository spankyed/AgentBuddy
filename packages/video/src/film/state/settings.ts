import type {SettingsSurfaceState} from '../../agentbuddy-ui/settings/settingsTypes';

export const settingsSurfaceState: SettingsSurfaceState = {
  activeTab: 'general',
  generalNavItem: 'application',
  importStatus: 'idle',
  hotkeys: [
    {action: 'Execute query', shortcut: 'Cmd + Enter'},
    {action: 'Send message', shortcut: 'Cmd + Return'},
    {action: 'Open command palette', shortcut: 'Cmd + K'},
  ],
  pluginRows: [
    {id: 'threads', label: 'Threads', visible: true},
    {id: 'notes', label: 'Notes', visible: true},
    {id: 'code', label: 'Code', visible: true, selected: true},
    {id: 'database', label: 'Database', visible: true},
    {id: 'logs', label: 'Logs', visible: true},
    {id: 'settings', label: 'Settings', visible: true},
  ],
  saveStatus: 'saved',
};

export function settingsSurfaceStateForFrame(frame: number): SettingsSurfaceState {
  if (frame < 78) return settingsSurfaceState;
  if (frame < 132) {
    return {
      ...settingsSurfaceState,
      activeTab: 'plugins',
    };
  }
  return {
    ...settingsSurfaceState,
    activeTab: 'help',
  };
}
