import { describe, expect, it, vi } from 'vitest';
import { mockService } from '@apackdev/testing/harness';
import { repository } from '#generated/repository.ts';
import { services, type Services } from '#generated/services.ts';
import { action } from '../../../../src/content/actions/claude-code/cc-command.ts';

describe('cc-skills native state presentation', () => {
 it('shows provenance, effective state, author locks and hidden command visibility', async () => {
  const skills = [{ name: 'fixture', display_name: 'Native fixture', source: 'project', state: 'user-invocable-only', locked_by: 'author', advertised: false }];
  mockService<Services, 'cli'>('cli', { claudeCode: { listSkills: vi.fn().mockResolvedValue(skills) } as never });
  const result = await action({ command: 'cc-skills' }, services, {} as never, 'skills-flow');
  expect(result).toMatchObject({ text: 'Native fixture [project] — user-invocable-only; locked by author; hidden from command suggestions', data: skills });
 });
 it('uses the thread directory override before its saved cwd', async () => {
  const { id } = repository.threadCommands.create({ topic: 'Skills', instructions: '', tags: [] });
  repository.threadCommands.update(id, { context: { claudeCode: { cwd: '/saved-project', cwdOverride: '/thread-project' } } });
  const listSkills = vi.fn().mockResolvedValue([]);
  mockService<Services, 'cli'>('cli', { claudeCode: { listSkills } as never });
  mockService<Services, 'chat'>('chat', { sendBlockMessage: vi.fn() });
  await action({ command: 'cc-skills', threadId: id }, services, {} as never, 'skills-flow');
  expect(listSkills).toHaveBeenCalledWith({ cwd: '/thread-project' });
  repository.threadCommands.update(id, { context: { claudeCode: { cwd: '/saved-project' } } });
  await action({ command: 'cc-skills', threadId: id }, services, {} as never, 'skills-flow');
  expect(listSkills).toHaveBeenLastCalledWith({ cwd: '/saved-project' });
 });
 it('shows native errors instead of claiming there are no installed Skills', async () => {
  mockService<Services, 'cli'>('cli', { claudeCode: { listSkills: vi.fn().mockRejectedValue(new Error('native discovery unavailable')) } as never });
  await expect(action({ command: 'cc-skills' }, services, {} as never, 'skills-flow')).resolves.toMatchObject({ text: 'cc-skills failed: native discovery unavailable' });
 });
});
