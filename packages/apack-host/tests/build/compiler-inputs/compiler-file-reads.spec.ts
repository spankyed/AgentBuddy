import { expect, it, vi } from 'vitest';
import { beginCompilerNativeModules } from '../../../src/build/compiler-inputs/compiler-file-reads.ts';

it('preserves omitted and explicit dlopen flags while replacing only the admitted filename', () => {
  const original = process.dlopen;
  const native = vi.fn<typeof process.dlopen>();
  process.dlopen = native;
  const dispose = beginCompilerNativeModules(file => file + '.captured');
  try {
    const module = { exports: {} };
    process.dlopen(module, 'addon.node');
    process.dlopen(module, 'addon.node', 2);
    process.dlopen(module, 'addon.node', undefined);
    expect(native.mock.calls).toEqual([
      [module, 'addon.node.captured'],
      [module, 'addon.node.captured', 2],
      [module, 'addon.node.captured', undefined],
    ]);
  } finally {
    dispose();
    process.dlopen = original;
  }
});
