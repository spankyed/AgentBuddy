/**
 * Pre-built tool implementations for coding agents.
 *
 * Each function returns a Vercel AI SDK `tool()` object with Zod-validated
 * parameters and an async execute function. Tools that modify state accept
 * an optional `approve` callback for user confirmation before execution.
 *
 * All paths are resolved relative to the provided `cwd` and sandboxed —
 * paths that escape cwd via `../` are rejected.
 */

import { tool } from 'ai'
import { z } from 'zod'
import { execFile } from 'child_process'
import * as fs from 'fs/promises'
import * as path from 'path'
import type { ApproveFn, ToolOptions, GoalState } from './types'

const MAX_OUTPUT = 100_000 // ~100KB output cap
const DEFAULT_TIMEOUT = 30_000 // 30 seconds

/** Resolve and sandbox a path within cwd. Throws if it escapes. */
function safePath(cwd: string, relativePath: string): string {
  const resolved = path.resolve(cwd, relativePath)
  if (!resolved.startsWith(path.resolve(cwd))) {
    throw new Error(`Path escapes working directory: ${relativePath}`)
  }
  return resolved
}

/** Truncate output to MAX_OUTPUT bytes with a notice. */
function truncate(output: string): string {
  if (output.length <= MAX_OUTPUT) return output
  return output.slice(0, MAX_OUTPUT) + `\n\n[output truncated at ${MAX_OUTPUT} chars]`
}

/** Run a command and return stdout+stderr. */
function exec(command: string, opts: { cwd: string; timeout: number }): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    execFile('/bin/sh', ['-c', command], {
      cwd: opts.cwd,
      timeout: opts.timeout,
      maxBuffer: MAX_OUTPUT * 2,
      env: { ...process.env, TERM: 'dumb' },
    }, (error, stdout, stderr) => {
      resolve({
        stdout: truncate(stdout),
        stderr: truncate(stderr),
        exitCode: error ? (error as any).code ?? 1 : 0,
      })
    })
  })
}

/** Request approval if an approve function is provided. Returns false if denied. */
async function requestApproval(approve: ApproveFn | undefined, description: string, detail?: string): Promise<boolean> {
  if (!approve) return true
  const decision = await approve(description, detail)
  return decision === 'approved'
}

// ─── Shell Tool ──────────────────────────────────────────────────────────────

export function shellTool(opts: ToolOptions) {
  return tool({
    description: 'Execute a shell command and return stdout/stderr. Use for running programs, scripts, git commands, package managers, etc.',
    parameters: z.object({
      command: z.string().describe('Shell command to execute'),
      workdir: z.string().optional().describe('Working directory (relative to project root)'),
      timeout_ms: z.number().optional().describe('Timeout in milliseconds (default 30000)'),
    }),
    execute: async (args) => {
      const cwd = args.workdir ? safePath(opts.cwd, args.workdir) : opts.cwd
      const timeout = args.timeout_ms ?? DEFAULT_TIMEOUT

      if (!await requestApproval(opts.approve, `Run command: \`${args.command}\``, `in ${cwd}`)) {
        return 'Tool call denied by user.'
      }

      const { stdout, stderr, exitCode } = await exec(args.command, { cwd, timeout })
      const parts: string[] = []
      if (stdout) parts.push(stdout)
      if (stderr) parts.push(`[stderr]\n${stderr}`)
      if (exitCode !== 0) parts.push(`[exit code: ${exitCode}]`)
      return parts.join('\n') || '(no output)'
    },
  })
}

// ─── Read File Tool ──────────────────────────────────────────────────────────

export function readFileTool(opts: Pick<ToolOptions, 'cwd'>) {
  return tool({
    description: 'Read a file and return its contents. Supports offset/limit for reading portions of large files.',
    parameters: z.object({
      path: z.string().describe('File path (relative to project root)'),
      offset: z.number().optional().describe('Line number to start reading from (0-based)'),
      limit: z.number().optional().describe('Maximum number of lines to read'),
    }),
    execute: async (args) => {
      const filePath = safePath(opts.cwd, args.path)
      try {
        let content = await fs.readFile(filePath, 'utf-8')
        if (args.offset !== undefined || args.limit !== undefined) {
          const lines = content.split('\n')
          const start = args.offset ?? 0
          const end = args.limit !== undefined ? start + args.limit : lines.length
          content = lines.slice(start, end).join('\n')
        }
        return truncate(content) || '(empty file)'
      } catch (err) {
        return `Error reading file: ${(err as Error).message}`
      }
    },
  })
}

