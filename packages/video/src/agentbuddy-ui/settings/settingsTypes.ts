export type SettingsTabId = 'general' | 'plugins' | 'help';
export type GeneralSettingsNavId = 'application' | 'secrets' | 'projects' | 'personal' | 'json';

export type SettingsSurfaceState = {
  activeTab: SettingsTabId;
  generalNavItem: GeneralSettingsNavId;
  hotkeys: Array<{action: string; shortcut: string}>;
  importStatus: 'idle' | 'previewing' | 'selecting' | 'success' | 'error';
  pluginRows: Array<{id: string; label: string; selected?: boolean; visible: boolean}>;
  saveStatus?: 'saving' | 'saved';
};
