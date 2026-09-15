/**
 * Tools for coding agents, as AI SDK `tool()`s for `services.inference.createAgent`.
 *
 * Paths resolve against `cwd` after following symlinks; a path that ends up outside it is rejected.
 * Tools that change files or run commands don't ask for approval themselves: the agent's
 * `toolApproval` (see `codingApproval` in `./index`) decides, so a caller can stop for the user's decision.
 */

import { tool } from 'ai'
import { applyPatch } from 'diff'
import { z } from 'zod'
import { spawn } from 'child_process'
import { rgPath } from '@vscode/ripgrep'
import * as fs from 'fs/promises'
import * as path from 'path'

const MAX_OUTPUT = 100_000
const DEFAULT_TIMEOUT = 30_000

export interface PlanStep {
  step: string
  status: 'pending' | 'in_progress' | 'completed'
}

export interface GoalState {
  objective: string
  status: 'active' | 'paused' | 'complete'
  tokenBudget?: number
  tokensUsed?: number
}

export interface UserInputQuestion {
  id: string
  header: string
  question: string
  options?: Array<{ label: string; description: string }>
}

export interface ToolOptions {
  /** Directory the tools work in: every path resolves against it */
  cwd: string
  /** Called when the model updates its plan */
  onPlanUpdate?: (plan: PlanStep[], explanation?: string) => void
  /** Called when the model creates or updates its goal */
  onGoalUpdate?: (goal: GoalState) => void
  /** The current goal, for the goal tool's `get` */
  getGoal?: () => GoalState | null
  /** Asks the user questions mid-turn and resolves with answers by question id */
  requestInput?: (questions: UserInputQuestion[]) => Promise<Record<string, string>>
}

/** `relativePath` resolved in `cwd`, following symlinks; throws when it leads outside `cwd` */
async function safePath(cwd: string, relativePath: string): Promise<{ root: string; target: string }> {
  const root = await fs.realpath(cwd)
  const resolved = path.resolve(root, relativePath)
  // A path that doesn't exist yet (a file to write) resolves through its deepest existing ancestor
  let existing = resolved
  let real: string | undefined
  while (real === undefined) {
    try {
      real = await fs.realpath(existing)
    } catch {
      existing = path.dirname(existing)
    }
  }
  const target = path.join(real, path.relative(existing, resolved))
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error(`Path escapes working directory: ${relativePath}`)
  }
  return { root, target }
}

function truncate(output: string): string {
  return output.length <= MAX_OUTPUT ? output : `${output.slice(0, MAX_OUTPUT)}\n\n[output truncated at ${MAX_OUTPUT} chars]`
}

interface ExecResult { stdout: string; stderr: string; exitCode: number }

function run(file: string, args: string[], opts: { cwd: string; timeout: number }): Promise<ExecResult> {
  return new Promise((resolve) => {
    // No stdin: commands can't wait on input, and ripgrep given no path searches cwd instead of stdin
    const child = spawn(file, args, { cwd: opts.cwd, timeout: opts.timeout, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, TERM: 'dumb' } })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf-8').on('data', (chunk: string) => { if (stdout.length <= MAX_OUTPUT) stdout += chunk })
    child.stderr.setEncoding('utf-8').on('data', (chunk: string) => { if (stderr.length <= MAX_OUTPUT) stderr += chunk })
    child.on('error', (error) => { stderr += error.message })
    child.on('close', (code) => resolve({ stdout: truncate(stdout), stderr: truncate(stderr), exitCode: code ?? 1 }))
  })
}

export function shellTool(opts: Pick<ToolOptions, 'cwd'>) {
  return tool({
    description: 'Execute a shell command and return stdout/stderr. Use for running programs, scripts, git commands, package managers, etc.',
    inputSchema: z.object({
      command: z.string().describe('Shell command to execute'),
      workdir: z.string().optional().describe('Working directory (relative to project root)'),
      timeout_ms: z.number().optional().describe('Timeout in milliseconds (default 30000)'),
    }),
    execute: async ({ command, workdir, timeout_ms }) => {
      const { target: cwd } = await safePath(opts.cwd, workdir ?? '.')
      const [shell, args] = process.platform === 'win32' ? ['cmd.exe', ['/c', command]] : ['/bin/sh', ['-c', command]]
      const { stdout, stderr, exitCode } = await run(shell, args, { cwd, timeout: timeout_ms ?? DEFAULT_TIMEOUT })
      const parts = [stdout, stderr && `[stderr]\n${stderr}`, exitCode !== 0 && `[exit code: ${exitCode}]`].filter(Boolean)
      return parts.join('\n') || '(no output)'
    },
  })
}

