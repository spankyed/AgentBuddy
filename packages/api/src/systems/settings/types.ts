import { BaseEntity } from "@/core/utils/ears";
import type { EARS } from "@/types";

export interface SettingsEntity extends BaseEntity {
  entityType: EARS.Entity.Settings;
  data: SettingsData;
}

export interface SettingsData {
  general: GeneralSettings;
  plugins: PluginSettings;
  faq: FAQSettings;
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

export interface Hotkeys {
  switchPlugin?: {
    key: string;
    modifiers: string[];
  };
}

export interface MiscSettings {
  // Empty for now, to be extended later
}

export interface PluginSettings {
  [pluginId: string]: any; // Plugin-specific settings
}

export interface FAQSettings {
  items: FAQItem[];
}

export interface FAQItem {
  question: string;
  answer: string;
}

// Default settings
export const defaultSettings: SettingsData = {
  general: {
    personal: {},
    apiKeys: {},
    hotkeys: {
      switchPlugin: {
        key: 'ArrowDown+ArrowUp',
        modifiers: ['cmd', 'option']
      }
    },
    misc: {}
  },
  plugins: {},
  faq: {
    items: [
      {
        question: "Where can I view saved messages?",
        answer: "In the database plugin click 3 dots then select option 'view trace history'"
      },
      {
        question: "How do I enable TTS?",
        answer: "Go to mac settings and allow accessibility permission"
      }
    ]
  }
};