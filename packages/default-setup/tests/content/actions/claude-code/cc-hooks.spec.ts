import { describe, expect, it, vi } from 'vitest';
import { mockService } from '@apackdev/testing/harness';
import { services, type Services } from '#generated/services.ts';
import { repository } from '#generated/repository.ts';
import { action } from '../../../../src/content/actions/claude-code/cc-command.ts';
const row = { event: 'PreToolUse', matcher: 'Read', source: 'userSettings', sourceLabel: 'User', type: 'http', displayText: 'https://example.invalid/hook', commandText: 'URL', contentLabel: 'URL', disabled: true, editable: { matcher: 'Read', config: { type: 'http', headers: { Authorization: '' } }, headersRedacted: true } };
const listing = { events: [], eventCatalog: [{ name: 'PreToolUse', summary: 'Fixture', supportsMatcher: true }], hooks: [row, { ...row, source: 'flagSettings', editable: undefined }], policy: { disabledByPolicy: false, managedOnly: false, pluginOnly: false, allDisabled: true, policyHookCount: 0 }, bareMode: { exitHint: 'restart without --bare' } };
describe('cc-hooks presentation and native scope', () => {
 it('distinguishes disabled/editable rows, masked values and the event catalog', async () => {
  mockService<Services, 'cli'>('cli', { claudeCode: { getHooksListing: vi.fn().mockResolvedValue(listing) } as never });
  const result = await action({ command: 'cc-hooks' }, services, {} as never, 'hooks-flow');
  expect(result.text).toContain('1 available events; 2 configured hooks'); expect(result.text).toContain('userSettings; disabled; file-editable'); expect(result.text).toContain('flagSettings; disabled; read-only'); expect(result.text).toContain('HTTP header values hidden'); expect(result.text).toContain('restart without --bare'); expect(result.data).toEqual(listing); expect(result.text).toContain('Events: PreToolUse (matcher)');
 });
 it('scopes fresh discovery to a selected thread project', async () => {
  const { id } = repository.threadCommands.create({ topic: 'Hooks', instructions: '', tags: [] }); repository.threadCommands.update(id, { context: { claudeCode: { cwd: '/saved', cwdOverride: '/selected' } } });
  const read = vi.fn().mockResolvedValue(listing); mockService<Services, 'cli'>('cli', { claudeCode: { getHandle: vi.fn(), getHooksListing: read } as never }); mockService<Services, 'chat'>('chat', { sendBlockMessage: vi.fn() });
  await action({ command: 'cc-hooks', threadId: id }, services, {} as never, 'hooks-flow'); expect(read).toHaveBeenCalledWith({ cwd: '/selected' });
 });
 it.each([true, false])('uses a retained catalog only for the selected project (matching=%s)', async matching => {
  const live = vi.fn().mockResolvedValue(listing), fresh = vi.fn().mockResolvedValue(listing);
  mockService<Services, 'cli'>('cli', { claudeCode: { getHandle: vi.fn(() => ({ getHooksListing: live })), getConversation: vi.fn(() => ({ owner: { sessionCwd: matching ? '/selected' : '/other' } })), getWorkingDir: vi.fn(() => '/selected'), getHooksListing: fresh } as never }); mockService<Services, 'chat'>('chat', { sendBlockMessage: vi.fn() });
  const result = await action({ command: 'cc-hooks', threadId: 'fixture-thread' }, services, {} as never, 'hooks-flow');
  expect(live).toHaveBeenCalledTimes(matching ? 1 : 0); expect(fresh).toHaveBeenCalledTimes(matching ? 0 : 1); expect(result.text).toContain(matching ? 'current conversation' : 'new process for selected project');
 });
 it('surfaces native errors and refuses edit syntax without discovery', async () => {
  const read = vi.fn().mockRejectedValue(new Error('native unavailable')); mockService<Services, 'cli'>('cli', { claudeCode: { getHooksListing: read } as never });
  expect(await action({ command: 'cc-hooks', text: 'edit' }, services, {} as never, 'hooks-flow')).toMatchObject({ text: expect.stringContaining('Usage:') }); expect(read).not.toHaveBeenCalled();
  expect(await action({ command: 'cc-hooks' }, services, {} as never, 'hooks-flow')).toMatchObject({ text: 'cc-hooks failed: native unavailable' });
 });
});

