// A test running the shell (startShell) and the pack's systems (startApp) together: the shell binds a frontend host,
// and the backend's lookups (roles, steps) still find what the pack registered, as its systems need them to
import { expect, it } from 'vitest';
import { startShell } from '@abuddy/testing/harness';
import { getDesignated, hasDesignation } from '@abuddy/sdk/designations';
import { stepRegistry } from '@abuddy/sdk/steps';
import logsState from '@/features/logs/fe/state';

it("keeps the backend's roles and steps while a shell is running", async () => {
  await startShell({ plugins: { logs: { state: logsState } } });

  expect(hasDesignation('brain')).toBe(true);
  expect(getDesignated('brain')).toBe('default-setup/brain');
  expect(stepRegistry.get('llm')).toBeDefined();
});
