import { expect, it } from 'vitest';
import { assertCompilerTestRunner } from '../_support/compiler-test-runner.ts';

it.each([
  {},
  { CI: 'true' },
  { GITHUB_ACTIONS: 'true' },
  { RUNNER_ENVIRONMENT: 'github-hosted' },
  { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'self-hosted' },
])('refuses Mac integration without a hosted runner: %j', env => {
  expect(() => assertCompilerTestRunner('darwin', env)).toThrow('npm run test:linux');
});

it('allows Mac integration on GitHub-hosted runners', () => {
  expect(() => assertCompilerTestRunner('darwin', { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted' })).not.toThrow();
});

it.each(['linux', 'win32'] as const)('preserves other platform test routes: %s', platform => {
  expect(() => assertCompilerTestRunner(platform, {})).not.toThrow();
});
