import { describe, expect, it, vi } from 'vitest';
import { mockService } from '@apackdev/testing/harness';
import { services, type Services } from '#generated/services.ts';
import { repository } from '#generated/repository.ts';
import { action } from '../../../../src/content/actions/claude-code/cc-command.ts';
const catalog = { state: { originalCwd: '/selected', managedOnly: true, rules: [{ behavior: 'deny', source: 'policySettings', editability: 'readonly', notInEffect: true, rule: 'Bash' }], workspaceDirectories: [{ path: '/extra', source: 'session' }], errors: [{ file: '/fixture/settings.json', message: 'Fixture error' }] } };
describe('cc-permissions native presentation', () => {
 it('retains exact rule identity and displays editability, inactive state and source errors', async () => {
  mockService<Services, 'cli'>('cli', { claudeCode: { getPermissionRules: vi.fn().mockResolvedValue(catalog) } as never });
  const result = await action({ command: 'cc-permissions', text: 'start' }, services, {} as never, 'permission-flow');
  expect(result.text).toContain('deny [policySettings; readonly; not in effect] Bash'); expect(result.text).toContain('Managed-only rules: yes'); expect(result.text).toContain('Directory [session]: /extra'); expect(result.text).toContain('Settings error: /fixture/settings.json: Fixture error'); expect(result.data).toEqual(catalog);
 });
 it('uses the thread override for fresh discovery', async () => {
  const { id } = repository.threadCommands.create({ topic: 'Permissions', instructions: '', tags: [] }); repository.threadCommands.update(id, { context: { claudeCode: { cwd: '/saved', cwdOverride: '/selected' } } });
  const read = vi.fn().mockResolvedValue(catalog); mockService<Services, 'cli'>('cli', { claudeCode: { getHandle: vi.fn(), getPermissionRules: read } as never }); mockService<Services, 'chat'>('chat', { sendBlockMessage: vi.fn() });
  await action({ command: 'cc-permissions', text: 'start', threadId: id }, services, {} as never, 'permission-flow'); expect(read).toHaveBeenCalledWith({ cwd: '/selected' });
 });
 it('shows native failures instead of an empty rule list', async () => {
  mockService<Services, 'cli'>('cli', { claudeCode: { getPermissionRules: vi.fn().mockRejectedValue(new Error('native unavailable')) } as never });
  await expect(action({ command: 'cc-permissions', text: 'start' }, services, {} as never, 'permission-flow')).resolves.toMatchObject({ text: 'cc-permissions failed: native unavailable' });
 });
 it('reads and labels the matching running conversation', async () => {
  const read = vi.fn().mockResolvedValue(catalog), fresh = vi.fn();
  mockService<Services, 'cli'>('cli', { claudeCode: { getHandle: vi.fn(() => ({ getPermissionRules: read })), getConversation: vi.fn(() => ({ owner: { sessionCwd: '/selected' } })), getWorkingDir: vi.fn(() => '/selected'), getPermissionRules: fresh } as never }); mockService<Services, 'chat'>('chat', { sendBlockMessage: vi.fn() });
  const result = await action({ command: 'cc-permissions', text: 'start', threadId: 'fixture-thread' }, services, {} as never, 'permission-flow'); expect(result.text).toContain('Running conversation permissions'); expect(read).toHaveBeenCalledOnce(); expect(fresh).not.toHaveBeenCalled();
 });
 it('avoids a different-project process and labels fresh configuration scope', async () => {
  const read = vi.fn(), fresh = vi.fn().mockResolvedValue(catalog);
  mockService<Services, 'cli'>('cli', { claudeCode: { getHandle: vi.fn(() => ({ getPermissionRules: read })), getConversation: vi.fn(() => ({ owner: { sessionCwd: '/other' } })), getWorkingDir: vi.fn(() => '/selected'), getPermissionRules: fresh } as never }); mockService<Services, 'chat'>('chat', { sendBlockMessage: vi.fn() });
  const result = await action({ command: 'cc-permissions', text: 'start', threadId: 'fixture-thread' }, services, {} as never, 'permission-flow'); expect(result.text).toContain('Project configuration permissions'); expect(read).not.toHaveBeenCalled(); expect(fresh).toHaveBeenCalledWith(undefined);
 });

});


