import { afterEach, expect, it, vi } from 'vitest';
import path from 'node:path';
import { compilerEnvironmentIdentity } from '../../src/build/compiler-environment.ts';
import { compilerExecutionIdentity } from '../../src/build/compiler-startup-inputs.ts';

afterEach(() => vi.unstubAllEnvs());

it('identifies arbitrary compiler environment values and membership without recording them', () => {
  const first = compilerEnvironmentIdentity({ VITE_VALUE: 'first', CUSTOM_CONTENT_INPUT: 'private-value' });
  expect(first).toMatch(/^[a-f0-9]{64}$/);
  expect(first).not.toContain('private-value');
  expect(compilerEnvironmentIdentity({ CUSTOM_CONTENT_INPUT: 'private-value', VITE_VALUE: 'first' })).toBe(first);
  expect(compilerEnvironmentIdentity({ VITE_VALUE: 'second', CUSTOM_CONTENT_INPUT: 'private-value' })).not.toBe(first);
  expect(compilerEnvironmentIdentity({ VITE_VALUE: 'first' })).not.toBe(first);
  expect(compilerEnvironmentIdentity({ VITE_VALUE: '' })).not.toBe(compilerEnvironmentIdentity({ VITE_VALUE: undefined }));
});

it('excludes private transport and temp locations while retaining semantic launch settings', () => {
  expect(compilerEnvironmentIdentity({ APACK_COMPILER_INPUTS: '/one', TMPDIR: '/one', NODE_OPTIONS: '--require one' }))
    .toBe(compilerEnvironmentIdentity({ APACK_COMPILER_INPUTS: '/two', TMPDIR: '/two', NODE_OPTIONS: '--require two' }));
  expect(compilerEnvironmentIdentity({ NODE_ENV: 'production' })).not.toBe(compilerEnvironmentIdentity({ NODE_ENV: 'development' }));
});

it('normalizes owned paths without conflating unrelated paths with the same prefix', () => {
  const captured = path.resolve('private/captured'), source = path.resolve('original');
  const paths = [{ captured, source }];
  expect(compilerEnvironmentIdentity({ ESBUILD_BINARY_PATH: path.join(captured, 'tool') }, paths))
    .toBe(compilerEnvironmentIdentity({ ESBUILD_BINARY_PATH: path.join(source, 'tool') }));
  expect(compilerEnvironmentIdentity({ VALUE: `${captured}-other` }, paths))
    .not.toBe(compilerEnvironmentIdentity({ VALUE: `${source}-other` }));
});

it('includes inherited values in launch identity and keeps NODE_OPTIONS separately ordered', () => {
  vi.stubEnv('APACK_TEST_CONTENT_INPUT', 'first');
  const first = compilerExecutionIdentity('--require first --require second');
  vi.stubEnv('APACK_TEST_CONTENT_INPUT', 'second');
  expect(compilerExecutionIdentity('--require first --require second')).not.toBe(first);
  vi.stubEnv('APACK_TEST_CONTENT_INPUT', 'first');
  expect(compilerExecutionIdentity('--require second --require first')).not.toBe(first);
});
