import { expect, it } from 'vitest';
import { _parseModulePath, _parseModuleReference } from '../../src/framework/module-reference.ts';

it('keeps whole-module paths distinct from export bindings', () => {
  expect(_parseModulePath('src\\public\\types.ts', 'Public types')).toBe('src/public/types.ts');
  for (const target of ['', 'src/types.ts#Shape', 'src/types.ts#']) {
    expect(() => _parseModulePath(target, 'Public types')).toThrow('without an export selector');
  }
});

it('requires a named export unless the caller declares default-export semantics', () => {
  expect(_parseModuleReference('src\\model.ts#Shape', 'Shape'))
    .toEqual({ source: 'src/model.ts', exportName: 'Shape' });
  expect(() => _parseModuleReference('src/model.ts', 'Shape')).toThrow('must name its export');
  expect(_parseModuleReference('src/view.vue', 'View', 'default'))
    .toEqual({ source: 'src/view.vue', exportName: 'default' });
  expect(_parseModuleReference('src/state.ts#machine', 'State', 'default'))
    .toEqual({ source: 'src/state.ts', exportName: 'machine' });
});

it.each(['', '#Shape', 'src/model.ts#', 'src/model.ts#Shape#extra', 'src/model.ts#bad-name'])
  ('rejects malformed references in both caller modes: %s', target => {
    expect(() => _parseModuleReference(target, 'Declaration')).toThrow('Declaration');
    expect(() => _parseModuleReference(target, 'Declaration', 'default')).toThrow('Declaration');
  });
