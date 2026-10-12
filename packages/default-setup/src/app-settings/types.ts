// Assistant preferences remain pack-owned; application preferences are the SDK AppSettings contract.
export interface SettingsData {
  features: Record<string, unknown>;
  assistant: AssistantSettings;
}

export interface AssistantSettings {
  name: string;
  birthdate: string | null;
}
