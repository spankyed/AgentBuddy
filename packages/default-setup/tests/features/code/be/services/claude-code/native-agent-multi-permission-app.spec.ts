import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { importCompiledContent } from '@apackdev/sdk/utils';
import { importFlows, mockService, startApp } from '@apackdev/testing/harness';
import { services, type Services } from '#generated/services.ts';
import { repository } from '#generated/repository.ts';
import { claudeCode } from '#features/code/be/services/claude-code/index.ts';
import * as runner from '#features/code/be/services/claude-code/runner.ts';
import * as store from '#features/code/be/services/claude-code/handle-store.ts';
import { ControlRequestLineSchema, type StreamLine } from '#features/code/be/services/claude-code/types.ts';
import type { ToolActivityEntry } from '../../../../../../src/content/actions/claude-code/_helpers/tool-activity-types.ts';
import { getClaudeState } from '../../../../../../src/content/actions/claude-code/_helpers/thread-context.ts';

const executable = process.env.CLAUDE_RESEARCH_EXECUTABLE;
const workspace = process.env.CLAUDE_RESEARCH_WORKSPACE;
const endpoint = process.env.CLAUDE_RESEARCH_MODEL_URL;

it.skipIf(!executable || !workspace || !endpoint)('compiled app preserves both simultaneous child permission requests', async () => {
    expect(process.env.HOME).toBe(workspace);
    expect(new URL(endpoint!).hostname).toBe('127.0.0.1');
    for (const key of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN']) expect(process.env[key]).toBeUndefined();
    vi.stubEnv('ANTHROPIC_BASE_URL', endpoint!); vi.stubEnv('CLAUDE_CODE_SIMPLE', undefined); vi.stubEnv('CLAUDE_CODE_COORDINATOR_MODE', undefined);
    const cwd = workspace!;
    await mkdir(cwd, { recursive: true }); await mkdir(join(workspace!, '.claude', 'agents'), { recursive: true });
    await writeFile(join(workspace!, '.claude', 'settings.json'), JSON.stringify({ apiKeyHelper: '/usr/bin/printf research-fixture-key', permissions: { allow: ['Agent'] } }));
    await writeFile(join(workspace!, '.claude', 'agents', 'multi-permission-fixture.md'), '---\nname: multi-permission-fixture\ndescription: Disposable local permission worker\ntools: [Bash]\nmaxTurns: 2\n---\nNativeMultiChildSystem. Use the provided fixture tool once, then return the fixed marker.\n');
    services.settings.set({ kind: 'feature', featureRef: 'default-setup/code' }, ['cliPaths', 'claude-code'], executable!);
    const spawning = vi.spyOn(runner, 'spawnStream');
    const originalQuery = claudeCode.query.bind(claudeCode);
    vi.spyOn(claudeCode, 'query').mockImplementation(options => originalQuery({ ...options, signal: AbortSignal.timeout(30000) }));
    const events: StreamLine[] = [];
    const original = services.cli.claudeCode;
    const opened = vi.fn<Services['cli']['claudeCode']['openConversation']>((...args) => original.openConversation(...args).then(owner => {
      owner.subscribe(event => events.push(event)); return owner;
    }));
    mockService<Services, 'cli'>('cli', { claudeCode: { ...original, openConversation: opened } });
    const compiledDir = resolve(import.meta.dirname, '../../../../../../dist/runtime/content');
    importCompiledContent({ compiledDir, include: { flows: new Set(), library: new Set(), notes: new Set(), settings: new Set() } });
    const flows = JSON.parse(readFileSync(join(compiledDir, 'flows.content.json'), 'utf8'));
    importFlows({ 'Claude Code': { ...flows['Claude Code'], root: true } });
    const app = await startApp({ systems: ['brain'] }); await app.runFlow('Claude Code');
    const { id } = repository.threadCommands.create({ topic: 'Concurrent native child permissions', instructions: '', tags: [] });
    repository.threadCommands.update(id, { context: { claudeCode: { cwd, permissionMode: 'default' } } });
    const state = () => getClaudeState(services, id);
    try {
      const first = repository.chatCommands.addMessage({ threadId: id, sender: 'user', text: 'Launch both disposable permission workers.' });
      await app.runFlow('Claude Code', { event: 'user.message', data: { threadId: id, text: first.text, messageId: first.id, mode: 'Claude Code', phase: 'Edit' } });
      await vi.waitFor(() => expect(state()?.turns).toBe(1), { timeout: 15000 });
      await vi.waitFor(() => expect(store.isConversationBusy(id)).toBe(false));
      const owner = store.getConversation(id)!.owner;
      await vi.waitFor(() => expect(events.filter(event => event.type === 'control_request')).toHaveLength(2), { timeout: 15000 });
      // The correlated control round trip also lets the event consumer drain both native frames.
      await owner.handle.getMcpStatus();
      const requests = events.flatMap(event => event.type === 'control_request' ? [ControlRequestLineSchema.parse(event)] : []);
      expect(state()?.pendingControlRequest?.requestId).toBe(requests[0]?.request_id);
      const approvalMessages = () => repository.chatQueries.threadData(id)?.messages?.filter(message => message.blocks?.some(block => block.type === 'approval')) ?? [];
      expect(approvalMessages()).toHaveLength(1);
      for (const request of requests) {
        await vi.waitFor(() => expect(state()?.pendingControlRequest?.requestId).toBe(request.request_id));
        const pending = state()!.pendingControlRequest!;
        const approved = request.request.tool_use_id === 'multi_child_a';
        await app.runFlow('Claude Code', { event: 'interactive.message.response', data: { threadId: id, messageId: pending.approvalMessageId, response: { approved } } });
      }
      await vi.waitFor(() => expect(events.filter(event => event.type === 'system' && event.subtype === 'task_notification')).toHaveLength(2), { timeout: 15000 });
      await vi.waitFor(() => {
        const last = events.filter(event => event.type === 'result').at(-1);
        expect(last).toBeDefined(); expect(owner.handle.hasPendingBackgroundTasks(last!)).toBe(false);
      }, { timeout: 15000 });
      await vi.waitFor(() => expect(store.isConversationBusy(id)).toBe(false));
      expect(state()?.pendingControlRequest).toBeUndefined(); expect(store.getConversation(id)?.owner).toBe(owner);
      expect(owner.closing).toBe(false); await owner.handle.getMcpStatus();
      expect(await readFile(join(cwd, 'multi-child-a.txt'), 'utf8')).toBe('MultiChildA');
      await expect(readFile(join(cwd, 'multi-child-b.txt'))).rejects.toHaveProperty('code', 'ENOENT');
      expect(approvalMessages()).toHaveLength(2);
      const results = events.flatMap(event => event.type === 'result' ? [event] : []);
      expect(results.length).toBeGreaterThanOrEqual(2); expect(state()?.turns).toBe(results.length); expect(results.every(event => event.subtype === 'success')).toBe(true);
      expect(Math.abs(state()!.totalCostUsd! - Number(results.at(-1)!.total_cost_usd))).toBeLessThan(1e-12);
      expect(state()?.toolCallCount).toBe(4);
      const assistants = repository.chatQueries.threadData(id)?.messages?.filter(message => message.sender === 'assistant') ?? [];
      expect(assistants.some(message => /Worker[AB]Complete/.test(message.text ?? ''))).toBe(false);
      for (const marker of ['WorkerAComplete','WorkerBComplete']) expect(JSON.stringify(assistants.flatMap(message => message.blocks ?? []))).toContain(marker);
      const entries = assistants.flatMap(message => (message.blocks ?? []).flatMap(block =>
        block.type === 'tool-activity' && Array.isArray(block.props?.entries) ? block.props.entries as ToolActivityEntry[] : []));
      for (const [id, own, other] of [['multi_agent_a','WorkerAComplete','WorkerBComplete'], ['multi_agent_b','WorkerBComplete','WorkerAComplete']]) {
        const output = entries.find(entry => entry.id === id)?.details?.output;
        expect(output).toContain(own); expect(output).not.toContain(other);
      }
      expect(opened).toHaveBeenCalledOnce(); expect(spawning).toHaveBeenCalledOnce();
      expect(events.some(event => event.type === 'system' && event.subtype === 'task_notification' && event.status === 'completed')).toBe(true);
      expect(await store.closeIdleConversation(id)).toBe(true);
      const finalResults = events.flatMap(event => event.type === 'result' ? [event] : []);
      await vi.waitFor(() => expect(state()?.turns).toBe(finalResults.length));
      expect(Math.abs(state()!.totalCostUsd! - Number(finalResults.at(-1)!.total_cost_usd))).toBeLessThan(1e-12);
      await writeFile(join(workspace!, 'multi-app-evidence.json'), JSON.stringify({ compiledFlow: true, productionLaunchService: true, twoNativePendingRequests: true, serializedApprovals: true, bothDecisionsRouted: true, sameNativeProcess: true, allowedAOnly: true, bothChildOutputsRetained: true, childOutputsCorrelated: true, parentProseSeparated: true, exactCostAccounting: true, toolCallCount: state()?.toolCallCount, nativeResults: finalResults.length, appTurns: state()?.turns, closed: true }, null, 2));
    } finally { await writeFile(join(workspace!, 'multi-app-events.json'), JSON.stringify(events, null, 2)); store.killAllHandles(); }
  }, 45000);
