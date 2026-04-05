export interface Migration {
  fromVersion: string;
  toVersion: string;
  description: string;
  migrate: () => void | Promise<void>;
}

export interface MigrationResult {
  migrated: boolean;
  fromVersion: string;
  toVersion: string;
}
