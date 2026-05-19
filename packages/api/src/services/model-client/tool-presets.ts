/**
 * Tool presets — pre-assembled tool sets for common agent patterns.
 */

import type { ToolSet } from 'ai'
import { shellTool, readFileTool, writeFileTool, grepTool, listDirTool, patchTool } from './agent-tools'
import { webSearchTool } from './tools'
import type { ApproveFn } from './types'

/**
 * Standard tool set for coding agents.
 *
 * Includes file operations, shell execution, search, and web search.
 * Mutating tools (shell, write, patch) use the provided `approve` callback.
 */
export function codingAgentTools(opts: {
  cwd: string
  approve?: ApproveFn
}): ToolSet {
  return {
    shell: shellTool({ cwd: opts.cwd, approve: opts.approve }),
    read_file: readFileTool({ cwd: opts.cwd }),
    write_file: writeFileTool({ cwd: opts.cwd, approve: opts.approve }),
    grep: grepTool({ cwd: opts.cwd }),
    list_dir: listDirTool({ cwd: opts.cwd }),
    patch: patchTool({ cwd: opts.cwd, approve: opts.approve }),
    web_search: webSearchTool(),
  }
}
