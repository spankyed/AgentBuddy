import { getConfigurationSummary } from '#features/code/be/services/claude-code/configuration.ts';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { mockService } from '@apackdev/testing/harness';
import { services, type Services } from '#generated/services.ts';
import { repository } from '#generated/repository.ts';
import { query } from '#features/code/be/services/claude-code/query.ts';
import * as store from '#features/code/be/services/claude-code/handle-store.ts';
import type { ClaudeConversationTurn } from '#features/code/be/services/claude-code/conversation.ts';
import type { StreamLine } from '#features/code/be/services/claude-code/types.ts';
import { consumeConversationTurn } from '../../../../src/content/actions/claude-code/_helpers/stream-consumer.ts';
import { action as command } from '../../../../src/content/actions/claude-code/cc-command.ts';
import { chatService } from '#features/threads/be/services/chat.ts';
vi.mock('../../../../src/content/actions/claude-code/_helpers/context-usage.ts', () => ({ refreshThreadContextUsage: vi.fn(async () => {}) }));

const executable = process.env.CLAUDE_RESEARCH_EXECUTABLE, workspace = process.env.CLAUDE_RESEARCH_WORKSPACE, endpoint = process.env.CLAUDE_RESEARCH_MODEL_URL;
it.skipIf(!executable || !workspace || !endpoint)('actual native saved effort changes stay separate from retained-turn effort', async () => {
  expect(process.env.HOME).toBe(workspace); expect(new URL(endpoint!).hostname).toBe('127.0.0.1');
  for (const key of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN']) expect(process.env[key]).toBeUndefined();
  const cwd = join(workspace!, 'project'), temporary = join(workspace!, 'tmp'); await mkdir(cwd); await mkdir(temporary, { mode: 0o700 });
  const { id } = repository.threadCommands.create({ topic: 'Native effort preference', instructions: '', tags: [] });
  repository.threadCommands.update(id, { context: { claudeCode: { cwd, permissionMode: 'default' } } });
  mockService<Services, 'cli'>('cli', { claudeCode: { getConversation: store.getConversation, getHandle: store.getHandle, isCurrentTurn: store.isCurrentTurn, storeHandle: store.storeHandle, clearHandle: store.clearHandle } as never });
  const updates = vi.fn(chatService.updateMessageState);
  mockService<Services, 'chat'>('chat', { ...chatService, updateMessageState: updates });
  mockService<Services, 'logger'>('logger', { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() });
  mockService<Services, 'threads'>('threads', { updateChatState: vi.fn() });
  const emitted = vi.fn();
  mockService<Services, 'emitter'>('emitter', { sendToSystem: emitted, broadcastToPlugin: vi.fn() });
  const consume = (turn: ClaudeConversationTurn) => consumeConversationTurn(turn, { services, threadId: id, text: '', sessionCwd: cwd });
  const settingsPath = join(workspace!, '.claude', 'settings.json');
  await writeFile(settingsPath, JSON.stringify({apiKeyHelper:'/usr/bin/printf research-fixture-key',model:'sonnet',language:'preserve'}));
  const environment={HOME:workspace,CLAUDE_CONFIG_DIR:join(workspace!,'.claude'),ANTHROPIC_BASE_URL:endpoint,DISABLE_AUTOUPDATER:'1',CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1'};
  const native=await query({cwd,cliPath:executable,env:environment,permissionMode:'default',settingSources:['user'],model:'sonnet',strictMcpConfig:true,keepStdinOpen:true,surfaceControlRequests:true,noSessionPersistence:true,maxTurns:4,signal:AbortSignal.timeout(25000)});
  const writes=vi.spyOn(native,'requestEffortPreference');
  const owner=await store.openConversation(id,'effort-preference-native',async()=>native,consume),events:StreamLine[]=[];owner.subscribe(event=>events.push(event));
  try{
    owner.start('Fixed synthetic effort preference seed.',consume);
    await vi.waitFor(()=>expect(events.filter(event=>event.type==='result')).toHaveLength(1),{timeout:10000});await vi.waitFor(()=>expect(owner.busy).toBe(false));
    for(const level of ['low','xhigh']){
      const result=await command({command:'cc-config',text:`save-effort ${level}`,threadId:id},services,{} as never,'effort-control');
      expect(result.text).toContain(`applied model key: ${level}`);expect(result.text).toContain('reports applied effort: medium');
      const saved=JSON.parse(await readFile(settingsPath,'utf8'));expect(saved.modelSettings['claude-sonnet-5-5'].effortLevel).toBe(level);expect(saved.language).toBe('preserve');
    }
    expect((await command({command:'cc-config',text:'save-effort max',threadId:id},services,{} as never,'effort-control')).text).toContain('without saving');expect(writes).toHaveBeenCalledTimes(2);
    owner.start('Fixed synthetic effort preference follow-up.',consume);
    await vi.waitFor(()=>expect(events.filter(event=>event.type==='result')).toHaveLength(2),{timeout:10000});await vi.waitFor(()=>expect(owner.busy).toBe(false));
    expect(events.every(event=>event.type!=='result'||(event.subtype==='success'&&event.is_error!==true))).toBe(true);await owner.close();
    const fresh=await getConfigurationSummary({cwd,cliPath:executable,env:environment});expect(fresh.perModelEffort).toBe('xhigh');expect(fresh.appliedEffort).toBe('xhigh');
    await writeFile(join(workspace!,'effort-preference-app-evidence.json'),JSON.stringify({sourceConsumer:true,nativeOwner:true,nativeWriter:true,commandsPresented:true,settingsPreserved:true,closed:true,successfulModelResults:true,retainedReportedEffort:'medium',freshAppliedEffort:'xhigh',maxNotSent:true,qualification:'Actual query/owner/source consumer and native user effort writer; private Sonnet profile only. Compiled/mounted, policy/provider and normalized legacy model-key variants remain open.'},null,2));
  }finally{store.killAllHandles();}
},15000);
