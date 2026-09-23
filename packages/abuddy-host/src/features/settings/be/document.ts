// The stored settings as one document: what may be stored (`settingsProblems`), and the pure operations that make
// the next document from the last. The store checks every write with `settingsProblems`, and the settings editor
// checks with it before saving, so both refuse the same document. The operations build new objects from own keys
// (spreads and `Object.fromEntries`, never assignment), so a key such as `__proto__` is data and reaches no prototype.
//
// The host owns the document's structure, not its content: it knows `plugins`, one slice per installed feature with
// settings keyed by its ref, and takes every other section as opaque — whoever registered a section knows its shape.
// So the sections a document may hold are the caller's to name, not a list here.
import { splitRef } from '@abuddy/sdk/ids';
import { hasOwn, isPlainObject } from '@abuddy/sdk/utils/pure';

/** The section every settings document has: one slice per installed feature with settings, keyed by ref */
export const PLUGINS_SECTION = 'plugins';

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

/**
 * What `settings` sets that `defaults` doesn't: the smallest document the defaults merged under it (`deepMerge`) turn
 * back into `settings`, or undefined when that is nothing. Stored settings only set values, so a default `settings`
 * leaves out keeps applying.
 */
export function changesFrom(defaults: unknown, settings: unknown): unknown {
  if (!isPlainObject(defaults) || !isPlainObject(settings)) return isEqual(defaults, settings) ? undefined : settings;
  const changed = Object.entries(settings)
    .map(([key, value]) => [key, changesFrom(ownValue(defaults, key), value)] as const)
    .filter(([, value]) => value !== undefined);
  return changed.length > 0 ? Object.fromEntries(changed) : undefined;
}

/** How a plugin settings key is looked up among the installed features with settings (`refProblem`) */
export const SETTINGS_KIND = 'feature with settings';

export interface SettingsCheck {
  /** The document `next` replaces: a section or plugin slice equal to its value there isn't a change */
  before: unknown;
  /**
   * The sections this document may hold besides `plugins`, as the packs that registered them named. The host knows
   * only `plugins`, so a caller that doesn't name a section makes it unknown — which is what refuses a typo rather
   * than storing it under a name nothing reads.
   */
  sections: readonly string[];
  /**
   * Why a plugin key whose slice changes can't be written, where the installed features with settings are known: the
   * store gives it for a replacement, the one edge with arbitrary keys; every other write names its plugin by a ref its
   * caller already parsed. Without it, a key only has to be a ref.
   */
  keyProblem?: (key: string) => string | undefined;
}

/**
 * What's wrong with `next` as the stored settings, nothing when it may be stored: it must be an object; a section that
 * changes must be `plugins` or one of `sections`, and an object; every plugin's settings are keyed by a ref, and with
 * `keyProblem`, a slice that changes must be an installed feature's with settings. A slice left as it was stays: an
 * uninstalled pack's settings are there for its reinstall.
 */
export function settingsProblems(next: unknown, { before, sections, keyProblem }: SettingsCheck): string[] {
  if (!isPlainObject(next)) return ['The settings must be a JSON object'];
  const known = [PLUGINS_SECTION, ...sections];
  const problems: string[] = [];
  for (const [section, value] of Object.entries(next)) {
    if (isEqual(value, ownValue(before, section))) continue;
    if (!known.includes(section)) problems.push(`"${section}" isn't a settings section: the settings hold ${known.join(', ')}`);
    else if (!isPlainObject(value)) problems.push(`"${section}" must be an object`);
  }
  const plugins = ownValue(next, PLUGINS_SECTION);
  if (!isPlainObject(plugins)) return problems;
  const previous = ownValue(before, PLUGINS_SECTION);
  for (const [key, slice] of Object.entries(plugins)) {
    const changed = !isEqual(slice, ownValue(previous, key));
    const problem = changed && keyProblem
      ? keyProblem(key)
      : splitRef(key) ? undefined : `"${key}" isn't a ref: a plugin's settings are stored under "<packId>/<featureId>"`;
    if (problem) problems.push(problem);
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
