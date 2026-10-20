import type { AppSettings } from './app-settings.ts';

/** Object fields are addressable; arrays are replaced as a whole. */
export type SettingsPath<T, Depth extends unknown[] = []> = Depth['length'] extends 6 ? never : {
  [K in keyof T & string]: readonly [K] | (NonNullable<T[K]> extends readonly unknown[] ? never
    : NonNullable<T[K]> extends object ? readonly [K, ...SettingsPath<NonNullable<T[K]>, [...Depth, unknown]>] : never)
}[keyof T & string];

/** A path and its value remain paired, including optional fields and record keys. */
export type SettingUpdate<T = unknown> = (unknown extends T ? { path: readonly string[]; value: unknown } : SettingsPath<T> extends infer P
  ? P extends readonly string[] ? { path: P; value: Exclude<SettingsValue<T, P>, undefined> } : never : never) & { condition?: SettingsWriteCondition };

export type SettingsValue<T, P extends readonly string[]> = P extends readonly [infer K, ...infer Rest]
  ? K extends keyof NonNullable<T> ? Rest extends readonly string[]
    ? Rest extends [] ? NonNullable<T>[K] : SettingsValue<NonNullable<T>[K], Rest> : never : never : never;

/** The store validates every write; reset removes overrides so current defaults apply. */
export interface ReadonlySettingsHandle<T> {
  get(): T;
  /** Observes this target's effective value; returns the unsubscribe function. */
  onChange(listener: (value: T) => void): () => void;
}

export interface SettingsHandle<T> extends ReadonlySettingsHandle<T> {
  set(update: SettingUpdate<T>): void;
  reset(): void;
}

/** Value ownership is independent of navigation labels and the requesting pack. */
export type SettingsTarget =
  | { kind: 'app' }
  | { kind: 'pack'; packId: string; groupId: string }
  | { kind: 'feature'; featureRef: `${string}/${string}` };

/** Effective preferences; the host owns this document, not any installed pack. */
export interface SettingsDocument {
  app: AppSettings;
  packs: Record<string, Record<string, unknown>>;
  features: Record<string, unknown>;
}

/** Sparse explicit choices; values equal to defaults remain choices until reset. */
export interface SettingsOverrides {
  app?: Record<string, unknown>;
  packs?: Record<string, Record<string, unknown>>;
  features?: Record<string, unknown>;
}

/** Relative paths below an explicit settings owner. */
export function settingsTargetPath(target: SettingsTarget): readonly string[] {
  switch (target.kind) {
    case 'app': return ['app'];
    case 'pack': return ['packs', target.packId, target.groupId];
    case 'feature': return ['features', target.featureRef];
    default: throw new Error('A settings target must identify app, pack/group or feature ownership');
  }
}

/** A value comparison refuses replacing a draft whose source changed. */
export interface SettingsWriteCondition {
  runId: string;
  expected: { exists: boolean; value?: unknown };
}

/** Schema problems identify a resettable owner; document problems do not. */
export interface SettingsProblem {
  target?: SettingsTarget;
  path: readonly string[];
  message: string;
}

/** A recovery action must refer to the exact settings and declarations shown by the host. */
export interface SettingsRecoveryVersion {
  runId: string;
  revision: number;
  catalogRevision: number;
}

/** Recovery diagnostics and the restart requirement are separate from typed settings snapshots. */
export interface SettingsRecovery {
  status: 'invalid' | 'repaired';
  version: SettingsRecoveryVersion;
  problems: readonly SettingsProblem[];
}

export interface SettingsRecoveryRequest {
  version: SettingsRecoveryVersion;
  reset: 'all' | readonly SettingsTarget[];
}

/** Complete window data, with independent declaration and value revisions. */
export interface SettingsSnapshot {
  runId: string;
  revision: number;
  status: 'ready' | 'replacing';
  values: SettingsDocument;
  catalog: import('../framework/pack-settings.ts').SettingsCatalog;
}

export type SettingsWriteResult =
  | { status: 'saved' }
  | { status: 'refused'; problems: string[] };
