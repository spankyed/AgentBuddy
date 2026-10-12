import type { ZodType, output } from 'zod';
import { boundHost } from '../runtime/host-runtime.ts';
import type { FeatureRef } from '../ids/index.ts';
import { isPlainObject } from '../utils/shared.ts';

/** A feature owns its defaults and schema; neither declaration names another feature. */
export interface FeatureSettings<T extends Record<string, unknown> = Record<string, unknown>> {
  defaults?: T;
  schema?: ZodType<T>;
  visible?: boolean;
}

/** Infer settings from a schema whose fields declare their defaults. Custom forms remain independent. */
export function defineFeatureSettings<S extends ZodType<Record<string, unknown>>>(definition: {
  schema: S;
  visible?: boolean;
}): FeatureSettings<output<S>> & { schema: ZodType<output<S>>; defaults: output<S> } {
  return { ...definition, defaults: definition.schema.parse({}) };
}

/** Registered feature defaults and schemas, keyed by ref, plus pack-owned sections. Backend-only. */
export interface PackSettingsDefaults {
  revision: number;
  settings: { features: Record<string, unknown>; [section: string]: unknown };
  schemas: Record<string, ZodType<Record<string, unknown>>>;
  visibility: Record<string, boolean>;
}

/** Refuse invalid declarations before registering any part of a pack. */
export function checkFeatureSettings(featureId: string, settings: unknown): string[] {
  const where = `Feature "${featureId}" settings`;
  if (!isPlainObject(settings)) return [`${where} must default-export an object`];
  const problems = Object.keys(settings).filter(key => !['defaults', 'schema', 'visible'].includes(key))
    .map(key => `${where} set "${key}"; only "defaults", "schema", and "visible" are allowed`);
  if (settings.visible !== undefined && typeof settings.visible !== 'boolean') problems.push(`${where}: "visible" must be true or false`);
  if (settings.defaults !== undefined && !isPlainObject(settings.defaults)) problems.push(`${where}: "defaults" must be an object`);
  if (settings.schema === undefined) {
    if (settings.defaults !== undefined) problems.push(`${where}: defaults require a schema`);
    return problems;
  }
  const schema = settings.schema as ZodType;
  // Published packs and tools can load different copies of Zod; its public methods define the contract.
  if (!schema || typeof schema.parse !== 'function' || typeof schema.safeParse !== 'function') {
    return [...problems, `${where}: "schema" must be a Zod schema`];
  }
  const checked = schema.safeParse(settings.defaults ?? {});
  if (!checked.success) problems.push(...checked.error.issues.map(issue => `${where}: ${issue.path.join('.') || 'defaults'}: ${issue.message}`));
  else if (!isPlainObject(checked.data)) problems.push(`${where}: the schema must produce an object`);
  return problems;
}

/** The default settings registered packs' features declare (the bound app's registered packs) */
export function getPackSettingsDefaults(): PackSettingsDefaults {
  return boundHost().packs.settingsDefaults();
}

/** Calls `listener` whenever a pack's feature settings are registered or unregistered; returns the unsubscribe */
export function onPackSettingsDefaultsChanged(listener: () => void): () => void {
  return boundHost().packs.onSettingsDefaultsChanged(listener);
}

/**
 * The refs of every installed feature that can have settings, a disabled pack's included (the bound app's): it declares
 * a settings declaration. A feature's settings may be written only under one of
 * them; the settings of a pack since uninstalled stay while nothing changes them.
 */
export function getFeaturesWithSettings(): readonly FeatureRef[] {
  return boundHost().packs.featuresWithSettings();
}
