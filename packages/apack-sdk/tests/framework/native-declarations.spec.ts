import { describe, expect, it, vi } from 'vitest';
import { build } from 'esbuild';
import { _nativePackDeclarationProblem } from '../../src/framework/declaration-binding.ts';
import { ManifestSchema, _NativePackDeclarationSchema } from '../../src/framework/declaration-schema.ts';
import type { NativePackDeclaration } from '../../src/framework/pack-catalog.ts';

const declaration = {
  id: 'native',
  features: { view: { description: 'Show native items.', designation: 'items' } },
  artifacts: { document: { icon: 'File', fe: 'native/document.vue' } },
  blocks: { answer: { kind: 'input', fe: 'native/answer.vue', be: 'native/block.ts#Answer' } },
  dsl: { items: { entry: 'native/items.ts', targets: ['monaco'], prefix: 'items', globals: { item: 'Item' } } },
} satisfies NativePackDeclaration;

describe('native declaration admission', () => {
  it('shares authored contribution grammar without requiring declared modules', () => {
    const { id, features, ...extensions } = declaration;
    const authored = ManifestSchema.parse({ id, name: 'Native', version: '1.0.0', features, extensions });
    expect(_NativePackDeclarationSchema.parse(declaration)).toEqual({ id, features: authored.features, ...authored.extensions });
    expect(_nativePackDeclarationProblem(declaration)).toBeUndefined();
    for (const contributions of [
      { artifacts: { document: { icon: 'invalid-icon' } } },
      { blocks: { answer: { kind: 'unknown' } } },
      { dsl: { items: { entry: 'native/types.ts#Export', targets: ['monaco'] } } },
    ]) {
      expect(_nativePackDeclarationProblem({ id, ...contributions })).toBeTypeOf('string');
      expect(ManifestSchema.safeParse({ id, name: 'Native', version: '1.0.0', extensions: contributions }).success).toBe(false);
    }
  });

  it('refuses impure declarations before reading accessors or normalizing prototypes', () => {
    const getter = vi.fn(() => 'native');
    expect(_nativePackDeclarationProblem(Object.defineProperty({}, 'id', { get: getter, enumerable: true })))
      .toContain('JSON data properties');
    expect(getter).not.toHaveBeenCalled();
    class Definition { id = 'native'; }
    expect(_nativePackDeclarationProblem(new Definition())).toContain('JSON data properties');
  });

  it('bundles the public framework validator for the browser without Node tooling or pack modules', async () => {
    const result = await build({
      stdin: { contents: "export { _nativePackDeclarationProblem as problem } from '../../src/framework/index.ts'", resolveDir: import.meta.dirname },
      bundle: true, platform: 'browser', format: 'esm', write: false, metafile: true,
    });
    const inputs = Object.keys(result.metafile!.inputs);
    expect(inputs.some(input => input.includes('/src/build/'))).toBe(false);
    expect(inputs.some(input => input.includes('/default-setup/'))).toBe(false);
    const { problem } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
    expect(problem(declaration)).toBeUndefined();
    expect(problem({ ...declaration, blocks: { answer: { kind: 'unknown' } } })).toContain('blocks.answer.kind');
  });
});
