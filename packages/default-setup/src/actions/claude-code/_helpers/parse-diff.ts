/**
 * Minimal unified-diff parser.
 *
 * Splits a concatenated unified-diff blob (multiple `diff --git a/… b/…`
 * sections) into per-file chunks with simple counts and a change type.
 * Not a full parser — doesn't handle binary diffs or complex rename/copy
 * headers beyond detecting them. Good enough for the Phase C `diff`
 * artifact, which just needs to show the user a reviewable list.
 *
 * Pure, dependency-free, synchronous.
 */

export type ChangeType = 'added' | 'modified' | 'deleted' | 'renamed';

export interface ParsedDiffFile {
  path: string;
  patch: string;
  added: number;
  removed: number;
  changeType: ChangeType;
}

export interface ParsedDiff {
  files: ParsedDiffFile[];
  summary: string;
}

/**
 * Parse a unified diff blob into per-file sections.
 *
 * The input is the raw output of `git diff HEAD` (or similar). Each file's
 * section starts with `diff --git a/<path> b/<path>` and continues until
 * the next `diff --git` header (or end of input).
 */
export function parseUnifiedDiff(blob: string): ParsedDiff {
  if (!blob || !blob.trim()) {
    return { files: [], summary: 'No changes' };
  }

  // Split on `diff --git` headers while keeping them attached to the
  // section that follows. `splitIndex` + slice loop avoids capture-group
  // split quirks.
  const headerRe = /^diff --git a\/(.+) b\/(.+)$/gm;
  const headers: Array<{ pathA: string; pathB: string; start: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = headerRe.exec(blob)) !== null) {
    headers.push({ pathA: m[1], pathB: m[2], start: m.index });
  }

  if (headers.length === 0) {
    return { files: [], summary: 'No changes' };
  }

  const files: ParsedDiffFile[] = [];
  for (let i = 0; i < headers.length; i++) {
    const start = headers[i].start;
    const end = i + 1 < headers.length ? headers[i + 1].start : blob.length;
    const patch = blob.slice(start, end);
    const path = headers[i].pathB || headers[i].pathA;

    const changeType: ChangeType = detectChangeType(patch, headers[i]);
    const { added, removed } = countChanges(patch);

    files.push({ path, patch, added, removed, changeType });
  }

  const totalAdded = files.reduce((s, f) => s + f.added, 0);
  const totalRemoved = files.reduce((s, f) => s + f.removed, 0);
  const summary = `${files.length} file${files.length === 1 ? '' : 's'}, +${totalAdded} -${totalRemoved}`;

  return { files, summary };
}

function detectChangeType(
  patch: string,
  header: { pathA: string; pathB: string },
): ChangeType {
  if (patch.includes('new file mode')) return 'added';
  if (patch.includes('deleted file mode')) return 'deleted';
  if (patch.includes('rename from') || header.pathA !== header.pathB) return 'renamed';
  return 'modified';
}

/**
 * Count `+` / `-` lines in a unified diff section, ignoring the `+++` /
 * `---` file header markers at the top.
 */
function countChanges(patch: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  const lines = patch.split('\n');
  for (const line of lines) {
    // Skip file headers: '+++ b/foo.ts', '--- a/foo.ts'.
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    // Skip hunk headers: '@@ -1,3 +1,4 @@'.
    if (line.startsWith('@@')) continue;
    if (line.startsWith('+')) added++;
    else if (line.startsWith('-')) removed++;
  }
  return { added, removed };
}
