/**
 * Agent tools service: tool sets for `services.inference.createAgent`.
 *
 * ```ts
 * const agent = await services.inference.createAgent({
 *   model: 'anthropic:claude-opus-5',
 *   tools: services.agentTools.coding({ cwd }),
 *   toolApproval: services.agentTools.codingApproval,
 * })
 * let messages: ModelMessage[] = [{ role: 'user', content: 'Fix the failing test' }]
 * let result = await agent.generate({ messages })
 * // The agent stops at a call that needs approval; answer it and continue
 * messages = [...messages, ...result.response.messages, services.agentTools.approvalResponse(result, true)]
 * result = await agent.generate({ messages })
 * ```
 */

import type { ModelMessage, ToolApprovalConfiguration, ToolApprovalRequestOutput, ToolSet } from 'ai'
import {
  goalTool, grepTool, listDirTool, patchTool, planTool, readFileTool, shellTool, userInputTool, viewImageTool, writeFileTool,
  type ToolOptions,
} from './tools'

export type { GoalState, PlanStep, ToolOptions, UserInputQuestion } from './tools'

/**
 * Tools for a coding agent: files, shell, search, patches, plan, goal and images, plus `user_input`
 * when `requestInput` is given
 */
export function coding(opts: ToolOptions) {
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
    ...(opts.requestInput && { user_input: userInputTool({ requestInput: opts.requestInput }) }),
  }
}

/** The coding tools that change files or run commands wait for the user's approval */
export const codingApproval = {
  shell: 'user-approval',
  write_file: 'user-approval',
  patch: 'user-approval',
} satisfies ToolApprovalConfiguration<ReturnType<typeof coding>, unknown>

/** The calls a result stopped at, waiting for approval */
export function pendingApprovals<TOOLS extends ToolSet>(result: { content: ReadonlyArray<{ type: string }> }): ToolApprovalRequestOutput<TOOLS>[] {
  return result.content.filter((part): part is ToolApprovalRequestOutput<TOOLS> => part.type === 'tool-approval-request')
}

/**
 * The tool message answering a result's pending approvals: `approved` for all of them, or per request.
 * Continue the agent with the conversation so far, the result's `response.messages` and this message.
 */
export function approvalResponse<TOOLS extends ToolSet>(
  result: { content: ReadonlyArray<{ type: string }> },
  approved: boolean | ((request: ToolApprovalRequestOutput<TOOLS>) => boolean),
): ModelMessage {
  return {
    role: 'tool',
    content: pendingApprovals<TOOLS>(result).map((request) => ({
      type: 'tool-approval-response',
      approvalId: request.approvalId,
      approved: typeof approved === 'boolean' ? approved : approved(request),
    })),
  }
}

export const agentToolsService = {
  coding,
  codingApproval,
  pendingApprovals,
  approvalResponse,
  shell: shellTool,
  readFile: readFileTool,
  writeFile: writeFileTool,
  grep: grepTool,
  listDir: listDirTool,
  patch: patchTool,
  plan: planTool,
  goal: goalTool,
  userInput: userInputTool,
  viewImage: viewImageTool,
}
