import type { EARS } from '@/core/types';

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

export type SETTINGS_SCOPE = 'general' | 'plugin' | 'internal';

export interface SettingsData {
  general: GeneralSettings;
  plugins: PluginSettings;
  internal: InternalSettings;
  assistant: AssistantSettings;
}

export interface GeneralSettings {
  personal: PersonalInfo;
  secrets: Secrets;
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
  address?: string | Address; // Support both legacy string and new structured format
}

export interface Secrets {
  google?: string | null; // Secret ID reference
  anthropic?: string | null; // Secret ID reference
  openai?: string | null; // Secret ID reference
  groq?: string | null; // Secret ID reference
  mistral?: string | null; // Secret ID reference
  cohere?: string | null; // Secret ID reference
  custom?: Record<string, string>; // Custom provider name -> Secret ID
  required: string[]; // List of required providers, e.g., ['openai']
  cliPaths?: Record<string, string>; // e.g., { 'claude-code': '/usr/local/bin/claude' }
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
  rootFlowId?: string; // ID of the flow with the root_flow role
  enableFlowPreview?: boolean; // Enable flow preview on single click
}

// Brain plugin settings
export interface BrainSettings {
  runningRootFlowId?: string; // The ID of the root flow currently running in the brain
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

export interface InternalSettings {
  hasOnboarded: boolean;
  lastInteractionTimestamp: number | null;
  version: string;
  seedHash: string | null;
}

export interface AssistantSettings {
  name: string;
  birthdate: string | null;
}

export interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category?: string;
  order?: number;
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