export function readFileTool(opts: Pick<ToolOptions, 'cwd'>) {
  return tool({
    description: 'Read a file and return its contents. Supports offset/limit for reading portions of large files.',
    inputSchema: z.object({
      path: z.string().describe('File path (relative to project root)'),
      offset: z.number().optional().describe('Line number to start reading from (0-based)'),
      limit: z.number().optional().describe('Maximum number of lines to read'),
    }),
    execute: async ({ path: filePath, offset, limit }) => {
      let content = await fs.readFile((await safePath(opts.cwd, filePath)).target, 'utf-8')
      if (offset !== undefined || limit !== undefined) {
        const start = offset ?? 0
        content = content.split('\n').slice(start, limit !== undefined ? start + limit : undefined).join('\n')
      }
      return truncate(content) || '(empty file)'
    },
  })
}

export function writeFileTool(opts: Pick<ToolOptions, 'cwd'>) {
  return tool({
    description: 'Write content to a file. Creates the file and any parent directories if they don\'t exist. Overwrites existing content.',
    inputSchema: z.object({
      path: z.string().describe('File path (relative to project root)'),
      content: z.string().describe('Content to write'),
    }),
    execute: async ({ path: filePath, content }) => {
      const { target } = await safePath(opts.cwd, filePath)
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, content, 'utf-8')
      return `File written: ${filePath} (${content.length} chars)`
    },
  })
}

export function grepTool(opts: Pick<ToolOptions, 'cwd'>) {
  return tool({
    description: 'Search file contents using ripgrep (regex). Returns matching lines with file paths and line numbers.',
    inputSchema: z.object({
      pattern: z.string().describe('Regex pattern to search for'),
      path: z.string().optional().describe('Directory or file to search in (relative to project root, defaults to root)'),
      include: z.string().optional().describe('Glob pattern to filter files (e.g. "*.ts", "*.py")'),
    }),
    execute: async ({ pattern, path: searchPath, include }) => {
      const { root, target } = await safePath(opts.cwd, searchPath ?? '.')
      const args = ['--line-number', '--with-filename', '--color=never', ...(include ? ['-g', include] : []), '--', pattern]
      // Searching the root names no path, so ripgrep prints paths without a ./ prefix
      if (target !== root) args.push(path.relative(root, target))
      const { stdout, stderr, exitCode } = await run(rgPath, args, { cwd: root, timeout: DEFAULT_TIMEOUT })
      if (exitCode === 1 && !stderr) return 'No matches found.'
      if (exitCode !== 0) throw new Error(`ripgrep: ${stderr || `exit code ${exitCode}`}`)
      return stdout || 'No matches found.'
    },
  })
}

export function listDirTool(opts: Pick<ToolOptions, 'cwd'>) {
  return tool({
    description: 'List files and directories at a given path. Returns names with [dir] or [file] markers.',
    inputSchema: z.object({
      path: z.string().describe('Directory path (relative to project root)'),
    }),
    execute: async ({ path: dirPath }) => {
      const entries = await fs.readdir((await safePath(opts.cwd, dirPath)).target, { withFileTypes: true })
      return entries.map((e) => `${e.isDirectory() ? '[dir]  ' : '[file] '}${e.name}`).join('\n') || '(empty directory)'
    },
  })
}

export function patchTool(opts: Pick<ToolOptions, 'cwd'>) {
  return tool({
    description: 'Apply a unified diff patch to modify a file. Use standard unified diff format with @@ hunk headers.',
    inputSchema: z.object({
      path: z.string().describe('File path to patch (relative to project root)'),
      patch: z.string().describe('Unified diff content (with @@ hunk headers, - for removed lines, + for added lines)'),
    }),
    execute: async ({ path: filePath, patch }) => {
      const { target } = await safePath(opts.cwd, filePath)
      const source = await fs.readFile(target, 'utf-8')
      const patched = applyPatch(source, patch.startsWith('---') ? patch : `--- a/${filePath}\n+++ b/${filePath}\n${patch}`)
      if (patched === false) throw new Error(`Patch doesn't apply to ${filePath}: its context lines don't match the file`)
      await fs.writeFile(target, patched, 'utf-8')
      return `Patch applied to ${filePath}`
    },
  })
}

