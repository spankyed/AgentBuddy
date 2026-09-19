import { type BaseEntity, EARS } from '@/__generated__/ears';

// ── Agent/Chat types (moved from threads/types.ts to break circular) ──────

export interface AgentPhase {
  id: string;
  name: string;
  description: string;
  color?: string; // optional hex (e.g. '#3B82F6') — tints the chat phase selector
}

export interface AgentMode {
  id: string;
  name: string;
  description: string;
  phases?: AgentPhase[];
  hidden?: boolean;
  disabled?: boolean;
}

export interface QuickPrompt {
  id: string;
  text: string;
}

export interface CommandItem {
  name: string;
  placeholder: string;
}

// ── Settings types ────────────────────────────────────────────────────────

export interface SettingsData {
  general: GeneralSettings;
  plugins: PluginSettings;
  assistant: AssistantSettings;
}

/** The one Settings row: the user's changes to the default settings (`SettingsData`), and nothing else */
export interface SettingsEntity extends BaseEntity {
  entityType: typeof EARS.Entity.Settings;
  /** Only what differs from the defaults */
  data: Partial<SettingsData>;
  updatedAt?: number;
}

/** A Help tab FAQ: the first `# heading` of a src/seeds/faqs file, and the rest as its answer */
export interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category?: string;
  order?: number;
}

export interface GeneralSettings {
  personal: PersonalInfo;
  application: AppSettings;
  projects: Project[];
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
  address?: Address;
}

import type { KeyboardShortcut, ApplicationHotkeys } from '@abuddy/sdk/types';

export interface AppSettings {
  hotkeys: ApplicationHotkeys;
  openLinksInApp: boolean;
}

// Project definition
export interface Project {
  name: string
  directories: string[]  // First directory is the primary/root directory
  color: string
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

// Chat state indicator config
export interface ChatStateConfig {
  id: string;
  label: string;
  color: string;
  busy: boolean;
}

// Threads plugin settings
export interface ThreadsSettings {
  statuses: ThreadStatusOption[];
  tags: ThreadTagOption[];
  chatStates: ChatStateConfig[];
  showOnlyRootThreads: boolean;
  clickToChat: boolean;
  recentThreadsLimit: number;
  recentThreadsSortOrder: 'created' | 'visited' | 'message';
  recordingLimitMinutes: number;
  skipArchiveConfirm?: boolean;
  chat?: AgentSettings;
}

// Actions plugin settings
export interface ActionsSettings {
  categories: Category[];
}

// Flows plugin settings
export interface FlowsSettings {
  enableFlowPreview?: boolean; // Enable flow preview on single click
}

// Brain plugin settings
export interface BrainSettings {
  inspectEnabled?: boolean; // Whether the brain inspection panel is enabled
}

// Notes plugin settings
export interface NotesSettings {
  tasklistPanelPosition: 'left' | 'right'
  showCollapseIcon: boolean
}

// Browser plugin settings
export interface BrowserSettings {
  showBookmarksBar: boolean;
}

// Logs plugin settings
export interface LogsSettings {
  maxLogs: number; // Maximum number of logs to keep in memory
  excludedSources: string[]; // Array of source patterns to exclude from display
  showAppEvents?: boolean; // When false/undefined, hide `app-events` source logs from the list
}

export interface PluginSettings {
  _meta?: {
    visibility?: PluginVisibilitySettings;
    lastActivePlugin?: string;
  };
  [pluginId: string]: any; // Plugin-specific settings
}

export interface AssistantSettings {
  name: string;
  birthdate: string | null;
}

export interface AgentSettings {
  modes: AgentMode[];
  hotkeys: {
    textToSpeech?: KeyboardShortcut | null;
    switchMode?: KeyboardShortcut | null;
    [key: string]: KeyboardShortcut | null | undefined;
  };
  quickPrompts?: QuickPrompt[];
  quickPromptNumberKeyInserts?: boolean;
  skipRevertConfirm?: boolean;
  defaultMode?: string;
  defaultPhase?: string;
}

// System-private entity type
