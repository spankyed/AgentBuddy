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
  mockService<Services, 'cli'>('cli', { claudeCode: { listSkills, getHandle: vi.fn() } as never });
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
 it('writes the selected native entry, forwards handles, refreshes and displays the new state', async () => {
  const before = { name: 'fixture', display_name: 'Fixture', source: 'project', state: 'on', advertised: true, handles: { unqualified_name: 'fixture' } };
  const after = { ...before, state: 'off', advertised: false };
  const handle = { getSkillsDialog: vi.fn().mockResolvedValueOnce({ skills: [before] }).mockResolvedValue({ skills: [after] }), reloadSkills: vi.fn().mockResolvedValue(undefined) };
  const editSkill = vi.fn().mockResolvedValue({ changed: true });
  mockService<Services, 'cli'>('cli', { claudeCode: { getHandle: vi.fn(() => handle), getConversation: vi.fn(() => ({ owner: { sessionCwd: '/fixture' } })), getWorkingDir: vi.fn(() => '/fixture'), isConversationBusy: vi.fn(() => false), editSkill } as never });
  mockService<Services, 'chat'>('chat', { sendBlockMessage: vi.fn() });
  const result = await action({ command: 'cc-skills', text: 'set fixture off', threadId: 'fixture-thread' }, services, {} as never, 'skills-flow');
  expect(editSkill).toHaveBeenCalledWith({ name: 'fixture', state: 'off', handles: before.handles }, undefined);
  expect(handle.reloadSkills).toHaveBeenCalledOnce();
  expect(result.text).toContain('Updated fixture.'); expect(result.text).toContain('off');
 });
 it('refuses busy edits before discovery or persistence', async () => {
  const editSkill = vi.fn(), listSkills = vi.fn();
  mockService<Services, 'cli'>('cli', { claudeCode: { isConversationBusy: vi.fn(() => true), editSkill, listSkills } as never });
  mockService<Services, 'chat'>('chat', { sendBlockMessage: vi.fn() });
  const result = await action({ command: 'cc-skills', text: 'set fixture off', threadId: 'fixture-thread' }, services, {} as never, 'skills-flow');
  expect(result.text).toContain('become idle'); expect(editSkill).not.toHaveBeenCalled(); expect(listSkills).not.toHaveBeenCalled();
 });
 it('distinguishes a persisted edit from a failed live refresh', async () => {
  const handle = { getSkillsDialog: vi.fn().mockResolvedValue({ skills: [{ name: 'fixture', handles: {} }] }), reloadSkills: vi.fn().mockRejectedValue(new Error('process closed')) };
  mockService<Services, 'cli'>('cli', { claudeCode: { getHandle: vi.fn(() => handle), getConversation: vi.fn(() => ({ owner: { sessionCwd: '/fixture' } })), getWorkingDir: vi.fn(() => '/fixture'), isConversationBusy: vi.fn(() => false), editSkill: vi.fn().mockResolvedValue({ changed: true }) } as never });
  mockService<Services, 'chat'>('chat', { sendBlockMessage: vi.fn() });
  const result = await action({ command: 'cc-skills', text: 'set fixture off', threadId: 'fixture-thread' }, services, {} as never, 'skills-flow');
  expect(result.text).toContain('Saved Skill state, but native refresh failed: process closed');
 });

 it('refuses to write when the retained process belongs to another project', async () => {
  const editSkill = vi.fn();
  mockService<Services, 'cli'>('cli', { claudeCode: { getHandle: vi.fn(() => ({})), getConversation: vi.fn(() => ({ owner: { sessionCwd: '/other-project' } })), getWorkingDir: vi.fn(() => '/selected-project'), isConversationBusy: vi.fn(() => false), editSkill } as never });
  mockService<Services, 'chat'>('chat', { sendBlockMessage: vi.fn() });
  const result = await action({ command: 'cc-skills', text: 'set fixture off', threadId: 'fixture-thread' }, services, {} as never, 'skills-flow');
  expect(result.text).toContain('does not match this project'); expect(editSkill).not.toHaveBeenCalled();
 });

 it('reads the selected project instead of a retained process in another directory', async () => {
  const readOld = vi.fn(), listSkills = vi.fn().mockResolvedValue([]);
  mockService<Services, 'cli'>('cli', { claudeCode: { getHandle: vi.fn(() => ({ getSkillsDialog: readOld })), getConversation: vi.fn(() => ({ owner: { sessionCwd: '/old-project' } })), getWorkingDir: vi.fn(() => '/selected-project'), listSkills } as never });
  mockService<Services, 'chat'>('chat', { sendBlockMessage: vi.fn() });
  await action({ command: 'cc-skills', threadId: 'fixture-thread' }, services, {} as never, 'skills-flow');
  expect(readOld).not.toHaveBeenCalled(); expect(listSkills).toHaveBeenCalledWith(undefined);
 });

});
