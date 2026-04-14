/**
 * Pure label computer for the `tool-activity` block.
 *
 * The collapsed label is the only signal a user gets while the group is
 * streaming, so its copy matters: present-progressive tense while things are
 * happening, simple-past aggregate once the turn ends, error count wins when
 * any row failed.
 *
 * This function is intentionally pure and dependency-free so the same logic
 * can be mirrored on the renderer side (see the frontend copy under
 * `packages/renderer/.../blocks/tool-activity-label.ts`). The plan accepts
 * the small duplication rather than force cross-package imports through the
 * esbuild sandbox.
 *
 * NOTE on the default-setup sandbox: relative imports from sibling helper
 * files work because the compiler inlines them via esbuild. No bare module
 * imports are used here.
 */

import type { ToolActivityEntry } from './tool-activity-types';

/** Pick the human present-progressive verb for a tool name. */
function presentVerb(tool: string): string {
  switch (tool) {
    case 'Read': return 'Reading';
    case 'Write': return 'Writing';
    case 'Edit': return 'Editing';
    case 'Glob': return 'Searching';
    case 'Grep': return 'Searching';
    case 'Bash': return 'Running';
    case 'WebFetch': return 'Fetching';
    case 'WebSearch': return 'Searching';
    case 'Task': return 'Delegating';
    case 'NotebookEdit': return 'Editing';
    default: return 'Running';
  }
}

/** Pick the simple-past verb phrase for a tool name. */
function pastVerb(tool: string): string {
  switch (tool) {
    case 'Read': return 'Read';
    case 'Write': return 'Wrote';
    case 'Edit': return 'Edited';
    case 'Glob':
    case 'Grep': return 'Searched';
    case 'Bash': return 'Ran';
    case 'WebFetch': return 'Fetched';
    case 'WebSearch': return 'Searched';
    case 'Task': return 'Delegated';
    case 'NotebookEdit': return 'Edited';
    default: return 'Ran';
  }
}

/** Count nouns for common tools. `n=1` → singular, `n>1` → plural. */
function noun(tool: string, n: number): string {
  const plural = n !== 1;
  switch (tool) {
    case 'Read':
    case 'Write':
    case 'Edit':
    case 'NotebookEdit': return plural ? 'files' : 'file';
    case 'Glob':
    case 'Grep':
    case 'WebSearch': return plural ? 'searches' : 'search';
    case 'Bash': return plural ? 'commands' : 'command';
    case 'WebFetch': return plural ? 'pages' : 'page';
    case 'Task': return plural ? 'tasks' : 'task';
    default: return plural ? 'tools' : 'tool';
  }
}

/** Total entries grouped by tool name, preserving first-seen order. */
function groupByTool(entries: ToolActivityEntry[]): Array<{ tool: string; count: number }> {
  const counts = new Map<string, number>();
  for (const e of entries) {
    counts.set(e.tool, (counts.get(e.tool) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([tool, count]) => ({ tool, count }));
}

/** Round a duration in ms to a short human string: "0.3s", "4.2s", "1m 12s". */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}

/**
 * Compute the collapsed-state label for a tool-activity block.
 *
 * Pure function of (entries, state). Always returns a short string suitable
 * for a single-line chevron row (~40 chars max in the steady state).
 */
export function computeLabel(
  entries: ToolActivityEntry[],
  state: 'streaming' | 'done' | 'error',
  phase?: string,
): string {
  const streamingLabel = phase === 'plan' ? 'Planning…' : 'Working…';
  if (entries.length === 0) {
    return state === 'streaming' ? streamingLabel : 'No activity';
  }

  const running = entries.filter(e => e.status === 'running');
  const errored = entries.filter(e => e.status === 'error');
  const groups = groupByTool(entries);

  // ─── Done / Error ──────────────────────────────────────────────────────
  if (state === 'done' || state === 'error') {
    // If every entry used the same tool, name it specifically.
    if (groups.length === 1) {
      const { tool, count } = groups[0];
      const verb = pastVerb(tool);
      const n = noun(tool, count);
      const errSuffix = errored.length > 0 ? ` · ${errored.length} error${errored.length === 1 ? '' : 's'}` : '';
      return `${verb} ${count} ${n}${errSuffix}`;
    }
    // Two tools: "Read 8 files, ran 2 searches".
    if (groups.length === 2) {
      const [a, b] = groups;
      const aPart = `${pastVerb(a.tool)} ${a.count} ${noun(a.tool, a.count)}`;
      const bPart = `${pastVerb(b.tool).toLowerCase()} ${b.count} ${noun(b.tool, b.count)}`;
      const errSuffix = errored.length > 0 ? ` · ${errored.length} error${errored.length === 1 ? '' : 's'}` : '';
      return `${aPart}, ${bPart}${errSuffix}`;
    }
    // Three or more: aggregate count.
    const total = entries.length;
    const errSuffix = errored.length > 0 ? ` · ${errored.length} error${errored.length === 1 ? '' : 's'}` : '';
    return `Ran ${total} tools${errSuffix}`;
  }

  // ─── Streaming ─────────────────────────────────────────────────────────
  // If only one tool is currently running and it's a "weighty" one (Bash),
  // name it specifically so the user knows what's going on.
  if (running.length === 1 && running[0].tool === 'Bash') {
    const bash = running[0];
    const secs = bash.durationMs ? Math.round(bash.durationMs / 1000) : 0;
    const dur = secs >= 5 ? ` (${secs}s)` : '';
    return `Running bash${dur}…`;
  }

  // Single-tool dominant: "Reading 3 files…"
  if (groups.length === 1) {
    const { tool, count } = groups[0];
    return `${presentVerb(tool)} ${count} ${noun(tool, count)}…`;
  }

  // Mixed tools: generic fallback keeps the label short.
  return streamingLabel;
}

/**
 * Compute the trailing "count · duration" badge shown on the right of the
 * collapsed row once the turn is done. Separate from the main label so the
 * renderer can lay it out as a muted badge.
 */
export function computeBadge(
  entries: ToolActivityEntry[],
  state: 'streaming' | 'done' | 'error',
  totalDurationMs?: number,
): string | null {
  if (state === 'streaming') return null;
  if (entries.length === 0) return null;
  const count = entries.length;
  if (totalDurationMs != null && totalDurationMs > 0) {
    return `${count} · ${formatDuration(totalDurationMs)}`;
  }
  return `${count}`;
}
