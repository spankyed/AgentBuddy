import { BaseEntity } from "@/core/utils/ears";
import type { EARS } from "@/types";

export interface SettingsEntity extends BaseEntity {
  entityType: EARS.Entity.Settings;
  type: 'general' | 'plugin' | 'internal';
  label: string; // e.g., 'general', 'agent', 'flows' (always lowercase)
  data: any; // Flexible data structure
}

export interface SettingsData {
  general: GeneralSettings;
  plugins: PluginSettings;
  internal: InternalSettings;
}

export interface GeneralSettings {
  personal: PersonalInfo;
  apiKeys: ApiKeys;
  hotkeys: ApplicationHotkeys;
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

// Base keyboard shortcut configuration
export interface KeyboardShortcut {
  key: string;
  modifiers: string[];
  global?: boolean;
}

export interface CustomHotkey extends KeyboardShortcut {
  id: string;
  eventName: string;
}

export interface ApplicationHotkeys {
  switchPluginUp?: KeyboardShortcut;
  switchPluginDown?: KeyboardShortcut;
  toggleInspectionPanel?: KeyboardShortcut;
  custom?: CustomHotkey[];
}

export interface MiscSettings {
  // Empty for now, to be extended later
}

export interface PluginSettings {
  [pluginId: string]: any; // Plugin-specific settings
}

export interface InternalSettings {
  hasOnboarded: boolean;
  lastInteractionTimestamp: number | null;
  version: string;
}