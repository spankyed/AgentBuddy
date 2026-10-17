import { _compileSettingsDefinition, type SettingsCatalog, type SettingsDefinition, type SettingsValidator } from '@apackdev/sdk/framework';
import { deepMerge, hasOwn, isPlainObject } from '@apackdev/sdk/utils/pure';
import { settingsTargetPath, type AppSettings, type SettingsDocument, type SettingsTarget } from '@apackdev/sdk/types';
import type { FeatureRef } from '@apackdev/sdk/ids';
import { isEqual, settingsProblems, SettingsRefusedError } from './document.ts';

const valueAt = (value: unknown, path: readonly string[]): unknown => path.reduce<unknown>((node, key) =>
  isPlainObject(node) && hasOwn(node, key) ? node[key] : undefined, value);

/** Compile one accepted revision; live writes and backup preflight validate through the same rules. */
export function compileSettingsCatalog(catalog: SettingsCatalog) {
  const validators = new Map<string, SettingsValidator>();
  const compile = (target: SettingsTarget, definition: SettingsDefinition) => {
    validators.set(JSON.stringify(settingsTargetPath(target)), _compileSettingsDefinition(definition));
    return structuredClone(definition.defaults);
  };
  const defaults: SettingsDocument = {
    app: compile({ kind: 'app' }, catalog.app) as unknown as AppSettings,
    packs: Object.fromEntries(Object.entries(catalog.packs).map(([packId, groups]) => [packId,
      Object.fromEntries(Object.entries(groups).map(([groupId, definition]) => [groupId, compile({ kind: 'pack', packId, groupId }, definition)]))])),
    features: Object.fromEntries(Object.entries(catalog.features).map(([ref, definition]) =>
      [ref, compile({ kind: 'feature', featureRef: ref as FeatureRef }, definition)])),
  };

  return {
    defaults,
    /** A transported effective document must be complete, not completed by merging defaults. */
    validateEffective(value: unknown): void {
      const problems = settingsProblems(value);
      if (!isPlainObject(value)) throw new SettingsRefusedError(problems);
      for (const owner of ['app', 'packs', 'features']) {
        if (!hasOwn(value, owner)) problems.push(`Missing settings owner ${owner}`);
      }
      for (const [key, validator] of validators) {
        const path = JSON.parse(key) as string[];
        for (const issue of validator.validate(valueAt(value, path))) {
          problems.push(`${path.join('/')} ${issue.path.join('.') || 'settings'}: ${issue.message}`);
        }
      }
      if (problems.length) throw new SettingsRefusedError(problems);
    },
    /** Import retains well-formed unavailable owners; edits may only retain their prior values. */
    validate(overrides: unknown, previous?: unknown): void {
      const problems = settingsProblems(overrides);
      if (problems.length) throw new SettingsRefusedError(problems);
      const candidate = deepMerge(defaults, overrides) as SettingsDocument;
      const before = previous === undefined ? undefined : deepMerge(defaults, previous);
      const check = (target: SettingsTarget, value: unknown) => {
        const path = settingsTargetPath(target);
        const validator = validators.get(JSON.stringify(path));
        if (!validator) {
          if (before !== undefined && !isEqual(value, valueAt(before, path))) problems.push(`Unavailable settings owner ${path.join('/')}`);
          return;
        }
        for (const issue of validator.validate(value)) problems.push(`${path.join('/')} ${issue.path.join('.') || 'settings'}: ${issue.message}`);
      };
      check({ kind: 'app' }, candidate.app);
      for (const [packId, groups] of Object.entries(candidate.packs)) {
        for (const [groupId, value] of Object.entries(groups)) check({ kind: 'pack', packId, groupId }, value);
      }
      for (const [featureRef, value] of Object.entries(candidate.features)) check({ kind: 'feature', featureRef: featureRef as FeatureRef }, value);
      if (problems.length) throw new SettingsRefusedError(problems);
    },
  };
}
