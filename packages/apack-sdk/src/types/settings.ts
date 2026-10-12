import type { ZodType } from 'zod';

/** The effective shape of a declarative feature's settings. */
export type FeatureSettingsValue<D> = D extends { schema: ZodType<infer T> } ? T : never;

/** Object fields are addressable; arrays are replaced as a whole. */
export type SettingsPath<T, Depth extends unknown[] = []> = Depth['length'] extends 6 ? never : {
  [K in keyof T & string]: readonly [K] | (NonNullable<T[K]> extends readonly unknown[] ? never
    : NonNullable<T[K]> extends object ? readonly [K, ...SettingsPath<NonNullable<T[K]>, [...Depth, unknown]>] : never)
}[keyof T & string];

/** A path and its value remain paired, including optional fields and record keys. */
export type FeatureSettingUpdate<T> = SettingsPath<T> extends infer P
  ? P extends readonly string[] ? { path: P; value: SettingsValue<T, P> } : never : never;

export type SettingsValue<T, P extends readonly string[]> = P extends readonly [infer K, ...infer Rest]
  ? K extends keyof NonNullable<T> ? Rest extends readonly string[]
    ? Rest extends [] ? NonNullable<T>[K] : SettingsValue<NonNullable<T>[K], Rest> : never : never : never;

/** The store validates every write; reset removes overrides so current defaults apply. */
export interface FeatureSettingsAccess<T> {
  get(): T;
  set(update: FeatureSettingUpdate<T>): void;
  reset(): void;
}
