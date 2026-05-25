export type SettingsSectionId = 'general' | 'models' | 'tools' | 'shortcuts' | 'account';

export type SettingsSurfaceState = {
  activeSection: SettingsSectionId;
  sections: Array<{id: SettingsSectionId; label: string}>;
  modelRouting: Array<{model: string; provider: string; selected?: boolean; task: string}>;
  tools: Array<{enabled: boolean; name: string; scope: string}>;
  preferences: Array<{label: string; value: string}>;
};
