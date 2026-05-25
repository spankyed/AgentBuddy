export type SettingsTabId = 'general' | 'plugins' | 'help';
export type GeneralSettingsNavId = 'application' | 'secrets' | 'projects' | 'personal' | 'json';

export type SettingsSurfaceState = {
  activeTab: SettingsTabId;
  generalNavItem: GeneralSettingsNavId;
  hotkeys: Array<{action: string; shortcut: string}>;
  importStatus: 'idle' | 'previewing' | 'selecting' | 'success' | 'error';
  personal: {
    name: string;
    phoneNumber: string;
    address: {
      street: string;
      street2?: string;
      city: string;
      state: string;
      postalCode: string;
      country: string;
    };
  };
  providers: {
    standard: Array<{key: string; label: string; description: string; priority?: 'required' | 'recommended'; saved?: boolean}>;
    custom: Array<{name: string; saved: boolean}>;
    cli: Array<{label: string; command: string; detected?: boolean}>;
  };
  projects: Array<{name: string; directories: string[]; color: string}>;
  settingsJson: string;
  pluginRows: Array<{id: string; label: string; selected?: boolean; visible: boolean; settings: Array<{label: string; value: string | boolean}>}>;
  saveStatus?: 'saving' | 'saved';
};