// ─── Write File Tool ─────────────────────────────────────────────────────────

export function writeFileTool(opts: ToolOptions) {
  return tool({
    description: 'Write content to a file. Creates the file and any parent directories if they don\'t exist. Overwrites existing content.',
    parameters: z.object({
      path: z.string().describe('File path (relative to project root)'),
      content: z.string().describe('Content to write'),
    }),
    execute: async (args) => {
      const filePath = safePath(opts.cwd, args.path)

      if (!await requestApproval(opts.approve, `Write file: ${args.path}`, `${args.content.length} chars`)) {
        return 'Tool call denied by user.'
      }

      try {
        await fs.mkdir(path.dirname(filePath), { recursive: true })
        await fs.writeFile(filePath, args.content, 'utf-8')
        return `File written: ${args.path} (${args.content.length} chars)`
      } catch (err) {
        return `Error writing file: ${(err as Error).message}`
      }
    },
  })
}

// ─── Grep Tool ───────────────────────────────────────────────────────────────

export function grepTool(opts: Pick<ToolOptions, 'cwd'>) {
  return tool({
    description: 'Search file contents using grep (regex). Returns matching lines with file paths and line numbers.',
    parameters: z.object({
      pattern: z.string().describe('Regex pattern to search for'),
      path: z.string().optional().describe('Directory or file to search in (relative to project root, defaults to root)'),
      include: z.string().optional().describe('Glob pattern to filter files (e.g. "*.ts", "*.py")'),
    }),
    execute: async (args) => {
      const searchPath = args.path ? safePath(opts.cwd, args.path) : opts.cwd
      const grepArgs = ['-rn', '--color=never']
      if (args.include) grepArgs.push(`--include=${args.include}`)
      grepArgs.push(args.pattern, searchPath)

      const { stdout, stderr, exitCode } = await exec(
        `grep ${grepArgs.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ')}`,
        { cwd: opts.cwd, timeout: DEFAULT_TIMEOUT },
      )

      if (exitCode === 1 && !stderr) return 'No matches found.'
      if (stderr && exitCode !== 0) return `Grep error: ${stderr}`

      // Relativize paths in output
      const relative = stdout.replace(new RegExp(opts.cwd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/', 'g'), '')
      return truncate(relative) || 'No matches found.'
    },
  })
}

// ─── List Directory Tool ─────────────────────────────────────────────────────

export function listDirTool(opts: Pick<ToolOptions, 'cwd'>) {
  return tool({
    description: 'List files and directories at a given path. Returns names with [dir] or [file] markers.',
    parameters: z.object({
      path: z.string().describe('Directory path (relative to project root)'),
    }),
    execute: async (args) => {
      const dirPath = safePath(opts.cwd, args.path)
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true })
        if (entries.length === 0) return '(empty directory)'
        return entries
          .map(e => `${e.isDirectory() ? '[dir]  ' : '[file] '}${e.name}`)
          .join('\n')
      } catch (err) {
        return `Error listing directory: ${(err as Error).message}`
      }
    },
  })
}

// ─── Patch Tool ──────────────────────────────────────────────────────────────

export function patchTool(opts: ToolOptions) {
  return tool({
    description: 'Apply a unified diff patch to modify a file. Use standard unified diff format with @@ hunk headers.',
    parameters: z.object({
      path: z.string().describe('File path to patch (relative to project root)'),
      patch: z.string().describe('Unified diff content (with @@ hunk headers, - for removed lines, + for added lines)'),
    }),
    execute: async (args) => {
      const filePath = safePath(opts.cwd, args.path)

      if (!await requestApproval(opts.approve, `Patch file: ${args.path}`, args.patch)) {
        return 'Tool call denied by user.'
      }

      try {
        // Verify file exists
        try {
          await fs.access(filePath)
        } catch {
          return `Error: File not found: ${args.path}`
        }

        // Apply patch using git apply
        const patchContent = `--- a/${args.path}\n+++ b/${args.path}\n${args.patch}`
        const { stdout, stderr, exitCode } = await exec(
          `echo ${JSON.stringify(patchContent)} | git apply --stat && echo ${JSON.stringify(patchContent)} | git apply`,
          { cwd: opts.cwd, timeout: DEFAULT_TIMEOUT },
        )

        if (exitCode !== 0) {
          return `Patch failed: ${stderr || stdout}`
        }

        return `Patch applied to ${args.path}`
      } catch (err) {
        return `Error applying patch: ${(err as Error).message}`
      }
    },
  })
}

// ─── Plan Tool ───────────────────────────────────────────────────────────────

