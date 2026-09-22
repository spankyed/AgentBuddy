// The stored settings as one document: what may be stored (`settingsProblems`), and the pure operations that make
// the next document from the last. The repository checks every write with `settingsProblems`, and the settings editor
// checks with it before saving, so both refuse the same document. The operations build new objects from own keys
// (spreads and `Object.fromEntries`, never assignment), so a key such as `__proto__` is data and reaches no prototype.
import { splitRef } from '@abuddy/sdk/ids';
import { isPlainObject } from '@abuddy/sdk/utils/pure';

type Json = Record<string, unknown>;

/** The sections the settings hold */
const SECTIONS = ['general', 'plugins', 'assistant'];

const hasOwn = (object: Json, key: string): boolean => Object.prototype.hasOwnProperty.call(object, key);
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

/**
 * Why `key` can't name a plugin's settings, or undefined when it can: a plugin's settings are stored under its ref.
 * `known` (refs of features with settings), when given, names the ref a bare name most likely meant.
 */
export function pluginKeyProblem(key: string, known: Iterable<string> = []): string | undefined {
  if (splitRef(key)) return undefined;
  const meant = [...known].filter((ref) => splitRef(ref)?.featureId === key);
  return `"${key}" isn't a plugin settings key: a plugin's settings are stored under its ref, "<packId>/<featureId>"`
    + (meant.length === 1 ? `; did you mean "${meant[0]}"?` : '');
}

export interface SettingsCheck {
  /** The document `next` replaces: a section equal to its value there isn't a change */
  before: unknown;
  /** Refs of features with settings, to name the ref a bare plugin key likely meant */
  known?: Iterable<string>;
}

/**
 * What's wrong with `next` as the stored settings, nothing when it may be stored: it must be an object, a section that
 * changes must be one of the settings' sections and an object, and every plugin's settings are keyed by its ref. A
 * slice whose feature isn't registered is kept: a disabled pack's settings stay, and can change, while it's off.
 */
export function settingsProblems(next: unknown, { before, known }: SettingsCheck): string[] {
  if (!isPlainObject(next)) return ['The settings must be a JSON object'];
  const problems: string[] = [];
  for (const [section, value] of Object.entries(next)) {
    if (isEqual(value, ownValue(before, section))) continue;
    if (!SECTIONS.includes(section)) problems.push(`"${section}" isn't a settings section: the settings hold ${SECTIONS.join(', ')}`);
    else if (!isPlainObject(value)) problems.push(`"${section}" must be an object`);
  }
  const plugins = ownValue(next, 'plugins');
  if (!isPlainObject(plugins)) return problems;
  const knownRefs = [...(known ?? [])];
  for (const key of Object.keys(plugins)) {
    const problem = pluginKeyProblem(key, knownRefs);
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
