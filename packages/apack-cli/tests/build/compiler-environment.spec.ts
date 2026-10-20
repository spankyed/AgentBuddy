import { afterEach, expect, it, vi } from 'vitest';
import path from 'node:path';
import { compilerEnvironmentIdentity, compilerLibraryEnvironmentIdentity } from '../../src/build/compiler-environment.ts';
import type { CompilerLibraryEnvironment } from '../../src/build/compiler-native-libraries.ts';
import { compilerExecutionIdentity } from '../../src/build/compiler-startup-inputs.ts';

const nativeEnvironment: CompilerLibraryEnvironment = { macho: {
  libraryPaths: [], fallbackLibraryPaths: undefined, frameworkPaths: [], fallbackFrameworkPaths: undefined, imageSuffixes: [],
} };

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
  const first = compilerExecutionIdentity(nativeEnvironment, '--require first --require second');
  vi.stubEnv('APACK_TEST_CONTENT_INPUT', 'second');
  expect(compilerExecutionIdentity(nativeEnvironment, '--require first --require second')).not.toBe(first);
  vi.stubEnv('APACK_TEST_CONTENT_INPUT', 'first');
  expect(compilerExecutionIdentity(nativeEnvironment, '--require second --require first')).not.toBe(first);
});


it('normalizes native capture locations while preserving search order', () => {
  const captured = path.resolve('private/native'), source = path.resolve('original/native');
  const first: CompilerLibraryEnvironment = { macho: { ...nativeEnvironment.macho,
    libraryPaths: [path.join(captured, 'first'), path.join(captured, 'second')] } };
  const second: CompilerLibraryEnvironment = { macho: { ...nativeEnvironment.macho,
    libraryPaths: [path.join(source, 'first'), path.join(source, 'second')] } };
  expect(compilerLibraryEnvironmentIdentity(first, [{ captured, source }])).toBe(compilerLibraryEnvironmentIdentity(second));
  expect(compilerLibraryEnvironmentIdentity({ macho: { ...second.macho, libraryPaths: [...second.macho.libraryPaths].reverse() } }))
    .not.toBe(compilerLibraryEnvironmentIdentity(second));
});


it('canonicalizes unordered native descriptors after source-path projection', () => {
  const captured = path.resolve('z-captured'), source = path.resolve('a-source'), system = path.resolve('m-system');
  const pe = { systemDirectory: system, windowsDirectory: system, safeSearch: true, devOverride: false,
    knownDlls: ['second.dll', 'first.dll'], nodeApiExports: ['napi_second', 'napi_first'], apiSets: [], schema: path.join(system, 'schema.dll'),
    applicationContext: { image: path.join(captured, 'node.exe'), inputs: [
      { file: path.join(captured, 'node.exe'), kind: 'file' as const, hash: 'a'.repeat(64) },
      { file: path.join(system, 'assembly.manifest'), kind: 'file' as const, hash: 'b'.repeat(64) },
    ], redirections: [{ name: 'second.dll', file: path.join(system, 'second.dll') }, { name: 'first.dll', file: path.join(source, 'first.dll') }] } };
  const first: CompilerLibraryEnvironment = { ...nativeEnvironment, pe };
  const second: CompilerLibraryEnvironment = { ...nativeEnvironment, pe: { ...pe,
    knownDlls: [...pe.knownDlls].reverse(), nodeApiExports: [...pe.nodeApiExports].reverse(),
    applicationContext: { ...pe.applicationContext, image: path.join(source, 'node.exe'),
      inputs: pe.applicationContext.inputs.map(input => ({ ...input, file: input.file === path.join(captured, 'node.exe') ? path.join(source, 'node.exe') : input.file })).reverse(),
      redirections: [...pe.applicationContext.redirections].reverse(),
    },
  } };
  expect(compilerLibraryEnvironmentIdentity(first, [{ captured, source }])).toBe(compilerLibraryEnvironmentIdentity(second));
});
