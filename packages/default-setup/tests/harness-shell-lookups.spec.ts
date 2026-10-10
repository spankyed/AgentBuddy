// A test running the shell: `startShell` binds a frontend host, and the lookups the two halves share
// (roles, steps, artifacts, blocks) still answer with what the pack's backend registered, as its systems
// need them to. The frontend host is bound *over* the backend one, so without `backendFirst` in the harness
// every one of these would read an empty frontend registry.
import { expect, it } from 'vitest';
import { startShell } from '@abuddy/testing/harness';
import { getDesignated, hasDesignation } from '@abuddy/sdk/designations';
import { stepRegistry } from '@abuddy/sdk/steps';
import logsState from '#features/logs/fe/state.ts';

it("keeps the backend's roles and steps while a shell is running", async () => {
  await startShell({ plugins: { logs: { state: logsState } } });

  expect(hasDesignation('brain')).toBe(true);
  expect(getDesignated('brain')).toBe('default-setup/brain');

  // Its facets, not just the definition: a step reachable by name but stripped of what the backend reads
  // off it is the shape that let every created node lose its field defaults
  expect(stepRegistry.getNode('llm')?.label).toBe('LLM');
  expect(stepRegistry.getBuild('llm')).toBeDefined();
  expect(stepRegistry.createNodeDefaults('schedule')).toMatchObject({ cronExpression: '0 * * * *' });

  // The list lookups answer too, not only the by-name ones
  expect(stepRegistry.types()).toContain('llm');
});
