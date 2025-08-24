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
  pluginVisibility: PluginVisibilitySettings;
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
  google?: string;     // Secret ID reference
  anthropic?: string;  // Secret ID reference
  openai?: string;     // Secret ID reference
  custom?: CustomApiKey[];
}

export interface CustomApiKey {
  id: string;          // Unique ID for the custom key
  name: string;        // Display name
  secretId: string;    // Reference to Secret entity
  eventName: string;   // Event name for accessing (e.g., "WEATHER_API_KEY")
  description?: string;
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

// Plugin visibility settings
export interface PluginVisibilitySettings {
  [pluginId: string]: boolean; // true = visible in toolbar, false = hidden
}

// Database plugin settings
export interface DatabaseSettings {
  hotkeys: {
    executeQuery?: KeyboardShortcut;
  };
}

// Category definition for prompts and actions
export interface Category {
  name: string;
  color: string; // Hex color value
}

// Prompts plugin settings
export interface PromptsSettings {
  categories: Category[];
}

// Thread status definition
export interface ThreadStatusOption {
  label: string;
  color: string; // Hex color value
}

// Thread tag definition
export interface ThreadTagOption {
  name: string;
  color?: string; // Optional hex color value
}

// Threads plugin settings
export interface ThreadsSettings {
  statuses: ThreadStatusOption[];
  tags: ThreadTagOption[];
  showOnlyRootThreads: boolean;
}

// Actions plugin settings
export interface ActionsSettings {
  categories: Category[];
}

// Flows plugin settings
export interface FlowsSettings {
  rootFlowId?: string; // ID of the flow with the root_flow role
}

// Brain plugin settings
export interface BrainSettings {
  runningRootFlowId?: string; // The ID of the root flow currently running in the brain
}

// Logs plugin settings
export interface LogsSettings {
  maxLogs: number; // Maximum number of logs to keep in memory
  excludedSources: string[]; // Array of source patterns to exclude from display
}

export interface PluginSettings {
  [pluginId: string]: any; // Plugin-specific settings
}

export interface InternalSettings {
  hasOnboarded: boolean;
  lastInteractionTimestamp: number | null;
  version: string;
}