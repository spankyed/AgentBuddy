import { describe, expect, it } from 'vitest';
import { _packRelationTypes } from '../../src/framework/data-declaration.ts';
import { ManifestSchema, _NativePackDeclarationSchema } from '../../src/framework/declaration-schema.ts';

const pack = { id: 'relation-pack', name: 'Relations', version: '1.0.0' };

describe('relation declarations', () => {
  it('derives existing EARS constants from ordered wire values', () => {
    expect(_packRelationTypes({ data: { relations: ['parent_of', 'has', 'relates_to'] } })).toEqual({
      PARENT_OF: 'parent_of', HAS: 'has', RELATES_TO: 'relates_to',
    });
    expect(_packRelationTypes({})).toEqual({});
  });

  it('refuses duplicate wires before they can collapse into a generated map', () => {
    expect(() => _packRelationTypes({ data: { relations: ['parent_of', 'parent_of'] } }))
      .toThrow('Relation "parent_of" is declared twice in data.relations');
    expect(ManifestSchema.safeParse({ ...pack, data: { relations: ['parent_of', 'parent_of'] } }).success).toBe(false);
    expect(_NativePackDeclarationSchema.safeParse({ id: pack.id, data: { relations: ['parent_of', 'parent_of'] } }).success).toBe(false);
  });

  it.each(['ParentOf', 'parent-of', '', ' parent_of', 'parent_of ', '_parent', 'parent__of', '1parent'])
  ('refuses wires that cannot generate the conventional constant: %j', wire => {
    expect(() => _packRelationTypes({ data: { relations: [wire] } })).toThrow('snake_case wire name');
    expect(ManifestSchema.safeParse({ ...pack, data: { relations: [wire] } }).success).toBe(false);
  });

  it.each(['contains', 'transitions_to', 'instance_of', 'spawned', 'tracked'])
  ('refuses SDK-owned wires in both installed and native declarations: %s', wire => {
    for (const result of [ManifestSchema.safeParse({ ...pack, data: { relations: [wire] } }),
      _NativePackDeclarationSchema.safeParse({ id: pack.id, data: { relations: [wire] } })]) {
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues[0]!.message).toContain('defined by the SDK');
    }
  });

  it('declares relations as wire-value arrays', () => {
    expect(ManifestSchema.safeParse({ ...pack, data: { relations: { PARENT_OF: 'parent_of' } } }).success).toBe(false);
    expect(_NativePackDeclarationSchema.safeParse({ id: pack.id, data: { relations: ['note_link'] } }).success).toBe(true);
  });
});
