import type { SettingsCatalog, SettingsDefinition } from '@apackdev/sdk/framework';
import type { SettingsTarget } from '@apackdev/sdk/types';
import { splitRef, PACK_ID_PATTERN, FEATURE_ID_PATTERN } from '@apackdev/sdk/ids';
import { hasOwn, isPlainObject } from '@apackdev/sdk/utils/pure';
import { SettingsRefusedError } from './document.ts';

/** Address grammar is shared by writes, reads and recovery diagnostics. */
export function assertSettingsTarget(target: unknown): asserts target is SettingsTarget {
  if (!isPlainObject(target)) throw new SettingsRefusedError(['A settings target must identify its owner']);
  const keys = Object.keys(target);
  if (target.kind === 'app' && keys.length === 1) return;
  if (target.kind === 'feature' && keys.length === 2 && typeof target.featureRef === 'string' && splitRef(target.featureRef)) return;
  if (target.kind === 'pack' && keys.length === 3 && typeof target.packId === 'string' && PACK_ID_PATTERN.test(target.packId)
    && typeof target.groupId === 'string' && FEATURE_ID_PATTERN.test(target.groupId)) return;
  throw new SettingsRefusedError(['A settings target must identify app, pack/group or feature ownership']);
}

// Backend handles and accepted frontend bindings share the same ownership policy.
export function settingsDefinition(definitions: SettingsCatalog, target: SettingsTarget): SettingsDefinition | undefined {
  assertSettingsTarget(target);
  if (target.kind === 'app') return definitions.app;
  if (target.kind === 'feature') return hasOwn(definitions.features, target.featureRef) ? definitions.features[target.featureRef] : undefined;
  const groups = hasOwn(definitions.packs, target.packId) ? definitions.packs[target.packId] : undefined;
  return groups && hasOwn(groups, target.groupId) ? groups[target.groupId] : undefined;
}

export function authorizeSettings(definitions: SettingsCatalog, target: SettingsTarget, caller?: string, mutation = false): void {
  const definition = settingsDefinition(definitions, target);
  if (!definition) throw new SettingsRefusedError(['This settings definition is unavailable']);
  if (caller === undefined) return; // Only host administration receives an unscoped writer.
  const { dependencies } = definitions;
  if (!hasOwn(dependencies, caller)) throw new SettingsRefusedError([`Settings caller "${caller}" is not declared`]);
  if (target.kind === 'app') return;
  const owner = target.kind === 'pack' ? target.packId : splitRef(target.featureRef)!.packId;
  if (caller !== owner && !dependencies[caller].includes(owner)) {
    throw new SettingsRefusedError([`Pack "${caller}" does not depend on settings owner "${owner}"`]);
  }
  if (mutation && caller !== owner && definition.access === 'owner') {
    throw new SettingsRefusedError([`Only pack "${owner}" may change these settings`]);
  }
}

