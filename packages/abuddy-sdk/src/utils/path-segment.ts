/**
 * Whether a name the app was handed is usable as **one directory**.
 *
 * Two places take such a name from outside: an `abuddy dev` profile (`--profile <name>`) and a pack's own
 * data directory (`getDataDirPath(name)`). Both join it onto a path, and one of them also removes what it
 * returns, so the rule has to be the same in both — it was written twice, and the copy that governed pack
 * data was missing the filesystem's reserved names.
 *
 * The reserved names and the trailing dot/space rule are Windows'; the rest keeps a name to something that
 * survives a case-insensitive filesystem and a shell. Refusing them everywhere rather than only on Windows is
 * deliberate: a pack that works on macOS and fails at `mkdir` on Windows is worse than one that is told so.
 */
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** Why `name` is not one usable directory, or nothing. `subject` names what it is for, e.g. `'instance name'`. */
export function _pathSegmentProblem(name: string, subject: string): string | undefined {
  if (!SEGMENT.test(name)) {
    return `"${name}" isn't a usable ${subject}: letters, digits, dot, dash and underscore, starting with a letter or digit, up to 64 characters.`;
  }
  // A trailing dot only: a trailing space cannot reach here, since SEGMENT has no space in it at all.
  // Both copies this replaces tested `/[. ]$/`, where the space half could never fire.
  if (RESERVED.test(name) || name.endsWith('.')) return `"${name}" is reserved by the filesystem.`;
  return undefined;
}
