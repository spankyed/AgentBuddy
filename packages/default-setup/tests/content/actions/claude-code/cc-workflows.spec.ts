import { mockService } from '@apackdev/testing/harness';
import { services, type Services } from '#generated/services.ts';
import { action } from '../../../../src/content/actions/claude-code/cc-command.ts';
const run = (text?: string) => action({ command: 'cc-workflows', threadId: 'fixture-thread', text }, services, {} as never, 'workflows-flow');
const task = { taskId: 'task', toolUseId: 'tool', name: 'Fixture', status: 'running', phase: 'Review' };
function setup() {
  let tasks = [task], current: unknown;
  const stop = vi.fn().mockResolvedValue(undefined);
  const owner = { busy: true, closing: false, sessionCwd: '/original-project', listWorkflows: () => tasks.map(task => ({ ...task })), handle: { stopTask: stop } };
  current = { owner };
  const query = vi.fn();
  mockService<Services, 'cli'>('cli', { claudeCode: { getConversation: () => current, query } as never });
  mockService<Services, 'chat'>('chat', { sendBlockMessage: vi.fn() });
  return { owner, stop, query, replace: () => { current = undefined; }, setStatus: (status: string) => { tasks = [{ ...task, status }]; } };
}

it('lists owned tasks and their native project without launching a process', async () => {
  const f = setup(), result = await run();
  expect(result.text).toContain('/original-project'); expect(result.text).toContain('task: Fixture — running (Review)');
  expect(result.data).toEqual([task]); expect(f.query).not.toHaveBeenCalled(); expect(f.stop).not.toHaveBeenCalled();
});
it('allows a targeted stop while a foreground turn is busy but does not invent a stopped state', async () => {
  const f = setup(), result = await run('stop task');
  expect(f.owner.busy).toBe(true); expect(f.stop).toHaveBeenCalledWith('task');
  expect(result.text).toContain('Waiting for native task status'); expect(f.owner.listWorkflows()[0].status).toBe('running');
});
it.each(['completed', 'failed', 'stopped'])('reports native %s without stopping a terminal task again', async status => {
  const f = setup(); f.setStatus(status);
  expect((await run('stop task')).text).toContain(`already ${status}`); expect(f.stop).not.toHaveBeenCalled();
});
it('refuses unknown task IDs and invalid syntax without sending a control', async () => {
  const f = setup(); expect((await run('stop foreign-task')).text).toContain('No tracked Workflow');
  expect((await run('stop')).text).toContain('Usage:'); expect(f.stop).not.toHaveBeenCalled();
});
it('distinguishes native refusal, confirmed stopped state and owner replacement races', async () => {
  const f = setup(); f.stop.mockRejectedValueOnce(new Error('native refusal'));
  expect((await run('stop task')).text).toContain('native refusal');
  f.stop.mockImplementationOnce(async () => { f.setStatus('stopped'); }); expect((await run('stop task')).text).toBe('Fixture: stopped.');
  f.setStatus('running'); f.stop.mockImplementationOnce(async () => { f.replace(); }); expect((await run('stop task')).text).toContain('conversation changed');
});
it('does not restart a missing conversation to obtain or stop tasks', async () => {
  const f = setup(); f.replace(); expect((await run('stop task')).text).toContain('status is unavailable'); expect(f.query).not.toHaveBeenCalled(); expect(f.stop).not.toHaveBeenCalled();
});