describe('cc-permissions native editing', () => {
 it('preserves internal rule whitespace, shows native canonical spellings/warnings and refreshes a matching process', async () => {
  const write = vi.fn().mockResolvedValue({ stored: ['Bash'], warnings: ['Tool-wide rule'] }), refresh = vi.fn().mockResolvedValue(catalog);
  mockService<Services, 'cli'>('cli', { claudeCode: { editPermissionRules: write, getHandle: vi.fn(() => ({ refreshPermissionRules: refresh })), getConversation: vi.fn(() => ({ owner: { sessionCwd: '/selected' } })), getWorkingDir: vi.fn(() => '/selected'), isConversationBusy: vi.fn(() => false) } as never }); mockService<Services, 'chat'>('chat', { sendBlockMessage: vi.fn() });
  const result = await action({ command: 'cc-permissions', text: 'start add deny userSettings Bash(echo  fixture)', threadId: 'fixture-thread' }, services, {} as never, 'permission-flow');
  expect(write).toHaveBeenCalledWith({ op: 'add', rules: ['Bash(echo  fixture)'], behavior: 'deny', destination: 'userSettings' }, undefined); expect(refresh).toHaveBeenCalledOnce(); expect(result.text).toContain('Saved userSettings permission change.'); expect(result.text).toContain('Native stored rules: Bash'); expect(result.text).toContain('Native warning: Tool-wide rule'); expect(result.text).toContain('Running conversation permissions');
 });
 it('uses exact removal and fresh project readback when no process exists', async () => {
  const { id } = repository.threadCommands.create({ topic: 'Permission edit', instructions: '', tags: [] }); repository.threadCommands.update(id, { context: { claudeCode: { cwd: '/saved', cwdOverride: '/selected' } } });
  const write = vi.fn().mockResolvedValue({ stored: [], warnings: [] }), fresh = vi.fn().mockResolvedValue(catalog);
  mockService<Services, 'cli'>('cli', { claudeCode: { editPermissionRules: write, getHandle: vi.fn(), getPermissionRules: fresh, isConversationBusy: vi.fn(() => false) } as never }); mockService<Services, 'chat'>('chat', { sendBlockMessage: vi.fn() });
  const result = await action({ command: 'cc-permissions', text: 'start remove ask localSettings Read(./a  b.txt)', threadId: id }, services, {} as never, 'permission-flow');
  expect(write).toHaveBeenCalledWith({ op: 'remove', rule: 'Read(./a  b.txt)', behavior: 'ask', source: 'localSettings' }, { cwd: '/selected' }); expect(fresh).toHaveBeenCalledWith({ cwd: '/selected' }); expect(result.text).toContain('Project configuration permissions');
 });
 it('refuses busy conversations and different-project processes before writing', async () => {
  const write = vi.fn(); const busy = vi.fn(() => true);
  mockService<Services, 'cli'>('cli', { claudeCode: { editPermissionRules: write, isConversationBusy: busy, getHandle: vi.fn(() => ({})), getConversation: vi.fn(() => ({ owner: { sessionCwd: '/other' } })), getWorkingDir: vi.fn(() => '/selected') } as never }); mockService<Services, 'chat'>('chat', { sendBlockMessage: vi.fn() });
  const run = () => action({ command: 'cc-permissions', text: 'start add deny userSettings Bash', threadId: 'fixture-thread' }, services, {} as never, 'permission-flow');
  expect((await run()).text).toContain('become idle'); busy.mockReturnValue(false); expect((await run()).text).toContain('does not match'); expect(write).not.toHaveBeenCalled();
 });
 it('reports a saved change separately when native refresh fails', async () => {
  const write = vi.fn().mockResolvedValue({ stored: ['Bash'], warnings: [] });
  mockService<Services, 'cli'>('cli', { claudeCode: { editPermissionRules: write, getPermissionRules: vi.fn().mockRejectedValue(new Error('refresh unavailable')) } as never });
  const result = await action({ command: 'cc-permissions', text: 'start add deny userSettings Bash' }, services, {} as never, 'permission-flow');
  expect(result.text).toContain('Saved userSettings permission change.'); expect(result.text).toContain('refresh unavailable'); expect(result.text).toContain('Running permission state is unverified'); expect(write).toHaveBeenCalledOnce();
 });
 it('retains native writer refusals without trying to refresh or write a file directly', async () => {
  const fresh = vi.fn(); mockService<Services, 'cli'>('cli', { claudeCode: { editPermissionRules: vi.fn().mockRejectedValue(new Error('Native source disabled')), getPermissionRules: fresh } as never });
  const result = await action({ command: 'cc-permissions', text: 'start add allow projectSettings Read' }, services, {} as never, 'permission-flow'); expect(result.text).toBe('cc-permissions failed: Native source disabled'); expect(fresh).not.toHaveBeenCalled();
 });
 it('rejects invalid source/behavior syntax before accessing services', async () => {
  const result = await action({ command: 'cc-permissions', text: 'start add deny policySettings Bash' }, services, {} as never, 'permission-flow'); expect(result.text).toContain('Usage:');
 });
});
