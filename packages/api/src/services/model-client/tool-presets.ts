/**
 * Tool presets — pre-assembled tool sets for common agent patterns.
 */

import type { ToolSet } from 'ai'
import {
  shellTool, readFileTool, writeFileTool, grepTool, listDirTool, patchTool,
  planTool, goalTool, userInputTool, viewImageTool,
} from './agent-tools'
import { webSearchTool } from './tools'
import type { ToolOptions } from './types'

/**
 * Standard tool set for coding agents.
 *
 * Includes file operations, shell execution, search, planning, goals,
 * image viewing, and web search. Mutating tools (shell, write, patch)
 * use the provided `approve` callback. User input tool is only included
 * if `requestInput` is provided.
 */
export function codingAgentTools(opts: ToolOptions): ToolSet {
  return {
    shell: shellTool(opts),
    read_file: readFileTool(opts),
    write_file: writeFileTool(opts),
    grep: grepTool(opts),
    list_dir: listDirTool(opts),
    patch: patchTool(opts),
    plan: planTool(opts),
    goal: goalTool(opts),
    view_image: viewImageTool(opts),
    web_search: webSearchTool(),
    ...(opts.requestInput && { user_input: userInputTool(opts) }),
  }
}
