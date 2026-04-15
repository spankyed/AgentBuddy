/**
 * Auto-approval predicates for the Claude Code permission handler.
 *
 * `chat.ts`'s `onPermissionRequest` closure opens every tool-use with
 * an approval block by default. A few specific tool-use patterns are
 * safe enough and frequent enough that prompting the user for each
 * one is pure friction — this helper centralizes the "skip the
 * approval dialog" predicates so chat.ts stays readable and every
 * auto-approval rule has exactly one place to live.
 *
 * Files without `export const meta` are auto-inlined into the
 * consuming action at compile time (see packages/default-setup/CLAUDE.md).
 */

/**
 * True when the tool-use is a `Write` targeting an `.md` file anywhere
 * under a project's `.claude/plans/` directory. The path is matched
 * against both absolute and relative forms:
 *
 *   - `/Users/you/proj/.claude/plans/001-foo.md`       → true
 *   - `.claude/plans/001-foo.md`                        → true
 *   - `.claude/plans/nested/sub/doc.md`                 → true
 *   - `.claude/plans/001-foo.txt`                       → false (not .md)
 *   - `.claude/plans-evil/001-foo.md`                   → false (prefix-only match)
 *   - `plans/001-foo.md`                                → false (not under .claude/)
 *   - anything without `.claude/plans/` in the path     → false
 *
 * The match is structural (`.claude/plans/` as a path segment, not a
 * substring) so malicious path crafting like `.claude/plans-evil/`
 * can't slip through.
 */
export function isPlanFileWrite(
  toolName: string,
  input: unknown,
): boolean {
  if (toolName !== 'Write') return false;
  if (!input || typeof input !== 'object') return false;
  const filePath = (input as { file_path?: unknown }).file_path;
  if (typeof filePath !== 'string') return false;
  // `(^|/)` anchors the segment — either the string starts with
  // `.claude/plans/` or `.claude/plans/` follows a `/`. Combined
  // with the `.md$` tail, crafted paths like `.claude/plans-evil/…`
  // or `.claude/plans/foo.txt` both fail.
  return /(^|\/)\.claude\/plans\/.+\.md$/i.test(filePath);
}
