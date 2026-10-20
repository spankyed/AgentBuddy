import { _compileSettingsDefinition, type SettingsCatalog, type SettingsDefinition } from '@apackdev/sdk/framework';
import { deepMerge, hasOwn, isPlainObject } from '@apackdev/sdk/utils/pure';
import { settingsTargetPath, type AppSettings, type SettingsDocument, type SettingsTarget } from '@apackdev/sdk/types';
import type { FeatureRef } from '@apackdev/sdk/ids';
import { getIn, isEqual, settingsProblems, SettingsRefusedError } from './document.ts';

/** Compile one accepted revision; live writes and backup preflight validate through the same rules. */
export function compileSettingsCatalog(catalog: SettingsCatalog) {
  const validators = new Map<string, { path: readonly string[]; problems(value: unknown): string[] }>();
  const compile = (target: SettingsTarget, definition: SettingsDefinition) => {
    const path = settingsTargetPath(target);
    const validator = _compileSettingsDefinition(definition);
    validators.set(JSON.stringify(path), { path, problems: value => validator.validate(value)
      .map(issue => `${path.join('/')} ${issue.path.join('.') || 'settings'}: ${issue.message}`) });
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
      for (const validator of validators.values()) problems.push(...validator.problems(getIn(value, validator.path)));
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
          if (before !== undefined && !isEqual(value, getIn(before, path))) problems.push(`Unavailable settings owner ${path.join('/')}`);
          return;
        }
        problems.push(...validator.problems(value));
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
