// Generated from the host app definition. Run npx tsx scripts/app-settings-types.ts.
export interface AppSettings {
  hotkeys: ApplicationHotkeys;
  personal: AppPersonalInfo;
  projects: AppProject[];
}
export interface ApplicationHotkeys {
  switchPluginUp?: KeyboardShortcut;
  switchPluginDown?: KeyboardShortcut;
  toggleInspectionPanel?: KeyboardShortcut;
  custom?: CustomHotkey[];
}
export interface KeyboardShortcut {
  key: string;
  modifiers: string[];
  global?: boolean;
}
export interface CustomHotkey {
  key: string;
  modifiers: string[];
  global?: boolean;
  id: string;
  eventName: string;
}
export interface AppPersonalInfo {
  name?: string;
  phoneNumber?: string;
  address?: AppAddress;
}
export interface AppAddress {
  street: string;
  street2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}
export interface AppProject {
  name: string;
  directories: string[];
  color: string;
}