const editText = 'apply ' + JSON.stringify({ op: 'remove', source: 'userSettings', event: 'PreToolUse', target: { event: 'PreToolUse', matcher: 'Read', hook: { type: 'http', url: 'https://example.invalid/hook', headers: { Authorization: '' } } } });
it('refuses busy and mismatched-project edits before writing', async () => {
 const write = vi.fn();
 mockService<Services, 'chat'>('chat', { sendBlockMessage: vi.fn() });
 mockService<Services, 'cli'>('cli', { claudeCode: { isConversationBusy: vi.fn(() => true), editHook: write } as never });
 expect(await action({ command: 'cc-hooks', text: editText, threadId: 'fixture' }, services, {} as never, 'hooks-flow')).toMatchObject({ text: expect.stringContaining('become idle') });
 mockService<Services, 'cli'>('cli', { claudeCode: { isConversationBusy: vi.fn(() => false), getHandle: vi.fn(() => ({})), getConversation: vi.fn(() => ({ owner: { sessionCwd: '/other' } })), getWorkingDir: vi.fn(() => '/selected'), editHook: write } as never });
 expect(await action({ command: 'cc-hooks', text: editText, threadId: 'fixture' }, services, {} as never, 'hooks-flow')).toMatchObject({ text: expect.stringContaining('does not match') }); expect(write).not.toHaveBeenCalled();
});
it('preserves native refusal codes and does not close the incumbent on a refused edit', async () => {
 const close = vi.fn(), read = vi.fn();
 mockService<Services, 'cli'>('cli', { claudeCode: { editHook: vi.fn().mockResolvedValue({ ok: false, code: 'target_ambiguous', error: 'Native target changed' }), getHooksListing: read, closeIdleConversation: close } as never });
 expect(await action({ command: 'cc-hooks', text: editText }, services, {} as never, 'hooks-flow')).toMatchObject({ text: 'Native hook edit refused [target_ambiguous]: Native target changed' }); expect(close).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled();
});
it.each(['closed', 'busy', 'read-failed'])('distinguishes saved edits from reload/readback outcomes (%s)', async outcome => {
 const close = vi.fn().mockResolvedValue(outcome !== 'busy'), fresh = outcome === 'read-failed' ? vi.fn().mockRejectedValue(new Error('catalog unavailable')) : vi.fn().mockResolvedValue(listing);
 mockService<Services, 'chat'>('chat', { sendBlockMessage: vi.fn() });
 mockService<Services, 'cli'>('cli', { claudeCode: { isConversationBusy: vi.fn(() => false), getHandle: vi.fn(() => ({ getHooksListing: vi.fn() })), getConversation: vi.fn(() => ({ owner: { sessionCwd: '/selected' } })), getWorkingDir: vi.fn(() => '/selected'), editHook: vi.fn().mockResolvedValue({ ok: true }), closeIdleConversation: close, getHooksListing: fresh } as never });
 const result = await action({ command: 'cc-hooks', text: editText, threadId: 'fixture' }, services, {} as never, 'hooks-flow'); expect(result.text).toContain('Saved the hook edit.'); expect(close).toHaveBeenCalledWith('fixture');
 if (outcome === 'busy') { expect(result.text).toContain('could not be closed'); expect(fresh).not.toHaveBeenCalled(); }
 else if (outcome === 'read-failed') expect(result.text).toContain('reading the new native catalog failed');
 else expect(result.text).toContain('Closed the idle native process');
});

it.skipIf(!process.env.CLAUDE_HOOKS_TEST_BINARY)('routes an actual native edit through the source command, closes the idle process and reads fresh configuration', async () => {
 const { mkdtemp, mkdir, writeFile, readFile, realpath } = await import('node:fs/promises'); const { join } = await import('node:path'); const { tmpdir } = await import('node:os');
 const { query } = await import('#features/code/be/services/claude-code/query.ts'); const { editHook, getHooksListing } = await import('#features/code/be/services/claude-code/hook-management.ts');
 const cwd = await realpath(await mkdtemp(join(tmpdir(), 'cc-hooks-native-'))), home = join(cwd, 'home'), config = join(home, '.claude'); await mkdir(config, { recursive: true }); const path = join(config, 'settings.json'); await writeFile(path, JSON.stringify({ language: 'preserve' }));
 const options = { cwd, cliPath: process.env.CLAUDE_HOOKS_TEST_BINARY, env: { PATH: process.env.PATH, HOME: home, CLAUDE_CONFIG_DIR: config, DISABLE_AUTOUPDATER: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' }, signal: AbortSignal.timeout(15000) };
 const handle = await query({ ...options, tools: [], strictMcpConfig: true, keepStdinOpen: true, noSessionPersistence: true }); await handle.initialized;
 const close = vi.fn(async () => { await handle.close(); return true; });
 mockService<Services, 'chat'>('chat', { sendBlockMessage: vi.fn() });
 mockService<Services, 'cli'>('cli', { claudeCode: { getWorkingDir: () => cwd, getHandle: () => handle, getConversation: () => ({ owner: { sessionCwd: cwd } }), isConversationBusy: () => false, closeIdleConversation: close, editHook: (edit: Parameters<typeof editHook>[0]) => editHook(edit, options), getHooksListing: () => getHooksListing(options) } as never });
 try {
  const result = await action({ command: 'cc-hooks', threadId: 'native-hook-thread', text: 'apply ' + JSON.stringify({ op: 'add', source: 'userSettings', event: 'PreToolUse', matcher: 'Read', hook: { type: 'command', command: '/usr/bin/true' } }) }, services, {} as never, 'hooks-flow');
  expect(result.text).toContain('Saved the hook edit.'); expect(result.text).toContain('Closed the idle native process'); expect(result.text).toContain('new process for selected project'); expect(close).toHaveBeenCalledOnce(); expect(result.data.hooks).toEqual(expect.arrayContaining([expect.objectContaining({ source: 'userSettings', event: 'PreToolUse', matcher: 'Read' })]));
  expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ language: 'preserve', hooks: { PreToolUse: [{ matcher: 'Read', hooks: [{ type: 'command', command: '/usr/bin/true' }] }] } });
 } finally { await handle.close(); }
}, 20000);
