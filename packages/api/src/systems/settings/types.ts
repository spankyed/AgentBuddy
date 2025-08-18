import { BaseEntity } from "@/core/utils/ears";
import type { EARS } from "@/types";

export interface SettingsEntity extends BaseEntity {
  entityType: EARS.Entity.Settings;
  data: SettingsData;
}

export interface SettingsData {
  general: GeneralSettings;
  plugins: PluginSettings;
}

export interface GeneralSettings {
  personal: PersonalInfo;
  apiKeys: ApiKeys;
  hotkeys: Hotkeys;
  misc: MiscSettings;
}

export interface Address {
  street: string;
  street2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface PersonalInfo {
  name?: string;
  phoneNumber?: string;
  address?: string | Address; // Support both legacy string and new structured format
}

export interface ApiKeys {
  google?: string;
  anthropic?: string;
  openai?: string;
}

export interface CustomHotkey {
  id: string;
  eventName: string;
  key: string;
  modifiers: string[];
}

export interface Hotkeys {
  switchPluginUp?: {
    key: string;
    modifiers: string[];
  };
  switchPluginDown?: {
    key: string;
    modifiers: string[];
  };
  toggleInspectionPanel?: {
    key: string;
    modifiers: string[];
  };
  custom?: CustomHotkey[];
}

export interface MiscSettings {
  // Empty for now, to be extended later
}

export interface PluginSettings {
  [pluginId: string]: any; // Plugin-specific settings
}

// Default settings
export const defaultSettings: SettingsData = {
  general: {
    personal: {},
    apiKeys: {},
    hotkeys: {
      switchPluginUp: {
        key: 'ArrowUp',
        modifiers: ['cmd', 'option']
      },
      switchPluginDown: {
        key: 'ArrowDown',
        modifiers: ['cmd', 'option']
      },
      toggleInspectionPanel: {
        key: 'b',
        modifiers: ['cmd']
      }
    },
    misc: {}
  },
  plugins: {}
};