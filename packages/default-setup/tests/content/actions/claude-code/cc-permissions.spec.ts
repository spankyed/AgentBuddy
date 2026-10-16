import { describe, expect, it, vi } from 'vitest';
import { mockService } from '@apackdev/testing/harness';
import { services, type Services } from '#generated/services.ts';
import { repository } from '#generated/repository.ts';
import { action } from '../../../../src/content/actions/claude-code/cc-command.ts';
const catalog = { state: { originalCwd: '/selected', managedOnly: true, rules: [{ behavior: 'deny', source: 'policySettings', editability: 'readonly', notInEffect: true, rule: 'Bash' }], workspaceDirectories: [{ path: '/extra', source: 'session' }], errors: [{ file: '/fixture/settings.json', message: 'Fixture error' }] } };
describe('cc-permissions native presentation', () => {
 it('retains exact rule identity and displays editability, inactive state and source errors', async () => {
  mockService<Services, 'cli'>('cli', { claudeCode: { getPermissionRules: vi.fn().mockResolvedValue(catalog) } as never });
  const result = await action({ command: 'cc-permissions' }, services, {} as never, 'permission-flow');
  expect(result.text).toContain('deny [policySettings; readonly; not in effect] Bash'); expect(result.text).toContain('Managed-only rules: yes'); expect(result.text).toContain('Directory [session]: /extra'); expect(result.text).toContain('Settings error: /fixture/settings.json: Fixture error'); expect(result.data).toEqual(catalog);
 });
 it('uses the thread override for fresh discovery', async () => {
  const { id } = repository.threadCommands.create({ topic: 'Permissions', instructions: '', tags: [] }); repository.threadCommands.update(id, { context: { claudeCode: { cwd: '/saved', cwdOverride: '/selected' } } });
  const read = vi.fn().mockResolvedValue(catalog); mockService<Services, 'cli'>('cli', { claudeCode: { getHandle: vi.fn(), getPermissionRules: read } as never }); mockService<Services, 'chat'>('chat', { sendBlockMessage: vi.fn() });
  await action({ command: 'cc-permissions', threadId: id }, services, {} as never, 'permission-flow'); expect(read).toHaveBeenCalledWith({ cwd: '/selected' });
 });
 it('shows native failures instead of an empty rule list', async () => {
  mockService<Services, 'cli'>('cli', { claudeCode: { getPermissionRules: vi.fn().mockRejectedValue(new Error('native unavailable')) } as never });
  await expect(action({ command: 'cc-permissions' }, services, {} as never, 'permission-flow')).resolves.toMatchObject({ text: 'cc-permissions failed: native unavailable' });
 });
 it('reads and labels the matching running conversation', async () => {
  const read = vi.fn().mockResolvedValue(catalog), fresh = vi.fn();
  mockService<Services, 'cli'>('cli', { claudeCode: { getHandle: vi.fn(() => ({ getPermissionRules: read })), getConversation: vi.fn(() => ({ owner: { sessionCwd: '/selected' } })), getWorkingDir: vi.fn(() => '/selected'), getPermissionRules: fresh } as never }); mockService<Services, 'chat'>('chat', { sendBlockMessage: vi.fn() });
  const result = await action({ command: 'cc-permissions', threadId: 'fixture-thread' }, services, {} as never, 'permission-flow'); expect(result.text).toContain('Running conversation permissions'); expect(read).toHaveBeenCalledOnce(); expect(fresh).not.toHaveBeenCalled();
 });
 it('avoids a different-project process and labels fresh configuration scope', async () => {
  const read = vi.fn(), fresh = vi.fn().mockResolvedValue(catalog);
  mockService<Services, 'cli'>('cli', { claudeCode: { getHandle: vi.fn(() => ({ getPermissionRules: read })), getConversation: vi.fn(() => ({ owner: { sessionCwd: '/other' } })), getWorkingDir: vi.fn(() => '/selected'), getPermissionRules: fresh } as never }); mockService<Services, 'chat'>('chat', { sendBlockMessage: vi.fn() });
  const result = await action({ command: 'cc-permissions', threadId: 'fixture-thread' }, services, {} as never, 'permission-flow'); expect(result.text).toContain('Project configuration permissions'); expect(read).not.toHaveBeenCalled(); expect(fresh).toHaveBeenCalledWith(undefined);
 });

});
