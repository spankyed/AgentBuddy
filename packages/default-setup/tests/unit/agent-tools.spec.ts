// services.agentTools gives services.inference's agents coding tools: an agent on a scripted model reads, searches,
// patches and runs commands in a directory, stopping for approval before the tools that change things
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ModelMessage } from 'ai'
import { mockInference } from '@abuddy/testing/harness'
import { services as hostServices } from '@abuddy/sdk/services'
import type { Services } from '@/__generated__/services'

const services = hostServices as unknown as Services
const call = (toolName: string, input: unknown) => ({ toolCalls: [{ toolName, input }] })
/** The value of each tool result the model received in its last call */
const lastToolResults = (inference: ReturnType<typeof mockInference>) => {
  const last = inference.calls.at(-1)
  return last?.kind === 'text' ? last.messages.filter((m) => m.role === 'tool').map((m) => JSON.parse(m.text).value) : []
}

let cwd: string
beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-tools-'))
  await fs.writeFile(path.join(cwd, 'milk.txt'), 'buy milk\nbuy bread\n')
})
afterEach(() => fs.rm(cwd, { recursive: true, force: true }))

/** Runs one tool through an agent on a scripted model, and returns what the model got back */
async function runTool(toolName: string, input: unknown, opts: Parameters<Services['agentTools']['coding']>[0] = { cwd }) {
  const inference = mockInference((c) => c.messages.some((m) => m.role === 'tool') ? 'done' : call(toolName, input))
  const agent = await services.inference.createAgent({ model: 'anthropic:claude-opus-5', tools: services.agentTools.coding(opts) })
  await agent.generate({ prompt: 'go' })
  return lastToolResults(inference)
}

describe('agentTools', () => {
  it('reads, lists and searches files in its directory', async () => {
    expect(await runTool('read_file', { path: 'milk.txt', offset: 1, limit: 1 })).toEqual(['buy bread'])
    expect(await runTool('list_dir', { path: '.' })).toEqual(['[file] milk.txt'])
    expect(await runTool('grep', { pattern: 'bread' })).toEqual(['milk.txt:2:buy bread\n'])
    expect(await runTool('grep', { pattern: 'cheese' })).toEqual(['No matches found.'])
  })

  it("rejects paths outside its directory, through .. or a symlink", async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-tools-outside-'))
    await fs.writeFile(path.join(outside, 'secret.txt'), 'secret')
    await fs.symlink(outside, path.join(cwd, 'link'))
    try {
      expect(await runTool('read_file', { path: '../secret.txt' })).toEqual([expect.stringContaining('Path escapes working directory')])
      expect(await runTool('read_file', { path: 'link/secret.txt' })).toEqual([expect.stringContaining('Path escapes working directory')])
      expect(await runTool('write_file', { path: 'link/new.txt', content: 'x' })).toEqual([expect.stringContaining('Path escapes working directory')])
    } finally {
      await fs.rm(outside, { recursive: true, force: true })
    }
  })

  it('writes files, patches them and runs commands', async () => {
    expect(await runTool('write_file', { path: 'notes/todo.txt', content: 'one\ntwo\n' })).toEqual(['File written: notes/todo.txt (8 chars)'])
    expect(await runTool('patch', { path: 'notes/todo.txt', patch: '@@ -1,2 +1,2 @@\n one\n-two\n+three\n' })).toEqual(['Patch applied to notes/todo.txt'])
    expect(await fs.readFile(path.join(cwd, 'notes/todo.txt'), 'utf-8')).toBe('one\nthree\n')
    expect(await runTool('patch', { path: 'notes/todo.txt', patch: '@@ -1,2 +1,2 @@\n one\n-missing\n+x\n' })).toEqual([expect.stringContaining("Patch doesn't apply")])
    expect(await runTool('shell', { command: 'cat todo.txt; exit 3', workdir: 'notes' })).toEqual(['one\nthree\n\n[exit code: 3]'])
  })

  it('reports plan and goal updates, and asks the user when it can', async () => {
    const plans: unknown[] = []
    let goal: unknown = null
    const opts = { cwd, onPlanUpdate: (plan: unknown) => plans.push(plan), onGoalUpdate: (g: unknown) => { goal = g }, getGoal: () => goal as never, requestInput: async () => ({ approach: 'tests first' }) }

    await runTool('plan', { plan: [{ step: 'Write test', status: 'in_progress' }] }, opts)
    expect(plans).toEqual([[{ step: 'Write test', status: 'in_progress' }]])
    await runTool('goal', { action: 'create', objective: 'Ship it', token_budget: 100 }, opts)
    expect(goal).toEqual({ objective: 'Ship it', status: 'active', tokenBudget: 100, tokensUsed: 0 })
    expect(await runTool('user_input', { questions: [{ id: 'approach', header: 'Approach', question: 'How?' }] }, opts)).toEqual([{ approach: 'tests first' }])
    expect(services.agentTools.coding({ cwd })).not.toHaveProperty('user_input')
  })

  it('stops before a tool that needs approval, and runs it once approved', async () => {
    const inference = mockInference((c) => c.messages.some((m) => m.role === 'tool') ? 'Wrote it' : call('write_file', { path: 'out.txt', content: 'hi' }))
    const agent = await services.inference.createAgent({
      model: 'anthropic:claude-opus-5',
      tools: services.agentTools.coding({ cwd }),
      toolApproval: services.agentTools.codingApproval,
    })

    let messages: ModelMessage[] = [{ role: 'user', content: 'Write out.txt' }]
    let result = await agent.generate({ messages })
    expect(services.agentTools.pendingApprovals(result)).toEqual([expect.objectContaining({ toolCall: expect.objectContaining({ toolName: 'write_file' }) })])
    await expect(fs.access(path.join(cwd, 'out.txt'))).rejects.toThrow()

    messages = [...messages, ...result.response.messages, services.agentTools.approvalResponse(result, true)]
    result = await agent.generate({ messages })

    expect(await fs.readFile(path.join(cwd, 'out.txt'), 'utf-8')).toBe('hi')
    expect(result.text).toBe('Wrote it')
    expect(inference.calls).toHaveLength(2)
  })

  it("doesn't run a denied tool", async () => {
    mockInference((c) => c.messages.some((m) => m.role === 'tool') ? 'Okay, not running it' : call('shell', { command: 'touch ran.txt' }))
    const agent = await services.inference.createAgent({ model: 'openai:gpt-5', tools: services.agentTools.coding({ cwd }), toolApproval: services.agentTools.codingApproval })

    const messages: ModelMessage[] = [{ role: 'user', content: 'Run it' }]
    const first = await agent.generate({ messages })
    const result = await agent.generate({ messages: [...messages, ...first.response.messages, services.agentTools.approvalResponse(first, false)] })

    expect(result.text).toBe('Okay, not running it')
    await expect(fs.access(path.join(cwd, 'ran.txt'))).rejects.toThrow()
  })

  it('shows the model an image as a file, not base64 text', async () => {
    const png = Buffer.from('89504e470d0a1a0a', 'hex')
    await fs.writeFile(path.join(cwd, 'pic.png'), png)
    mockInference('unused')
    const tools = services.agentTools.coding({ cwd })
    const output = await tools.view_image.execute!({ path: 'pic.png' }, { toolCallId: 't', messages: [] } as never)
    expect(tools.view_image.toModelOutput!({ toolCallId: 't', input: { path: 'pic.png' }, output } as never)).toEqual({
      type: 'content',
      value: [{ type: 'file', mediaType: 'image/png', data: { type: 'data', data: png.toString('base64') } }],
    })
  })
})
