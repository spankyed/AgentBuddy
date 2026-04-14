/**
 * Frontend copy of `computeLabel` / `computeBadge` for the tool-activity block.
 *
 * This is a duplicate of the backend helper at
 * `packages/default-setup/src/actions/claude-code/_helpers/tool-activity-label.ts`
 * — the plan explicitly accepts duplication because:
 *   1. The default-setup package uses an esbuild sandbox that can't import
 *      from the renderer package.
 *   2. The label logic is ~30 lines of pure functions with no deps.
 *   3. The backend writer is the source of truth for live labels; the
 *      frontend only re-computes them as a fallback if `props.label`
 *      is missing or to keep tooltips/badges in sync with late-arriving
 *      prop updates.
 *
 * Keep in sync if the copy rules change.
 */

export interface ToolActivityEntry {
  id: string
  tool: string
  summary: string
  status: 'running' | 'ok' | 'denied' | 'error'
  durationMs?: number
  outputSummary?: string
  details?: { input?: unknown; output?: string; error?: string }
}

function presentVerb(tool: string): string {
  switch (tool) {
    case 'Read': return 'Reading'
    case 'Write': return 'Writing'
    case 'Edit': return 'Editing'
    case 'Glob':
    case 'Grep': return 'Searching'
    case 'Bash': return 'Running'
    case 'WebFetch': return 'Fetching'
    case 'WebSearch': return 'Searching'
    case 'Task': return 'Delegating'
    case 'NotebookEdit': return 'Editing'
    default: return 'Running'
  }
}

function pastVerb(tool: string): string {
  switch (tool) {
    case 'Read': return 'Read'
    case 'Write': return 'Wrote'
    case 'Edit': return 'Edited'
    case 'Glob':
    case 'Grep': return 'Searched'
    case 'Bash': return 'Ran'
    case 'WebFetch': return 'Fetched'
    case 'WebSearch': return 'Searched'
    case 'Task': return 'Delegated'
    case 'NotebookEdit': return 'Edited'
    default: return 'Ran'
  }
}

function noun(tool: string, n: number): string {
  const plural = n !== 1
  switch (tool) {
    case 'Read':
    case 'Write':
    case 'Edit':
    case 'NotebookEdit': return plural ? 'files' : 'file'
    case 'Glob':
    case 'Grep':
    case 'WebSearch': return plural ? 'searches' : 'search'
    case 'Bash': return plural ? 'commands' : 'command'
    case 'WebFetch': return plural ? 'pages' : 'page'
    case 'Task': return plural ? 'tasks' : 'task'
    default: return plural ? 'tools' : 'tool'
  }
}

function groupByTool(entries: ToolActivityEntry[]): Array<{ tool: string; count: number }> {
  const counts = new Map<string, number>()
  for (const e of entries) counts.set(e.tool, (counts.get(e.tool) ?? 0) + 1)
  return Array.from(counts.entries()).map(([tool, count]) => ({ tool, count }))
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${(ms / 1000).toFixed(1)}s`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const mins = Math.floor(ms / 60_000)
  const secs = Math.round((ms % 60_000) / 1000)
  return `${mins}m ${secs}s`
}

export function computeLabel(
  entries: ToolActivityEntry[],
  state: 'streaming' | 'done' | 'error',
  phase?: string,
): string {
  const streamingLabel = phase === 'plan' ? 'Planning' : 'Working'
  if (entries.length === 0) {
    return state === 'streaming' ? streamingLabel : 'No activity'
  }

  const running = entries.filter(e => e.status === 'running')
  const errored = entries.filter(e => e.status === 'error')
  const groups = groupByTool(entries)

  if (state === 'done' || state === 'error') {
    if (groups.length === 1) {
      const { tool, count } = groups[0]
      const verb = pastVerb(tool)
      const n = noun(tool, count)
      const errSuffix = errored.length > 0 ? ` · ${errored.length} error${errored.length === 1 ? '' : 's'}` : ''
      return `${verb} ${count} ${n}${errSuffix}`
    }
    if (groups.length === 2) {
      const [a, b] = groups
      const aPart = `${pastVerb(a.tool)} ${a.count} ${noun(a.tool, a.count)}`
      const bPart = `${pastVerb(b.tool).toLowerCase()} ${b.count} ${noun(b.tool, b.count)}`
      const errSuffix = errored.length > 0 ? ` · ${errored.length} error${errored.length === 1 ? '' : 's'}` : ''
      return `${aPart}, ${bPart}${errSuffix}`
    }
    const total = entries.length
    const errSuffix = errored.length > 0 ? ` · ${errored.length} error${errored.length === 1 ? '' : 's'}` : ''
    return `Ran ${total} tools${errSuffix}`
  }

  if (running.length === 1 && running[0].tool === 'Bash') {
    const bash = running[0]
    const secs = bash.durationMs ? Math.round(bash.durationMs / 1000) : 0
    const dur = secs >= 5 ? ` (${secs}s)` : ''
    return `Running bash${dur}`
  }

  if (groups.length === 1) {
    const { tool, count } = groups[0]
    return `${presentVerb(tool)} ${count} ${noun(tool, count)}`
  }

  return streamingLabel
}

export function computeBadge(
  entries: ToolActivityEntry[],
  state: 'streaming' | 'done' | 'error',
  totalDurationMs?: number,
): string | null {
  if (state === 'streaming') return null
  if (entries.length === 0) return null
  const count = entries.length
  if (totalDurationMs != null && totalDurationMs > 0) {
    return `${count} · ${formatDuration(totalDurationMs)}`
  }
  return `${count}`
}
