import { describe, expect, it } from 'vitest';
import { PACK_SNAPSHOT_FORMAT, _snapshotFormatMismatch, type PackSnapshot } from '../../src/build/manifest.ts';
import { parseSnapshot } from '../../src/build/snapshot.ts';
import { _declarationRevision } from '../../src/build/declaration-revision.ts';

const snapshot = (): PackSnapshot => ({
  declarationRevision: _declarationRevision({ id: 'fixture-pack', name: 'Fixture', version: '1.0.0' }),
  format: PACK_SNAPSHOT_FORMAT,
  manifest: { id: 'fixture-pack', name: 'Fixture', version: '1.0.0' },
  types: { entities: {}, relKinds: {} }, defs: {},
});

describe('snapshot data reader', () => {
  it('requires materialized help only for a declared contribution', () => {
    const data = snapshot();
    data.manifest.extensions = { help: { path: 'help' } };
    data.declarationRevision = _declarationRevision(data.manifest);
    expect(parseSnapshot(data).diagnostics[0].code).toBe('snapshot.help.incomplete');
    data.help = [{ id: 'start', title: 'Start', body: 'Details' }];
    expect(parseSnapshot(data).status).toBe('valid');
    data.help.push({ id: 'start', title: 'Duplicate', body: '' });
    expect(parseSnapshot(data).diagnostics[0].message).toContain('Duplicate help article');
  });

  it('refuses foreign feature filters and undeclared help data', () => {
    const data = snapshot();
    data.manifest.extensions = { help: { path: 'help' } };
    data.declarationRevision = _declarationRevision(data.manifest);
    data.help = [{ id: 'start', title: 'Start', body: '', features: ['foreign'] }];
    expect(parseSnapshot(data).diagnostics[0].message).toContain('undeclared feature');
    expect(parseSnapshot({ ...snapshot(), help: [] }).diagnostics[0].message).toContain('undeclared help');
  });
  it('rejects a manifest changed without rebuilding its bindings', () => {
    const data = snapshot();
    data.manifest.name = 'Changed';
    expect(parseSnapshot(data).diagnostics).toMatchObject([{ code: 'snapshot.declarations' }]);
    data.declarationRevision = _declarationRevision(data.manifest);
    expect(parseSnapshot(data).status).toBe('valid');
  });

  it.each([undefined, 'old', 'a'.repeat(63)])('requires a complete declaration identity: %j', declarationRevision => {
    expect(parseSnapshot({ ...snapshot(), declarationRevision }).status).toBe('invalid');
  });

  it('reads all supported fields without changing the artifact', () => {
    const data: PackSnapshot = {
      ...snapshot(), sdkVersion: '0.4.0',
      provenance: { entities: { Memo: 'ancestor' }, plugins: { 'fixture-pack/notes': 'fixture-pack' } },
      flowHelpers: { exports: ['memo'], module: 'export const memo = 1;', types: 'export declare const memo: number;' },
    };
    const before = structuredClone(data);
    expect(parseSnapshot(data)).toEqual({ status: 'valid', diagnostics: [], skippedChecks: [], snapshot: data });
    expect(data).toEqual(before);
  });

  it.each([null, undefined, [], 'snapshot', 7])('refuses non-object artifacts: %j', data => {
    expect(parseSnapshot(data).status).toBe('invalid');
    expect(_snapshotFormatMismatch(data)?.problem).toContain('format (none)');
  });

  it('checks format before interpreting fields from another contract', () => {
    const result = parseSnapshot({ format: PACK_SNAPSHOT_FORMAT + 1, sdkVersion: '9.0.0', manifest: 'new grammar' });
    expect(result.snapshot).toBeUndefined();
    expect(result.diagnostics).toMatchObject([{ code: 'snapshot.format', path: ['format'] }]);
    expect(result.diagnostics[0].message).toContain('SDK 9.0.0');
    expect(result.diagnostics[0].suggestion).toContain('Update');
  });

  it('preserves ordinary record names that resemble object prototype properties', () => {
    const data = JSON.parse(JSON.stringify(snapshot()));
    data.types.entities = JSON.parse('{"__proto__":"__proto__","constructor":"constructor"}');
    data.provenance = { entities: JSON.parse('{"__proto__":"ancestor","constructor":"ancestor"}') };
    expect(Object.keys(parseSnapshot(data).snapshot!.types.entities)).toEqual(['__proto__', 'constructor']);
    expect(Object.keys(parseSnapshot(data).snapshot!.provenance!.entities!)).toEqual(['__proto__', 'constructor']);
    data.types.entities.__proto__ = false;
    expect(parseSnapshot(data).status).toBe('invalid');
  });

  it('checks entity grammar and SDK ownership before decoding original record keys', () => {
    const data = snapshot();
    data.manifest.data = { entities: JSON.parse('{"__proto__":null}') };
    data.declarationRevision = _declarationRevision(data.manifest);
    expect(parseSnapshot(data).status).toBe('valid');
    data.manifest.data.entities = JSON.parse('{"__proto__":"src/types.ts#"}');
    expect(parseSnapshot(data).diagnostics.some(issue => issue.message.includes('path#exportName'))).toBe(true);
    data.manifest.data.entities = { Flow: null };
    expect(parseSnapshot(data).diagnostics.some(issue => issue.message.includes('defined by the SDK'))).toBe(true);
    delete data.manifest.data;
    data.manifest.relKinds = JSON.parse('{"__proto__":"contains"}');
    expect(parseSnapshot(data).diagnostics.some(issue => issue.path.join('.') === 'manifest.relKinds')).toBe(true);
  });

  it.each([
    ['manifest', { id: 'fixture-pack', version: '1.0.0' }, ['manifest', 'name']],
    ['manifest', { id: 'fixture-pack', name: 'Fixture', version: '1.0.0', features: { notes: { plugin: {} } } }, ['manifest', 'features', 'notes', 'plugin', 'label']],
    ['types', {}, ['types', 'entities']],
    ['types', { entities: { Memo: 1 }, relKinds: {} }, ['types', 'entities', 'Memo']],
    ['defs', { 'pack-types': false }, ['defs', 'pack-types']],
    ['flowHelpers', { exports: [], module: '' }, ['flowHelpers', 'types']],
    ['provenance', { unknownKind: {} }, ['provenance', 'unknownKind']],
    ['provenance', { entities: { Memo: false } }, ['provenance', 'entities', 'Memo']],
  ])('refuses malformed %s at its actual path', (field, value, path) => {
    const result = parseSnapshot({ ...snapshot(), [field]: value });
    expect(result.status).toBe('invalid');
    expect(result.snapshot).toBeUndefined();
    expect(result.diagnostics.some(issue => JSON.stringify(issue.path) === JSON.stringify(path))).toBe(true);
  });

  it('refuses unknown fields instead of silently stripping contributions', () => {
    const result = parseSnapshot({ ...snapshot(), futureContribution: {} });
    expect(result.status).toBe('invalid');
    expect(result.diagnostics[0].message).toContain('futureContribution');
  });
});
