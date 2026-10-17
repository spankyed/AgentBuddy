import { afterAll, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import { startFeTestRuntime } from '@apackdev/sdk/testing';
import { createSettingsMachine } from '../../../../src/features/settings/fe/machine.ts';

afterAll(startFeTestRuntime({ client: { send() {} } }));

it('submits app resets through injected host administration and reports ingress failures', async () => {
  const reset = vi.fn(async () => { throw new Error('connection closed'); });
  const report = vi.fn();
  const actor = createActor(createSettingsMachine({ reset, report, restart() {} })).start();
  actor.send({ type: 'APP.RESET' });
  actor.send({ type: 'APP.RESET' });
  expect(reset).toHaveBeenCalledTimes(1);
  await Promise.resolve();
  expect(report).toHaveBeenCalledWith('Reset failed: Error: connection closed');
  expect(actor.getSnapshot().context.resetting).toBe(false);
  actor.stop();
});
