import { describe, expect, it } from 'vitest';
import { ManifestSchema, _NativePackDeclarationSchema } from '../../src/framework/declaration-schema.ts';
import { _packEntities } from '../../src/framework/data-declaration.ts';

const pack = { id: 'keyed', name: 'Keyed', version: '1.0.0' };
const own = <T>(value: T) => Object.fromEntries([['__proto__', value]]);

describe('keyed declaration preservation', () => {
  it('preserves typed and untyped entity keys across native and authored decoding', () => {
    for (const shape of [null, 'src/types.ts#Entity']) {
      const fields = { data: { entities: own(shape) } };
      const authored = ManifestSchema.parse({ ...pack, ...fields });
      const native = _NativePackDeclarationSchema.parse({ id: pack.id, ...fields });
      expect(_packEntities(authored)).toEqual([{ name: '__proto__', owner: 'data', shape }]);
      expect(_packEntities(native)).toEqual(_packEntities(authored));
      expect(Object.getPrototypeOf(authored.data!.entities)).toBe(Object.prototype);
    }
  });

  it('preserves keyed feature contributions, routes, globals and module targets', () => {
    const fields = { features: { notes: { description: 'Edit notes.', entities: own(null),
      services: own('src/services.ts#service'), repositories: own('src/repositories.ts#repository'),
      plugin: { label: 'Notes', state: 'src/state.ts', canvas: { routes: { toString: 'src/view.vue' } } },
    } }, extensions: { dsl: own({ entry: 'src/types.ts', targets: ['monaco'], globals: own('Item') }),
      appExtensions: own('src/view.vue'), tiptapPlugins: own({ extensions: own('src/editor.ts#Extension'), popups: own('src/popup.vue') }),
    }, content: { writers: own('src/writers.ts#writer') } };
    expect(ManifestSchema.parse({ ...pack, ...fields })).toEqual({ ...pack, ...fields });
  });

  it('validates values under own prototype-like keys at their authored paths', () => {
    const result = ManifestSchema.safeParse({ ...pack, data: { entities: own(17) } });
    expect(result.success).toBe(false);
    if (result.success) throw new Error('Invalid shape accepted');
    expect(result.error.issues.every(issue => issue.path.join('.') === 'data.entities.__proto__')).toBe(true);
  });

  it('names both owners when the preserved wire is declared twice', () => {
    const result = ManifestSchema.safeParse({ ...pack, data: { entities: own(null) },
      features: { notes: { description: 'Edit notes.', entities: own(null) } } });
    expect(result.success).toBe(false);
    if (result.success) throw new Error('Duplicate wire accepted');
    expect(result.error.message).toContain('data');
    expect(result.error.message).toContain('features.notes');
  });
});
