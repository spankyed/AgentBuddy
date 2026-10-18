import { createHash } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readCompilerRuntimeInputs } from '../../src/build/compiler-runtime.ts';
import { readPeActivationContext, type CompilerPeActivationContext } from '../../src/build/compiler-pe-activation.ts';

const executable = 'C:\\compiler\\node.exe';
const policy = 'C:\\Windows\\WinSxS\\policy.manifest';
const missing = 'C:\\compiler\\future.manifest';
const directory = 'C:\\Windows\\WinSxS\\policy';
const image = Buffer.from('MZ');
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const context = (policyHash = 'a'.repeat(64)): CompilerPeActivationContext => ({ image: executable, redirections: [], inputs: [
  { file: executable, kind: 'file', hash: hash(image) },
  { file: policy, kind: 'file', hash: policyHash },
  { file: missing, kind: 'missing', hash: null },
  { file: directory, kind: 'entries', hash: 'b'.repeat(64) },
] });

vi.mock('node:path', async importOriginal => {
  const original = await importOriginal<typeof import('node:path')>();
  return { ...original, default: original.win32 };
});
vi.mock('node:fs', () => ({ default: {
  realpathSync: { native: (file: string) => file },
  existsSync: () => true,
  readFileSync: () => Buffer.from('MZ'),
  statSync: () => undefined,
  lstatSync: () => ({ isSymbolicLink: () => false, isDirectory: () => false, isFile: () => true, mode: 0o755 }),
} }));
vi.mock('../../src/build/compiler-pe-environment.ts', () => ({
  readPeSystemDirectory: () => 'C:\\Windows\\System32',
  readPeLoaderMetadata: () => ({ safeSearch: true, devOverride: false, knownDlls: [] }),
}));
vi.mock('../../src/build/compiler-pe-activation.ts', () => ({ readPeActivationContext: vi.fn() }));

beforeEach(() => {
  vi.stubGlobal('process', { ...process, platform: 'win32' });
  vi.mocked(readPeActivationContext).mockReturnValue(context());
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it('observes policy files and repair candidates without copying OS selectors', () => {
  const copied = vi.fn(), observe = vi.fn();
  const before = readCompilerRuntimeInputs(executable, false, copied, observe);
  expect(observe).toHaveBeenCalledWith(policy, 'file');
  expect(observe).toHaveBeenCalledWith(missing, 'file');
  expect(observe).toHaveBeenCalledWith(directory, 'entries');
  expect(copied.mock.calls.map(([file]) => file.source)).toEqual([executable]);
  expect(before.directories).toEqual(['C:\\compiler']);
  vi.mocked(readPeActivationContext).mockReturnValue(context('c'.repeat(64)));
  expect(readCompilerRuntimeInputs(executable, false).hash).not.toBe(before.hash);
});

it('retains selector observations when Windows refuses a context', () => {
  const observe = vi.fn();
  vi.mocked(readPeActivationContext).mockImplementation((_image, options) => {
    options.observe?.read(missing);
    options.observe?.readEntries(directory);
    throw new Error('OS context refusal');
  });
  expect(() => readCompilerRuntimeInputs(executable, false, undefined, observe)).toThrow('OS context refusal');
  expect(observe).toHaveBeenCalledWith(missing, 'file');
  expect(observe).toHaveBeenCalledWith(directory, 'entries');
});
