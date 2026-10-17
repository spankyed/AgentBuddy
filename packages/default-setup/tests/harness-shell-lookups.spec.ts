// Backend step metadata and providers remain available when the harness also binds a frontend host.
// Shared designations use the harness's backend-first view.
import { expect, it } from 'vitest';
import { startShell } from '@apackdev/testing/harness';
import { getDesignated, hasDesignation } from '@apackdev/sdk/designations';
import { stepRegistry } from '@apackdev/sdk/steps';
import logsState from '#features/logs/fe/state.ts';

it("keeps the backend's roles and steps while a shell is running", async () => {
  await startShell({ plugins: { logs: { state: logsState } } });

  expect(hasDesignation('brain')).toBe(true);
  expect(getDesignated('brain')).toBe('default-setup/brain');

  // Declaration defaults and executable facets have independent readers.
  expect(stepRegistry.getNode('llm')?.label).toBe('LLM');
  expect(stepRegistry.getBuild('llm')).toBeDefined();
  expect(stepRegistry.createNodeDefaults('schedule')).toMatchObject({ cronExpression: '0 * * * *' });

  // The list lookups answer too, not only the by-name ones
  expect(stepRegistry.types()).toContain('llm');
});
