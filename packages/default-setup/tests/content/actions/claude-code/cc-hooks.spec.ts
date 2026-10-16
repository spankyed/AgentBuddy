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
