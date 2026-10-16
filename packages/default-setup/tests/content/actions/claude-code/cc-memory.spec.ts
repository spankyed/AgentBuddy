import { describe, expect, it, vi } from 'vitest';
import { mockService } from '@apackdev/testing/harness';
import { services, type Services } from '#generated/services.ts';
import { repository } from '#generated/repository.ts';
import { action } from '../../../../src/content/actions/claude-code/cc-command.ts';
const dialog = { files: [{ kind: 'other', label: 'Rule fixture', path: '/project/.claude/rules/fixture.md', exists: true }, { kind: 'user', label: 'User instructions', path: '/home/CLAUDE.md', exists: false }], folders: [], auto_memory: { enabled: false, toggleable: false, status: 'off' }, auto_dream: { shown: false, enabled: false, toggleable: true, status: 'off', detail: '' } };
describe('cc-memory native presentation', () => {
 it('shows native file kinds/existence and availability without advertising hidden dream state', async () => {
  mockService<Services, 'cli'>('cli', { claudeCode: { getMemoryDialog: vi.fn().mockResolvedValue(dialog) } as never });
  const result = await action({ command: 'cc-memory' }, services, {} as never, 'memory-flow');
  expect(result.text).toContain('Rule fixture [other]'); expect(result.text).toContain('User instructions [user] (missing)');
  expect(result.text).toContain('Auto-memory: off (unavailable)'); expect(result.text).not.toContain('Auto-dream'); expect(result.data).toEqual(dialog);
 });
 it('routes native discovery to the thread project override', async () => {
  const { id } = repository.threadCommands.create({ topic: 'Memory', instructions: '', tags: [] });
  repository.threadCommands.update(id, { context: { claudeCode: { cwd: '/saved', cwdOverride: '/selected' } } });
  const read = vi.fn().mockResolvedValue(dialog);
  mockService<Services, 'cli'>('cli', { claudeCode: { getHandle: vi.fn(), getMemoryDialog: read } as never });
  mockService<Services, 'chat'>('chat', { sendBlockMessage: vi.fn() });
  await action({ command: 'cc-memory', threadId: id }, services, {} as never, 'memory-flow'); expect(read).toHaveBeenCalledWith({ cwd: '/selected' });
 });
 it('shows native errors instead of claiming no memory files exist', async () => {
  mockService<Services, 'cli'>('cli', { claudeCode: { getMemoryDialog: vi.fn().mockRejectedValue(new Error('native unavailable')) } as never });
  await expect(action({ command: 'cc-memory' }, services, {} as never, 'memory-flow')).resolves.toMatchObject({ text: 'cc-memory failed: native unavailable' });
 });
 it('reads the matching live native dialog and avoids a new process', async () => {
  const read = vi.fn().mockResolvedValue(dialog), fresh = vi.fn();
  mockService<Services, 'cli'>('cli', { claudeCode: { getHandle: vi.fn(() => ({ getMemoryDialog: read })), getConversation: vi.fn(() => ({ owner: { sessionCwd: '/selected' } })), getWorkingDir: vi.fn(() => '/selected'), getMemoryDialog: fresh } as never });
  mockService<Services, 'chat'>('chat', { sendBlockMessage: vi.fn() });
  await action({ command: 'cc-memory', threadId: 'fixture-thread' }, services, {} as never, 'memory-flow');
  expect(read).toHaveBeenCalledOnce(); expect(fresh).not.toHaveBeenCalled();
 });
 it('avoids a retained catalog from another project', async () => {
  const read = vi.fn(), fresh = vi.fn().mockResolvedValue(dialog);
  mockService<Services, 'cli'>('cli', { claudeCode: { getHandle: vi.fn(() => ({ getMemoryDialog: read })), getConversation: vi.fn(() => ({ owner: { sessionCwd: '/other' } })), getWorkingDir: vi.fn(() => '/selected'), getMemoryDialog: fresh } as never });
  mockService<Services, 'chat'>('chat', { sendBlockMessage: vi.fn() });
  await action({ command: 'cc-memory', threadId: 'fixture-thread' }, services, {} as never, 'memory-flow');
  expect(read).not.toHaveBeenCalled(); expect(fresh).toHaveBeenCalledWith(undefined);
 });

});
