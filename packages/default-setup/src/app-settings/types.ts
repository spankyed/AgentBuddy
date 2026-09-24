// The settings sections this pack registers with the app (`general` and `assistant`), and the shape of the whole
// document as this pack's code reads it. The app stores and merges these without knowing their shape; what is in
// them is this pack's, so it is declared here rather than in @abuddy/host.
import type { ApplicationHotkeys } from '@abuddy/sdk/types';

export interface SettingsData {
  general: GeneralSettings;
  plugins: PluginSettings;
  assistant: AssistantSettings;
}

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


export interface AppSettings {
  hotkeys: ApplicationHotkeys;
}

export interface Project {
  name: string
  directories: string[]  // First directory is the primary/root directory
  color: string
}

export interface PluginSettings {
  [pluginRef: string]: any;
}

export interface AssistantSettings {
  name: string;
  birthdate: string | null;
}
