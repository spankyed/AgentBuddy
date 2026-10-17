// Fixed settings addresses and pure document operations; declarations validate effective values.
import { splitRef, PACK_ID_PATTERN, FEATURE_ID_PATTERN } from '@apackdev/sdk/ids';
import { _settingsJsonProblems } from '@apackdev/sdk/framework';
import { hasOwn, isPlainObject } from '@apackdev/sdk/utils/pure';

const ownValue = (object: unknown, key: string): unknown =>
  isPlainObject(object) && hasOwn(object, key) ? object[key] : undefined;

/** Whether two JSON values are equal, objects key by key whatever their order */
export function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, i) => isEqual(item, b[i]));
  }
  if (!isPlainObject(a) || !isPlainObject(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => hasOwn(b, key) && isEqual(a[key], b[key]));
}

/** A copy of `node` with `value` at `path`, copying only the objects along it; a step that isn't an object becomes one */
export function setIn(node: unknown, path: readonly string[], value: unknown): unknown {
  if (path.length === 0) return value;
  const [key, ...rest] = path;
  const object = isPlainObject(node) ? node : {};
  return { ...object, [key]: setIn(ownValue(object, key), rest, value) };
}

/** A copy of `node` without the value at `path`; `node` itself when nothing is there */
export function removeIn(node: unknown, path: readonly string[]): unknown {
  if (!isPlainObject(node) || path.length === 0 || !hasOwn(node, path[0])) return node;
  const [key, ...rest] = path;
  if (rest.length === 0) return Object.fromEntries(Object.entries(node).filter(([name]) => name !== key));
  const child = removeIn(node[key], rest);
  return child === node[key] ? node : { ...node, [key]: child };
}

/** Address validation applies equally to stored overrides and whole-document edits. */
export function settingsProblems(next: unknown): string[] {
  const json = _settingsJsonProblems(next);
  if (json.length) return json.map(problem => `${problem.path.join('.') || 'settings'}: ${problem.message}`);
  if (!isPlainObject(next)) return ['The settings must be a JSON object'];
  const problems: string[] = [];
  for (const [owner, value] of Object.entries(next)) {
    if (!['app', 'packs', 'features'].includes(owner)) problems.push(`"${owner}" isn't a settings owner: the settings hold app, packs, features`);
    else if (!isPlainObject(value)) problems.push(`"${owner}" must be an object`);
  }
  const packs = ownValue(next, 'packs');
  if (isPlainObject(packs)) {
    for (const [packId, groups] of Object.entries(packs)) {
      if (!PACK_ID_PATTERN.test(packId) || !isPlainObject(groups)) problems.push(`Invalid pack settings owner "${packId}"`);
      else for (const groupId of Object.keys(groups)) {
        if (!FEATURE_ID_PATTERN.test(groupId)) problems.push(`Invalid settings group "${packId}/${groupId}"`);
      }
    }
  }
  const features = ownValue(next, 'features');
  if (isPlainObject(features)) {
    for (const key of Object.keys(features)) {
      if (!splitRef(key)) problems.push(`"${key}" isn't a ref: a feature's settings are stored under "<packId>/<featureId>"`);
    }
  }
  return problems;
}

/** Settings refused as a whole, each reason in `problems` */
export class SettingsRefusedError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(problems.join('; '));
    this.name = 'SettingsRefusedError';
    this.problems = problems;
  }
}
