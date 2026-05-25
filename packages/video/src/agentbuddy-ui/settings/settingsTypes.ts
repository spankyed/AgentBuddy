import type {PluginId} from '../chrome/Toolbar';

export type SettingsTabId = 'general' | 'plugins' | 'help';
export type GeneralSettingsNavId = 'application' | 'secrets' | 'projects' | 'personal' | 'json';

export type SettingsProject = {
  color: string;
  directories: string[];
  name: string;
};

export type ProviderKeyState = {
  description: string;
  hasKey?: boolean;
  key: string;
  label: string;
  priority?: 'required' | 'recommended';
};

export type PluginSettingsItem = {
  id: PluginId;
  label: string;
  visible: boolean;
};

export type SettingsSurfaceState = {
  activeTab: SettingsTabId;
  faqs: Array<{answer: string; expanded?: boolean; id: string; question: string}>;
  generalNavItem: GeneralSettingsNavId;
  plugins: PluginSettingsItem[];
  providers: ProviderKeyState[];
  projects: SettingsProject[];
  saveStatus?: 'idle' | 'saving' | 'saved';
  selectedPluginId?: PluginId;
  settingsJson: string;
  user: {
    address: {
      city: string;
      country: string;
      postalCode: string;
      state: string;
      street: string;
      street2?: string;
    };
    name: string;
    phoneNumber: string;
  };
};