export function planTool(opts: Pick<ToolOptions, 'onPlanUpdate'>) {
  return tool({
    description: 'Create or update a structured plan (checklist) for the current task. Use this to organize multi-step work and track progress.',
    parameters: z.object({
      plan: z.array(z.object({
        step: z.string().describe('Description of this step'),
        status: z.enum(['pending', 'in_progress', 'completed']).describe('Current status'),
      })).describe('The full list of steps. Only one step should be in_progress at a time.'),
      explanation: z.string().optional().describe('Brief explanation of why the plan is being created or updated'),
    }),
    execute: async (args) => {
      opts.onPlanUpdate?.(args.plan, args.explanation)
      return 'Plan updated.'
    },
  })
}

// ─── Goal Tool ───────────────────────────────────────────────────────────────

export function goalTool(opts: Pick<ToolOptions, 'onGoalUpdate' | 'getGoal'>) {
  return tool({
    description: 'Manage the current objective. Use "create" to set a goal, "get" to check status, "update" to mark complete/paused.',
    parameters: z.object({
      action: z.enum(['create', 'get', 'update']).describe('"create" a new goal, "get" current goal, or "update" its status'),
      objective: z.string().optional().describe('Required for "create" — the concrete objective'),
      token_budget: z.number().optional().describe('Optional token budget for "create"'),
      status: z.enum(['active', 'paused', 'complete']).optional().describe('Required for "update" — new status'),
    }),
    execute: async (args) => {
      switch (args.action) {
        case 'create': {
          if (!args.objective) return 'Error: "objective" is required for create.'
          const existing = opts.getGoal?.()
          if (existing && existing.status === 'active') {
            return 'Error: A goal already exists. Use "update" to complete it before creating a new one.'
          }
          const goal: GoalState = {
            objective: args.objective,
            status: 'active',
            tokenBudget: args.token_budget,
            tokensUsed: 0,
          }
          opts.onGoalUpdate?.(goal)
          return JSON.stringify({ goal, remaining_tokens: goal.tokenBudget ?? null })
        }
        case 'get': {
          const goal = opts.getGoal?.()
          if (!goal) return 'No active goal.'
          const remaining = goal.tokenBudget != null ? Math.max(0, goal.tokenBudget - (goal.tokensUsed ?? 0)) : null
          return JSON.stringify({ goal, remaining_tokens: remaining })
        }
        case 'update': {
          if (!args.status) return 'Error: "status" is required for update.'
          const goal = opts.getGoal?.()
          if (!goal) return 'Error: No goal to update.'
          const updated: GoalState = { ...goal, status: args.status }
          opts.onGoalUpdate?.(updated)
          return JSON.stringify({ goal: updated })
        }
        default:
          return 'Error: Unknown action.'
      }
    },
  })
}

// ─── User Input Tool ─────────────────────────────────────────────────────────

export function userInputTool(opts: Pick<ToolOptions, 'requestInput'>) {
  return tool({
    description: 'Ask the user a question and wait for their response. Use for decisions, clarifications, or preferences that you cannot determine on your own.',
    parameters: z.object({
      questions: z.array(z.object({
        id: z.string().describe('Unique identifier for this question'),
        header: z.string().describe('Short label (e.g. "Approach", "Framework")'),
        question: z.string().describe('The full question to ask'),
        options: z.array(z.object({
          label: z.string(),
          description: z.string(),
        })).optional().describe('Optional multiple-choice options'),
      })).describe('One or more questions to ask the user'),
    }),
    execute: async (args) => {
      if (!opts.requestInput) return 'Error: User input not available in this context.'
      const answers = await opts.requestInput(args.questions)
      return JSON.stringify(answers)
    },
  })
}

// ─── View Image Tool ─────────────────────────────────────────────────────────

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
}

export function viewImageTool(opts: Pick<ToolOptions, 'cwd'>) {
  return tool({
    description: 'Load an image file from disk and return it as a data URL for analysis. Supports PNG, JPG, GIF, WebP, SVG.',
    parameters: z.object({
      path: z.string().describe('Image file path (relative to project root)'),
    }),
    execute: async (args) => {
      const filePath = safePath(opts.cwd, args.path)
      try {
        const ext = path.extname(filePath).toLowerCase()
        const mime = MIME_TYPES[ext]
        if (!mime) return `Error: Unsupported image format: ${ext}`

        const data = await fs.readFile(filePath)
        const base64 = data.toString('base64')
        return `data:${mime};base64,${base64}`
      } catch (err) {
        return `Error reading image: ${(err as Error).message}`
      }
    },
  })
}
