import { BaseEntity } from "@/core/ears";
import type { EARS } from "@/types";
import type { SETTINGS_SCOPE } from '@/core/shared-types/settings';

// Re-export all shared types for backward compat
export * from '@/core/shared-types/settings';

// System-private entity type
export interface SettingsEntity extends BaseEntity {
  entityType: EARS.Entity.Settings;
  name: string; // e.g., 'internal', 'general.secrets', 'plugin.flows'
  data: any; // Flexible data structure
  type?: SETTINGS_SCOPE; // Optional for backward compatibility
  label?: string; // Optional for backward compatibility
}
