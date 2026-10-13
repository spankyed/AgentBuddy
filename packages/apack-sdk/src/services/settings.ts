import type { SettingsTarget, SettingsDocument, SettingsOverrides, SettingsSnapshot, SettingsWriteCondition } from '../types/settings.ts';

/** Caller-bound preference access. A target never supplies the caller's identity. */
export interface SettingsService {
  get<T = unknown>(target: SettingsTarget): T;
  set(target: SettingsTarget, path: readonly string[], value: unknown, condition?: SettingsWriteCondition): void;
  reset(target: SettingsTarget): void;
  onChange(listener: (change: SettingsChange) => void): () => void;
}

/** Trusted host operations; unavailable on pack-facing services. */
export interface SettingsAdmin extends SettingsService {
  getAll(): SettingsDocument;
  getSnapshot(): SettingsSnapshot;
  getOverrides(): SettingsOverrides;
  replaceAll(document: unknown, condition?: SettingsWriteCondition): void;
  removeOverrides(path: readonly string[]): void;
  resetAll(): void;
  whileReplacingData<T>(replace: () => Promise<T>): Promise<T>;
  forPack(packId: string): SettingsService;
}

export type SettingsChange = 'written' | 'replacing' | 'replaced';