export function planTool(opts: Pick<ToolOptions, 'onPlanUpdate'>) {
  return tool({
    description: 'Create or update a structured plan (checklist) for the current task. Use this to organize multi-step work and track progress.',
    inputSchema: z.object({
      plan: z.array(z.object({
        step: z.string().describe('Description of this step'),
        status: z.enum(['pending', 'in_progress', 'completed']).describe('Current status'),
      })).describe('The full list of steps. Only one step should be in_progress at a time.'),
      explanation: z.string().optional().describe('Brief explanation of why the plan is being created or updated'),
    }),
    execute: async ({ plan, explanation }) => {
      opts.onPlanUpdate?.(plan, explanation)
      return 'Plan updated.'
    },
  })
}

export function goalTool(opts: Pick<ToolOptions, 'onGoalUpdate' | 'getGoal'>) {
  return tool({
    description: 'Manage the current objective. Use "create" to set a goal, "get" to check status, "update" to mark complete/paused.',
    inputSchema: z.object({
      action: z.enum(['create', 'get', 'update']).describe('"create" a new goal, "get" current goal, or "update" its status'),
      objective: z.string().optional().describe('Required for "create": the concrete objective'),
      token_budget: z.number().optional().describe('Optional token budget for "create"'),
      status: z.enum(['active', 'paused', 'complete']).optional().describe('Required for "update": new status'),
    }),
    execute: async ({ action, objective, token_budget, status }) => {
      const current = opts.getGoal?.() ?? null
      switch (action) {
        case 'create': {
          if (!objective) throw new Error('"objective" is required for create')
          if (current?.status === 'active') throw new Error('A goal is already active: "update" it to complete before creating a new one')
          const goal: GoalState = { objective, status: 'active', tokenBudget: token_budget, tokensUsed: 0 }
          opts.onGoalUpdate?.(goal)
          return { goal, remaining_tokens: goal.tokenBudget ?? null }
        }
        case 'get': {
          if (!current) return 'No active goal.'
          const remaining = current.tokenBudget != null ? Math.max(0, current.tokenBudget - (current.tokensUsed ?? 0)) : null
          return { goal: current, remaining_tokens: remaining }
        }
        case 'update': {
          if (!status) throw new Error('"status" is required for update')
          if (!current) throw new Error('No goal to update')
          const goal: GoalState = { ...current, status }
          opts.onGoalUpdate?.(goal)
          return { goal }
        }
      }
    },
  })
}

export function userInputTool(opts: Required<Pick<ToolOptions, 'requestInput'>>) {
  return tool({
    description: 'Ask the user a question and wait for their response. Use for decisions, clarifications, or preferences that you cannot determine on your own.',
    inputSchema: z.object({
      questions: z.array(z.object({
        id: z.string().describe('Unique identifier for this question'),
        header: z.string().describe('Short label (e.g. "Approach", "Framework")'),
        question: z.string().describe('The full question to ask'),
        options: z.array(z.object({ label: z.string(), description: z.string() })).optional().describe('Optional multiple-choice options'),
      })).describe('One or more questions to ask the user'),
    }),
    execute: ({ questions }) => opts.requestInput(questions),
  })
}

const IMAGE_TYPES: Record<string, string> = {
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
    description: 'Load an image file from disk so you can look at it. Supports PNG, JPG, GIF, WebP, SVG, BMP and ICO.',
    inputSchema: z.object({
      path: z.string().describe('Image file path (relative to project root)'),
    }),
    execute: async ({ path: imagePath }) => {
      const { target } = await safePath(opts.cwd, imagePath)
      const mediaType = IMAGE_TYPES[path.extname(target).toLowerCase()]
      if (!mediaType) throw new Error(`Unsupported image format: ${path.extname(target) || imagePath}`)
      return { mediaType, data: (await fs.readFile(target)).toString('base64') }
    },
    // The model sees the image itself, not its base64 text
    toModelOutput: ({ output }) => ({
      type: 'content',
      value: [{ type: 'file', mediaType: output.mediaType, data: { type: 'data', data: output.data } }],
    }),
  })
}
